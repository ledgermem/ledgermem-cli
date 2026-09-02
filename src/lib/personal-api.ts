import { CLI_VERSION } from "./version.js";

/**
 * Thin typed REST transport for the personal-memory surfaces (people,
 * reminders, brief, timeline, meetings, merge). The published `getmnemo` SDK
 * (0.5.1) does not expose these resources yet, so — like the MCP server — the
 * CLI owns its own client for them. Same auth plane as the SDK:
 * `Authorization: Bearer`. Every call is container/tenant-scoped by the
 * caller (query or body); this layer never invents a fallback container.
 *
 * Wire shapes are identical to getmnemo 0.6.0's `src/personal/*` resources,
 * so the swap is mechanical once 0.6.0 is on npm:
 *   api.get('/v1/people', q)                → client.people.list(q)
 *   api.get('/v1/people/{slug}')            → client.people.get(slug)
 *   api.post('/v1/people', body)            → client.people.create(body)
 *   api.get('/v1/reminders', q)             → client.reminders.list(q)
 *   api.get('/v1/reminders/upcoming', q)    → client.reminders.upcoming(q)
 *   api.post('/v1/reminders', body)         → client.reminders.create(body)
 *   api.post('/v1/reminders/{id}/complete') → client.reminders.complete(id)
 *   api.get('/v1/brief', q)                 → client.brief.get(q)
 *   api.get('/v1/timeline', q)              → client.timeline.get(q)
 *   api.get('/v1/meetings/upcoming', q)     → client.meetings.upcoming(q)
 *   api.get('/v1/meetings/{id}/brief', q)   → client.meetings.brief(id, q)
 *   api.post('/v1/memories/merge', body)    → client.memories.merge(body)
 */

export type QueryValue = string | number | boolean | undefined;
export type QueryParams = Record<string, QueryValue>;

export interface PersonalApiConfig {
  apiKey: string;
  baseUrl: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

const DEFAULT_TIMEOUT_MS = 30_000;

export class PersonalApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null,
    readonly body: unknown,
  ) {
    super(message);
    this.name = "PersonalApiError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/** Builds `?a=b&c=d` from defined values only (undefined keys are omitted). */
export function buildQuery(params: QueryParams | undefined): string {
  if (!params) return "";
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    search.set(key, String(value));
  }
  const encoded = search.toString();
  return encoded ? `?${encoded}` : "";
}

function errorFromBody(status: number, statusText: string, parsed: unknown): PersonalApiError {
  if (isRecord(parsed)) {
    const rawMessage = parsed.message;
    const code = typeof parsed.code === "string" ? parsed.code : null;
    const message = Array.isArray(rawMessage)
      ? rawMessage.map((m) => String(m)).join("; ")
      : typeof rawMessage === "string"
        ? rawMessage
        : null;
    if (message) {
      return new PersonalApiError(code ? `${message} (${code})` : message, status, code, parsed);
    }
  }
  return new PersonalApiError(`HTTP ${status} ${statusText}`.trim(), status, null, parsed);
}

export class PersonalApi {
  readonly #baseUrl: string;
  readonly #apiKey: string;
  readonly #timeoutMs: number;
  readonly #fetch: typeof fetch;

  constructor(cfg: PersonalApiConfig) {
    this.#baseUrl = cfg.baseUrl.replace(/\/+$/, "");
    this.#apiKey = cfg.apiKey;
    this.#timeoutMs = cfg.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    // Resolve lazily so tests that stub the global fetch after construction
    // still hit the mock.
    this.#fetch = cfg.fetchImpl ?? ((input, init) => fetch(input, init));
  }

  get<T>(path: string, query?: QueryParams): Promise<T> {
    return this.#request<T>("GET", path, query);
  }

  post<T>(path: string, body?: unknown, query?: QueryParams): Promise<T> {
    return this.#request<T>("POST", path, query, body);
  }

  async #request<T>(method: string, path: string, query?: QueryParams, body?: unknown): Promise<T> {
    const url = `${this.#baseUrl}${path}${buildQuery(query)}`;
    const headers: Record<string, string> = {
      authorization: `Bearer ${this.#apiKey}`,
      "user-agent": `getmnemo-cli/${CLI_VERSION}`,
      accept: "application/json",
    };
    const serializedBody = body === undefined ? undefined : JSON.stringify(body);
    if (serializedBody !== undefined) headers["content-type"] = "application/json";

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.#timeoutMs);
    try {
      const res = await this.#fetch(url, {
        method,
        headers,
        body: serializedBody,
        signal: ctrl.signal,
      });
      const text = await res.text();
      const parsed: unknown = text ? safeJson(text) : undefined;
      if (!res.ok) throw errorFromBody(res.status, res.statusText, parsed);
      return parsed as T;
    } catch (err) {
      if (err instanceof PersonalApiError) throw err;
      if (err instanceof Error && err.name === "AbortError") {
        throw new PersonalApiError(`Request timed out after ${this.#timeoutMs}ms`, 0, "TIMEOUT", null);
      }
      const message = err instanceof Error ? err.message : String(err);
      throw new PersonalApiError(`Network error: ${message}`, 0, "NETWORK", null);
    } finally {
      clearTimeout(timer);
    }
  }
}
