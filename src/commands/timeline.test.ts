import { describe, expect, it, vi } from "vitest";
import { installHarness, jsonResponse, mockFetch, requestAt, run, runExpectingExit, TEST_BASE_URL } from "../test/harness.js";

const TIMELINE = {
  items: [
    { id: "memory:m1", type: "memory", refId: "m1", occurredAt: "2026-09-02T20:00:00.000Z", title: "Met Bob about the Q4 plan", snippet: null, containerTag: "user:me", createdBy: { kind: "user", id: "u", label: null }, meta: { memoryType: "note" } },
    { id: "document:d1", type: "document", refId: "d1", occurredAt: "2026-09-01T10:00:00.000Z", title: "Sync with Jane", snippet: "Agenda: pricing", containerTag: "user:me", createdBy: null, meta: { provider: "google_calendar" } },
  ],
  nextCursor: "cur2",
  container: { tag: "user:me", containerType: "user", displayName: null },
  range: { from: null, to: null },
};

describe("getmnemo timeline", () => {
  const out = installHarness();

  it("GETs /v1/timeline with every filter", async () => {
    const fetchMock = mockFetch(jsonResponse(TIMELINE));
    await run([
      "--json", "timeline", "--container", "user:me", "--from", "2026-09-01T00:00:00Z", "--to", "2026-09-03T00:00:00Z",
      "--types", "memory,document,memory", "--direction", "asc", "--limit", "20", "--cursor", "c1",
    ]);
    const req = requestAt(fetchMock);
    expect(req.method).toBe("GET");
    expect(req.url).toBe(
      `${TEST_BASE_URL}/v1/timeline?containerTag=user%3Ame&from=2026-09-01T00%3A00%3A00Z&to=2026-09-03T00%3A00%3A00Z&types=memory%2Cdocument&direction=asc&limit=20&cursor=c1`,
    );
    expect(JSON.parse(out.stdout())).toMatchObject({ nextCursor: "cur2" });
  });

  it("uses the config/env container and desc default; renders rows", async () => {
    vi.stubEnv("GETMNEMO_CONTAINER", "user:env");
    const fetchMock = mockFetch(jsonResponse(TIMELINE));
    await run(["timeline"]);
    expect(requestAt(fetchMock).url).toBe(`${TEST_BASE_URL}/v1/timeline?containerTag=user%3Aenv&direction=desc&limit=50`);
    expect(out.stdout()).toMatch(/2026-09-02 20:00Z.*memory.*Met Bob about the Q4 plan/);
    expect(out.stdout()).toMatch(/document.*Sync with Jane.*Agenda: pricing/);
    expect(out.stdout()).toMatch(/more: --cursor cur2/);
  });

  it("exits 2 without a container", async () => {
    const fetchMock = mockFetch();
    await runExpectingExit(["timeline"], 2);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(out.stderr()).toMatch(/A container is required/);
  });

  it("rejects unknown --types and --direction before any request", async () => {
    const fetchMock = mockFetch();
    await runExpectingExit(["timeline", "--container", "user:me", "--types", "memory,photo"], 2);
    await runExpectingExit(["timeline", "--container", "user:me", "--direction", "sideways"], 2);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(out.stderr()).toMatch(/--types must be a comma-separated subset of: memory, reminder, document, event/);
    expect(out.stderr()).toMatch(/--direction must be one of: desc, asc/);
  });

  it("prints an empty hint for an unknown container (API returns items: [])", async () => {
    mockFetch(jsonResponse({ items: [], nextCursor: null, container: null, range: { from: null, to: null } }));
    await run(["timeline", "--container", "user:ghost"]);
    expect(out.stdout()).toMatch(/Nothing on the timeline for user:ghost/);
  });
});
