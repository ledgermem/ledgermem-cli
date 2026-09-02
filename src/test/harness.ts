import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, vi } from "vitest";
import { buildCli } from "../cli.js";

/**
 * Shared vitest harness for command specs: captures stdout/stderr, points
 * HOME at a nonexistent dir (so a developer's real ~/.getmnemo/config.json
 * cannot leak into assertions), stubs auth env, and mocks the global fetch
 * transport so every spec asserts the exact wire request.
 */
export interface Captured {
  readonly stdout: () => string;
  readonly stderr: () => string;
}

export const TEST_BASE_URL = "https://api.test.invalid";

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function installHarness(): Captured {
  let stdout = "";
  let stderr = "";
  let writeStdout: typeof process.stdout.write;
  let writeStderr: typeof process.stderr.write;

  beforeEach(() => {
    stdout = "";
    stderr = "";
    writeStdout = process.stdout.write.bind(process.stdout);
    writeStderr = process.stderr.write.bind(process.stderr);
    process.stdout.write = ((chunk: string | Uint8Array) => {
      stdout += typeof chunk === "string" ? chunk : chunk.toString();
      return true;
    }) as typeof process.stdout.write;
    process.stderr.write = ((chunk: string | Uint8Array) => {
      stderr += typeof chunk === "string" ? chunk : chunk.toString();
      return true;
    }) as typeof process.stderr.write;
    vi.stubEnv("HOME", join(tmpdir(), "getmnemo-cli-test-home-nonexistent"));
    vi.stubEnv("GETMNEMO_API_KEY", "mk_test_key");
    vi.stubEnv("GETMNEMO_WORKSPACE_ID", "ws_test");
    vi.stubEnv("GETMNEMO_API_URL", TEST_BASE_URL);
    vi.stubEnv("GETMNEMO_CONTAINER", undefined);
  });

  afterEach(() => {
    process.stdout.write = writeStdout;
    process.stderr.write = writeStderr;
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  return { stdout: () => stdout, stderr: () => stderr };
}

export type FetchMock = ReturnType<typeof vi.fn>;

export function mockFetch(...responses: Response[]): FetchMock {
  const fetchMock = vi.fn();
  for (const res of responses) fetchMock.mockResolvedValueOnce(res);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

export interface CapturedRequest {
  readonly url: string;
  readonly method: string;
  readonly headers: Record<string, string>;
  readonly body: unknown;
}

export function requestAt(fetchMock: FetchMock, index = 0): CapturedRequest {
  const call = fetchMock.mock.calls[index];
  if (!call) throw new Error(`fetch call #${index} was never made`);
  const init = (call[1] ?? {}) as RequestInit;
  const rawHeaders = init.headers;
  const headers: Record<string, string> = {};
  if (rawHeaders && typeof rawHeaders === "object" && !Array.isArray(rawHeaders)) {
    for (const [k, v] of Object.entries(rawHeaders as Record<string, string>)) {
      headers[k.toLowerCase()] = v;
    }
  }
  const body = typeof init.body === "string" ? (JSON.parse(init.body) as unknown) : undefined;
  return { url: String(call[0]), method: init.method ?? "GET", headers, body };
}

/** Mocks process.exit to throw so the spec can assert the code without dying. */
export function mockExit(): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(process, "exit").mockImplementation((() => {
    throw new Error("__exit__");
  }) as never);
}

export async function run(argv: string[]): Promise<void> {
  const program = buildCli();
  program.exitOverride();
  await program.parseAsync(["node", "getmnemo", ...argv]);
}

export async function runExpectingExit(argv: string[], code: number): Promise<void> {
  const exitSpy = mockExit();
  await expect(run(argv)).rejects.toThrow("__exit__");
  expect(exitSpy).toHaveBeenCalledWith(code);
}
