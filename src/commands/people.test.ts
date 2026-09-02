import { describe, expect, it, vi } from "vitest";
import { installHarness, jsonResponse, mockFetch, requestAt, run, runExpectingExit, TEST_BASE_URL } from "../test/harness.js";
import { PersonalApiError } from "../lib/personal-api.js";

const PERSON = {
  slug: "jane-doe",
  tag: "person:jane-doe",
  containerId: "c1",
  displayName: "Jane Doe",
  relationship: "client",
  email: "jane@example.com",
  phone: null,
  company: "Acme",
  notes: null,
  importantDates: [{ label: "birthday", date: "1990-05-04", recurring: true }],
  aliases: ["JD"],
  archivedAt: null,
  memoryCount: 3,
  openReminderCount: 1,
  nextReminderAt: "2026-09-05T09:00:00.000Z",
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
};

describe("getmnemo people", () => {
  const out = installHarness();

  describe("list", () => {
    it("GETs /v1/people with q, includeArchived, limit and cursor", async () => {
      const fetchMock = mockFetch(jsonResponse({ items: [PERSON], nextCursor: "next1", total: 1 }));
      await run(["--json", "people", "list", "-q", "jane", "--include-archived", "--limit", "10", "--cursor", "abc"]);
      const req = requestAt(fetchMock);
      expect(req.method).toBe("GET");
      expect(req.url).toBe(`${TEST_BASE_URL}/v1/people?limit=10&cursor=abc&q=jane&includeArchived=true`);
      expect(req.headers.authorization).toBe("Bearer mk_test_key");
      expect(JSON.parse(out.stdout())).toMatchObject({ items: [{ slug: "jane-doe" }], nextCursor: "next1" });
    });

    it("omits optional params when not given and renders rows", async () => {
      const fetchMock = mockFetch(jsonResponse({ items: [PERSON], nextCursor: null, total: 1 }));
      await run(["people", "list"]);
      expect(requestAt(fetchMock).url).toBe(`${TEST_BASE_URL}/v1/people?limit=50`);
      expect(out.stdout()).toMatch(/jane-doe/);
      expect(out.stdout()).toMatch(/Jane Doe/);
      expect(out.stdout()).toMatch(/3 memories, 1 open reminders/);
    });

    it("prints an empty hint when there are no people", async () => {
      mockFetch(jsonResponse({ items: [], nextCursor: null, total: 0 }));
      await run(["people", "list"]);
      expect(out.stdout()).toMatch(/No people yet/);
    });

    it("rejects an out-of-range --limit before any request", async () => {
      const fetchMock = mockFetch();
      await runExpectingExit(["--json", "people", "list", "--limit", "500"], 2);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(out.stdout()).toMatch(/"error": "invalid_argument"/);
    });
  });

  describe("get", () => {
    it("GETs /v1/people/{slug} (url-encoded) and renders the person", async () => {
      const fetchMock = mockFetch(jsonResponse(PERSON));
      await run(["people", "get", "jane doe"]);
      expect(requestAt(fetchMock).url).toBe(`${TEST_BASE_URL}/v1/people/jane%20doe`);
      expect(out.stdout()).toMatch(/Jane Doe/);
      expect(out.stdout()).toMatch(/person:jane-doe/);
      expect(out.stdout()).toMatch(/relationship: client/);
      expect(out.stdout()).toMatch(/birthday 1990-05-04 \(recurring\)/);
      expect(out.stdout()).toMatch(/next 2026-09-05 09:00Z/);
    });

    it("surfaces PERSON_NOT_FOUND with status 404", async () => {
      mockFetch(jsonResponse({ statusCode: 404, code: "PERSON_NOT_FOUND", message: "Person not found", error: "Not Found" }, 404));
      await expect(run(["--json", "people", "get", "nobody"])).rejects.toMatchObject({
        name: "PersonalApiError",
        status: 404,
        code: "PERSON_NOT_FOUND",
      });
    });
  });

  describe("add", () => {
    it("POSTs /v1/people with only the provided fields", async () => {
      const fetchMock = mockFetch(jsonResponse(PERSON, 201));
      await run([
        "people", "add", "Jane Doe",
        "--relationship", "client", "--email", "jane@example.com", "--company", "Acme",
        "--alias", "JD", "Janie",
        "--important-date", "birthday=1990-05-04:recurring", "anniversary=2020-06-01",
      ]);
      const req = requestAt(fetchMock);
      expect(req.method).toBe("POST");
      expect(req.url).toBe(`${TEST_BASE_URL}/v1/people`);
      expect(req.headers["content-type"]).toBe("application/json");
      expect(req.body).toEqual({
        displayName: "Jane Doe",
        relationship: "client",
        email: "jane@example.com",
        company: "Acme",
        aliases: ["JD", "Janie"],
        importantDates: [
          { label: "birthday", date: "1990-05-04", recurring: true },
          { label: "anniversary", date: "2020-06-01", recurring: false },
        ],
      });
      expect(out.stdout()).toMatch(/Added Jane Doe/);
    });

    it("sends the bare minimum body when only a name is given", async () => {
      const fetchMock = mockFetch(jsonResponse(PERSON, 201));
      await run(["--json", "people", "add", "Jane Doe", "--slug", "jane"]);
      expect(requestAt(fetchMock).body).toEqual({ displayName: "Jane Doe", slug: "jane" });
      expect(JSON.parse(out.stdout())).toMatchObject({ slug: "jane-doe" });
    });

    it("rejects a malformed --important-date before any request", async () => {
      const fetchMock = mockFetch();
      await runExpectingExit(["people", "add", "Jane", "--important-date", "birthday=May 4"], 2);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(out.stderr()).toMatch(/Invalid --important-date/);
    });

    it("maps PERSON_EXISTS 409 to a PersonalApiError", async () => {
      mockFetch(jsonResponse({ statusCode: 409, code: "PERSON_EXISTS", message: "A person with slug jane already exists", error: "Conflict" }, 409));
      const err = await run(["people", "add", "Jane", "--slug", "jane"]).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(PersonalApiError);
      expect((err as PersonalApiError).code).toBe("PERSON_EXISTS");
      expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    });
  });
});
