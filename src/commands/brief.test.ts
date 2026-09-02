import { describe, expect, it, vi } from "vitest";
import { installHarness, jsonResponse, mockFetch, requestAt, run, runExpectingExit, TEST_BASE_URL } from "../test/harness.js";

const REMINDER = {
  id: "r1", content: "Send Jane the proposal", memoryType: "reminder", metadata: null,
  createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z",
  dueAt: "2026-09-03T09:00:00.000Z", createdBy: null, completedAt: null,
  person: { slug: "jane-doe", displayName: "Jane Doe" },
};

const BRIEF = {
  date: "2026-09-03",
  timezone: "Asia/Karachi",
  generatedAt: "2026-09-03T01:00:00.000Z",
  scope: { kind: "container", containerTag: "user:me" },
  reminders: { overdue: [], dueToday: [REMINDER], upcoming: [] },
  importantDates: [],
  recentMemories: [
    { id: "m1", content: "Met Bob about the Q4 plan", memoryType: "note", metadata: null, createdAt: "2026-09-02T20:00:00.000Z", updatedAt: "2026-09-02T20:00:00.000Z", dueAt: null, createdBy: { kind: "api_key", id: "k", label: "Chrome extension" } },
  ],
  counts: { memoriesLast24h: 1, documentsLast24h: 0 },
  followUps: { answer: "You promised Bob a draft by Friday.", citations: [], abstained: false, cached: true },
  meetings: [
    { documentId: "d1", eventId: "e1", title: "Sync with Jane", start: "2026-09-03T10:00:00+05:00", end: null, isAllDay: false, status: "confirmed", htmlLink: null, location: null, organizer: null, attendees: [{ email: "jane@example.com", name: "Jane", responseStatus: null, self: false, person: { slug: "jane-doe", displayName: "Jane Doe" } }], containerTag: "calendar:x", connectionId: "c", attendeeSource: "metadata" },
  ],
};

describe("getmnemo brief", () => {
  const out = installHarness();

  it("GETs /v1/brief with container, date, timezone, days and sections", async () => {
    const fetchMock = mockFetch(jsonResponse(BRIEF));
    await run(["--json", "brief", "--container", "user:me", "--date", "2026-09-03", "--timezone", "Asia/Karachi", "--days", "3", "--sections", "core,meetings,core"]);
    const req = requestAt(fetchMock);
    expect(req.method).toBe("GET");
    expect(req.url).toBe(`${TEST_BASE_URL}/v1/brief?containerTag=user%3Ame&date=2026-09-03&timezone=Asia%2FKarachi&days=3&sections=core%2Cmeetings`);
    expect(JSON.parse(out.stdout())).toMatchObject({ date: "2026-09-03" });
  });

  it("resolves the container from GETMNEMO_CONTAINER and defaults timezone/days", async () => {
    vi.stubEnv("GETMNEMO_CONTAINER", "user:env");
    const fetchMock = mockFetch(jsonResponse(BRIEF));
    await run(["brief"]);
    const tz = encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone);
    expect(requestAt(fetchMock).url).toBe(`${TEST_BASE_URL}/v1/brief?containerTag=user%3Aenv&timezone=${tz}&days=7`);
    const text = out.stdout();
    expect(text).toMatch(/Daily brief — 2026-09-03/);
    expect(text).toMatch(/Due today/);
    expect(text).toMatch(/Send Jane the proposal/);
    expect(text).toMatch(/Today's meetings/);
    expect(text).toMatch(/Sync with Jane/);
    expect(text).toMatch(/Follow-ups & promises/);
    expect(text).toMatch(/You promised Bob a draft by Friday/);
    expect(text).toMatch(/Captured in the last 24h/);
    expect(text).toMatch(/Met Bob about the Q4 plan/);
    expect(text).toMatch(/Chrome extension/);
    expect(text).toMatch(/1 memories, 0 documents in the last 24h/);
    expect(text).not.toMatch(/Overdue/);
  });

  it("exits 2 without a container before any request", async () => {
    const fetchMock = mockFetch();
    await runExpectingExit(["--json", "brief"], 2);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(out.stdout()).toMatch(/"error": "container_required"/);
  });

  it("rejects a bad --date and unknown --sections before any request", async () => {
    const fetchMock = mockFetch();
    await runExpectingExit(["brief", "--container", "user:me", "--date", "03/09/2026"], 2);
    await runExpectingExit(["brief", "--container", "user:me", "--sections", "core,weather"], 2);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(out.stderr()).toMatch(/--date must be YYYY-MM-DD/);
    expect(out.stderr()).toMatch(/--sections must be a comma-separated subset/);
  });

  it("renders the abstained follow-ups copy and the empty-state fallback for a fully empty brief", async () => {
    mockFetch(jsonResponse({ ...BRIEF, reminders: { overdue: [], dueToday: [], upcoming: [] }, importantDates: [], recentMemories: [], meetings: null, counts: null, followUps: { answer: "", citations: [], abstained: true, cached: false } }));
    await run(["brief", "--container", "user:me"]);
    expect(out.stdout()).toMatch(/Nothing outstanding that I can find/);
    expect(out.stderr() + out.stdout()).toMatch(/Nothing to report today/);
  });

  it("renders the empty-state fallback when every section is null", async () => {
    mockFetch(jsonResponse({ ...BRIEF, reminders: null, importantDates: null, recentMemories: null, meetings: null, counts: null, followUps: null }));
    await run(["brief", "--container", "user:me"]);
    expect(out.stderr() + out.stdout()).toMatch(/Nothing to report today/);
    expect(out.stdout()).not.toMatch(/Follow-ups & promises/);
  });

  it("does not print the empty-state fallback when follow-ups has an answer", async () => {
    mockFetch(jsonResponse({ ...BRIEF, reminders: { overdue: [], dueToday: [], upcoming: [] }, importantDates: [], recentMemories: [], meetings: null, counts: null }));
    await run(["brief", "--container", "user:me"]);
    expect(out.stdout()).toMatch(/You promised Bob a draft by Friday/);
    expect(out.stderr() + out.stdout()).not.toMatch(/Nothing to report today/);
  });

  it("surfaces FEATURE_DISABLED (503) as a coded error", async () => {
    mockFetch(jsonResponse({ statusCode: 503, code: "FEATURE_DISABLED", message: "brief is not enabled for this deployment.", error: "Service Unavailable" }, 503));
    await expect(run(["brief", "--container", "user:me"])).rejects.toMatchObject({ status: 503, code: "FEATURE_DISABLED" });
  });
});
