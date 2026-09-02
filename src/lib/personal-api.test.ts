import { describe, expect, it, vi, afterEach } from "vitest";
import { PersonalApi, PersonalApiError } from "./personal-api.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("PersonalApi transport", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("GET builds the query string, skips undefined values and sends auth headers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ items: [] }));
    vi.stubGlobal("fetch", fetchMock);
    const api = new PersonalApi({ apiKey: "mk_1", baseUrl: "https://api.test.invalid/" });

    const result = await api.get<{ items: unknown[] }>("/v1/people", {
      q: "jane",
      limit: 20,
      cursor: undefined,
      includeArchived: true,
    });

    expect(result).toEqual({ items: [] });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.test.invalid/v1/people?q=jane&limit=20&includeArchived=true");
    expect(init.method).toBe("GET");
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer mk_1");
    expect(headers["user-agent"]).toMatch(/^getmnemo-cli\/\d+\.\d+\.\d+/);
    expect(init.body).toBeUndefined();
  });

  it("POST serialises the body as JSON with content-type", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: "x" }, 201));
    vi.stubGlobal("fetch", fetchMock);
    const api = new PersonalApi({ apiKey: "mk_1", baseUrl: "https://api.test.invalid" });

    await api.post("/v1/people", { displayName: "Jane", email: undefined });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["content-type"]).toBe("application/json");
    expect(JSON.parse(String(init.body))).toEqual({ displayName: "Jane" });
  });

  it("POST without a body sends no content-type and no body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const api = new PersonalApi({ apiKey: "mk_1", baseUrl: "https://api.test.invalid" });

    await api.post("/v1/reminders/abc/complete");

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.body).toBeUndefined();
    expect((init.headers as Record<string, string>)["content-type"]).toBeUndefined();
  });

  it("maps an API error envelope to PersonalApiError with status + code", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        { statusCode: 503, error: "Service Unavailable", code: "FEATURE_DISABLED", message: "people is not enabled for this deployment." },
        503,
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const api = new PersonalApi({ apiKey: "mk_1", baseUrl: "https://api.test.invalid" });

    const err = await api.get("/v1/people").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PersonalApiError);
    const apiErr = err as PersonalApiError;
    expect(apiErr.status).toBe(503);
    expect(apiErr.code).toBe("FEATURE_DISABLED");
    expect(apiErr.message).toBe("people is not enabled for this deployment. (FEATURE_DISABLED)");
  });

  it("joins array messages from class-validator 400s", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ statusCode: 400, message: ["displayName must be shorter", "property foo should not exist"], error: "Bad Request" }, 400),
    );
    vi.stubGlobal("fetch", fetchMock);
    const api = new PersonalApi({ apiKey: "mk_1", baseUrl: "https://api.test.invalid" });

    const err = (await api.post("/v1/people", {}).catch((e: unknown) => e)) as PersonalApiError;
    expect(err.status).toBe(400);
    expect(err.code).toBeNull();
    expect(err.message).toBe("displayName must be shorter; property foo should not exist");
  });

  it("falls back to HTTP status text when the error body is not JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("<html>nope</html>", { status: 502, statusText: "Bad Gateway" }));
    vi.stubGlobal("fetch", fetchMock);
    const api = new PersonalApi({ apiKey: "mk_1", baseUrl: "https://api.test.invalid" });

    const err = (await api.get("/v1/brief").catch((e: unknown) => e)) as PersonalApiError;
    expect(err.status).toBe(502);
    expect(err.message).toBe("HTTP 502 Bad Gateway");
  });

  it("returns undefined for an empty 2xx body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const api = new PersonalApi({ apiKey: "mk_1", baseUrl: "https://api.test.invalid" });
    await expect(api.get("/v1/x")).resolves.toBeUndefined();
  });

  it("surfaces a timeout as PersonalApiError with status 0", async () => {
    const fetchMock = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          const e = new Error("aborted");
          e.name = "AbortError";
          reject(e);
        });
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const api = new PersonalApi({ apiKey: "mk_1", baseUrl: "https://api.test.invalid", timeoutMs: 5 });
    const err = (await api.get("/v1/brief").catch((e: unknown) => e)) as PersonalApiError;
    expect(err).toBeInstanceOf(PersonalApiError);
    expect(err.status).toBe(0);
    expect(err.message).toMatch(/timed out after 5ms/);
  });
});
