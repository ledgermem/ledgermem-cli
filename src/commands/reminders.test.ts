import { describe, expect, it, vi } from "vitest";
import { installHarness, jsonResponse, mockFetch, requestAt, run, runExpectingExit, TEST_BASE_URL } from "../test/harness.js";

const REMINDER = {
  id: "r1",
  content: "Send Jane the proposal",
  memoryType: "reminder",
  metadata: null,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
  dueAt: "2026-09-05T09:00:00.000Z",
  createdBy: { kind: "api_key", id: "k1", label: "cli" },
  completedAt: null,
  person: { slug: "jane-doe", displayName: "Jane Doe" },
};

describe("getmnemo reminders", () => {
  const out = installHarness();

  describe("list", () => {
    it("GETs /v1/reminders with every filter", async () => {
      const fetchMock = mockFetch(jsonResponse({ items: [REMINDER], nextCursor: null, total: 1 }));
      await run([
        "--json", "reminders", "list", "--status", "all", "--days", "30",
        "--due-after", "2026-09-01T00:00:00Z", "--due-before", "2026-10-01T00:00:00Z",
        "--container", "person:jane-doe", "--container-type", "person", "--limit", "5", "--cursor", "cur",
      ]);
      expect(requestAt(fetchMock).url).toBe(
        `${TEST_BASE_URL}/v1/reminders?status=all&days=30&dueAfter=2026-09-01T00%3A00%3A00Z&dueBefore=2026-10-01T00%3A00%3A00Z&containerTag=person%3Ajane-doe&containerType=person&limit=5&cursor=cur`,
      );
      expect(JSON.parse(out.stdout())).toMatchObject({ items: [{ id: "r1" }] });
    });

    it("defaults to status=open and does NOT apply GETMNEMO_CONTAINER (tenant-wide list)", async () => {
      vi.stubEnv("GETMNEMO_CONTAINER", "user:env");
      const fetchMock = mockFetch(jsonResponse({ items: [REMINDER], nextCursor: null, total: 1 }));
      await run(["reminders", "list"]);
      expect(requestAt(fetchMock).url).toBe(`${TEST_BASE_URL}/v1/reminders?status=open&limit=50`);
      expect(out.stdout()).toMatch(/r1/);
      expect(out.stdout()).toMatch(/2026-09-05 09:00Z/);
      expect(out.stdout()).toMatch(/Send Jane the proposal/);
      expect(out.stdout()).toMatch(/Jane Doe/);
    });

    it("rejects an unknown --status before any request", async () => {
      const fetchMock = mockFetch();
      await runExpectingExit(["reminders", "list", "--status", "done"], 2);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(out.stderr()).toMatch(/--status must be one of: open, completed, all/);
    });

    it("rejects a non-ISO --due-after before any request", async () => {
      const fetchMock = mockFetch();
      await runExpectingExit(["--json", "reminders", "list", "--due-after", "next tuesday"], 2);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(out.stdout()).toMatch(/invalid_argument/);
    });
  });

  describe("upcoming", () => {
    const BUCKETS = {
      overdue: [{ ...REMINDER, id: "r0", dueAt: "2026-08-30T09:00:00.000Z" }],
      dueToday: [REMINDER],
      upcoming: [],
      importantDates: [{ personSlug: "jane-doe", displayName: "Jane Doe", label: "birthday", date: "2026-09-04", daysUntil: 1, recurring: true }],
      generatedAt: "2026-09-03T00:00:00.000Z",
      timezone: "Asia/Karachi",
    };

    it("GETs /v1/reminders/upcoming with explicit days + timezone", async () => {
      const fetchMock = mockFetch(jsonResponse(BUCKETS));
      await run(["--json", "reminders", "upcoming", "--days", "14", "--timezone", "Asia/Karachi", "--limit", "10"]);
      expect(requestAt(fetchMock).url).toBe(`${TEST_BASE_URL}/v1/reminders/upcoming?days=14&timezone=Asia%2FKarachi&limit=10`);
    });

    it("defaults timezone to the system timezone and days to 7", async () => {
      const fetchMock = mockFetch(jsonResponse(BUCKETS));
      await run(["reminders", "upcoming"]);
      const tz = encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone);
      expect(requestAt(fetchMock).url).toBe(`${TEST_BASE_URL}/v1/reminders/upcoming?days=7&timezone=${tz}&limit=50`);
      expect(out.stdout()).toMatch(/Overdue/);
      expect(out.stdout()).toMatch(/Due today/);
      expect(out.stdout()).not.toMatch(/Coming up/);
      expect(out.stdout()).toMatch(/Important dates/);
      expect(out.stdout()).toMatch(/Jane Doe — birthday \(tomorrow\)/);
    });

    it("prints a quiet message when every bucket is empty", async () => {
      mockFetch(jsonResponse({ ...BUCKETS, overdue: [], dueToday: [], importantDates: [] }));
      await run(["reminders", "upcoming"]);
      expect(out.stdout()).toMatch(/Nothing due in the next 7 days/);
    });

    it("rejects --days above 90", async () => {
      const fetchMock = mockFetch();
      await runExpectingExit(["reminders", "upcoming", "--days", "91"], 2);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("add", () => {
    it("POSTs /v1/reminders with personSlug when --person is given", async () => {
      const fetchMock = mockFetch(jsonResponse(REMINDER, 201));
      await run([
        "reminders", "add", "Send Jane the proposal", "--due", "2026-09-05T09:00:00Z",
        "--person", "jane-doe", "--idempotency-key", "prop-1", "-m", "channel=email",
      ]);
      const req = requestAt(fetchMock);
      expect(req.method).toBe("POST");
      expect(req.url).toBe(`${TEST_BASE_URL}/v1/reminders`);
      expect(req.body).toEqual({
        content: "Send Jane the proposal",
        dueAt: "2026-09-05T09:00:00Z",
        personSlug: "jane-doe",
        idempotencyKey: "prop-1",
        metadata: { channel: "email" },
      });
      expect(out.stdout()).toMatch(/Reminder r1 due 2026-09-05 09:00Z/);
    });

    it("POSTs with containerTag resolved from GETMNEMO_CONTAINER when no --person", async () => {
      vi.stubEnv("GETMNEMO_CONTAINER", "user:me");
      const fetchMock = mockFetch(jsonResponse(REMINDER, 201));
      await run(["--json", "reminders", "add", "Renew passport", "--due", "2026-12-01"]);
      expect(requestAt(fetchMock).body).toEqual({ content: "Renew passport", dueAt: "2026-12-01", containerTag: "user:me" });
    });

    it("exits 2 when neither --person nor a container resolves", async () => {
      const fetchMock = mockFetch();
      await runExpectingExit(["--json", "reminders", "add", "x", "--due", "2026-12-01"], 2);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(out.stdout()).toMatch(/"error": "container_required"/);
    });

    it("exits 2 when both --person and --container are given", async () => {
      const fetchMock = mockFetch();
      await runExpectingExit(["reminders", "add", "x", "--due", "2026-12-01", "--person", "jane", "--container", "user:me"], 2);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(out.stderr()).toMatch(/not both/);
    });

    it("exits 2 on an unparseable --due", async () => {
      const fetchMock = mockFetch();
      await runExpectingExit(["reminders", "add", "x", "--due", "tomorrow", "--person", "jane"], 2);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(out.stderr()).toMatch(/--due must be an ISO-8601/);
    });

    it("fails when --due is missing (commander mandatory option)", async () => {
      const fetchMock = mockFetch();
      await runExpectingExit(["reminders", "add", "x", "--person", "jane"], 1);
      expect(out.stderr()).toMatch(/required option '--due <iso>' not specified/);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("complete", () => {
    it("POSTs /v1/reminders/{id}/complete with no body", async () => {
      const fetchMock = mockFetch(jsonResponse({ ...REMINDER, dueAt: null, completedAt: "2026-09-03T10:00:00.000Z" }));
      await run(["reminders", "complete", "r1"]);
      const req = requestAt(fetchMock);
      expect(req.method).toBe("POST");
      expect(req.url).toBe(`${TEST_BASE_URL}/v1/reminders/r1/complete`);
      expect(req.body).toBeUndefined();
      expect(out.stdout()).toMatch(/Completed r1: Send Jane the proposal/);
    });

    it("surfaces REMINDER_NOT_FOUND", async () => {
      mockFetch(jsonResponse({ statusCode: 404, code: "REMINDER_NOT_FOUND", message: "Reminder not found", error: "Not Found" }, 404));
      await expect(run(["reminders", "complete", "nope"])).rejects.toMatchObject({ status: 404, code: "REMINDER_NOT_FOUND" });
    });
  });
});
