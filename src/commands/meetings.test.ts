import { describe, expect, it } from "vitest";
import { installHarness, jsonResponse, mockFetch, requestAt, run, runExpectingExit, TEST_BASE_URL } from "../test/harness.js";

const MEETING = {
  documentId: "11111111-1111-4111-8111-111111111111",
  eventId: "e1",
  title: "Sync with Jane",
  start: "2026-09-03T10:00:00+05:00",
  end: "2026-09-03T10:30:00+05:00",
  isAllDay: false,
  status: "confirmed",
  htmlLink: null,
  location: "Zoom",
  organizer: { email: "me@example.com", name: "Me" },
  attendees: [
    { email: "me@example.com", name: "Me", responseStatus: "accepted", self: true, person: null },
    { email: "jane@example.com", name: "Jane", responseStatus: "accepted", self: false, person: { slug: "jane-doe", displayName: "Jane Doe" } },
  ],
  containerTag: "calendar:primary",
  connectionId: "c1",
  attendeeSource: "metadata",
};

describe("getmnemo meetings", () => {
  const out = installHarness();

  describe("upcoming", () => {
    it("GETs /v1/meetings/upcoming with days, limit, cursor and container", async () => {
      const fetchMock = mockFetch(jsonResponse({ items: [MEETING], nextCursor: null, connections: [{ id: "c1", containerTag: "calendar:primary", status: "active", lastSyncAt: null }] }));
      await run(["--json", "meetings", "upcoming", "--days", "3", "--limit", "5", "--cursor", "x", "--container", "calendar:primary"]);
      expect(requestAt(fetchMock).url).toBe(`${TEST_BASE_URL}/v1/meetings/upcoming?days=3&limit=5&cursor=x&containerTag=calendar%3Aprimary`);
      expect(JSON.parse(out.stdout())).toMatchObject({ items: [{ documentId: MEETING.documentId }] });
    });

    it("renders rows with resolved people; defaults days=7", async () => {
      const fetchMock = mockFetch(jsonResponse({ items: [MEETING], nextCursor: null, connections: [{ id: "c1", containerTag: "calendar:primary", status: "active", lastSyncAt: null }] }));
      await run(["meetings", "upcoming"]);
      expect(requestAt(fetchMock).url).toBe(`${TEST_BASE_URL}/v1/meetings/upcoming?days=7&limit=50`);
      expect(out.stdout()).toMatch(/Sync with Jane/);
      expect(out.stdout()).toMatch(/Jane Doe \(jane-doe\)/);
      expect(out.stdout()).not.toMatch(/Me/);
    });

    it("tells the user to connect a calendar when there are no connections", async () => {
      mockFetch(jsonResponse({ items: [], nextCursor: null, connections: [] }));
      await run(["meetings", "upcoming"]);
      expect(out.stdout()).toMatch(/No calendar connected/);
    });

    it("rejects --days above 30", async () => {
      const fetchMock = mockFetch();
      await runExpectingExit(["meetings", "upcoming", "--days", "31"], 2);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("brief", () => {
    const BRIEF = {
      ...MEETING,
      brief: { answer: "Jane wants the revised pricing before Friday.", citations: [], abstained: false, cached: false },
      people: [{ slug: "jane-doe", displayName: "Jane Doe", relationship: "client", openReminders: [], recentMemories: [{ id: "m1", content: "Jane asked for SOC 2 timeline", memoryType: "note", metadata: null, createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z", dueAt: null, createdBy: null }] }],
      previousMeetings: [{ documentId: "22222222-2222-4222-8222-222222222222", title: "Kickoff", start: "2026-08-20T10:00:00+05:00" }],
      generatedAt: "2026-09-03T01:00:00.000Z",
    };

    it("GETs /v1/meetings/{id}/brief with an optional question", async () => {
      const fetchMock = mockFetch(jsonResponse(BRIEF));
      await run(["--json", "meetings", "brief", MEETING.documentId, "-q", "what did we promise?"]);
      expect(requestAt(fetchMock).url).toBe(`${TEST_BASE_URL}/v1/meetings/${MEETING.documentId}/brief?q=what+did+we+promise%3F`);
      expect(JSON.parse(out.stdout())).toMatchObject({ brief: { abstained: false } });
    });

    it("renders brief, people and previous meetings", async () => {
      const fetchMock = mockFetch(jsonResponse(BRIEF));
      await run(["meetings", "brief", MEETING.documentId]);
      expect(requestAt(fetchMock).url).toBe(`${TEST_BASE_URL}/v1/meetings/${MEETING.documentId}/brief`);
      const text = out.stdout();
      expect(text).toMatch(/Sync with Jane/);
      expect(text).toMatch(/Zoom/);
      expect(text).toMatch(/Jane wants the revised pricing before Friday/);
      expect(text).toMatch(/Jane asked for SOC 2 timeline/);
      expect(text).toMatch(/Previous meetings/);
      expect(text).toMatch(/Kickoff/);
    });

    it("surfaces MEETING_NOT_FOUND", async () => {
      mockFetch(jsonResponse({ statusCode: 404, code: "MEETING_NOT_FOUND", message: "Meeting not found", error: "Not Found" }, 404));
      await expect(run(["meetings", "brief", MEETING.documentId])).rejects.toMatchObject({ status: 404, code: "MEETING_NOT_FOUND" });
    });
  });
});
