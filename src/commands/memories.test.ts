import { describe, expect, it, vi } from "vitest";
import prompts from "prompts";
import { installHarness, jsonResponse, mockFetch, requestAt, run, runExpectingExit, TEST_BASE_URL } from "../test/harness.js";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const MERGED = {
  memory: { id: C, content: "merged", memoryType: "memory", metadata: null, createdAt: "2026-09-03T00:00:00.000Z", updatedAt: "2026-09-03T00:00:00.000Z", dueAt: null, createdBy: null },
  mergedFromIds: [A, B],
  deletedIds: [A, B],
  replayed: false,
};

describe("getmnemo memories merge", () => {
  const out = installHarness();

  it("POSTs /v1/memories/merge creating a new survivor (--content) with --yes", async () => {
    const fetchMock = mockFetch(jsonResponse(MERGED, 201));
    await run([
      "memories", "merge", A, B, "--yes", "--container", "user:me",
      "--content", "Jane prefers blue and green", "--type", "preference", "--merge-key", "k1", "-m", "reason=dup",
    ]);
    const req = requestAt(fetchMock);
    expect(req.method).toBe("POST");
    expect(req.url).toBe(`${TEST_BASE_URL}/v1/memories/merge`);
    expect(req.body).toEqual({
      containerTag: "user:me",
      ids: [A, B],
      content: "Jane prefers blue and green",
      memoryType: "preference",
      metadata: { reason: "dup" },
      mergeKey: "k1",
    });
    expect(out.stdout()).toMatch(new RegExp(`Merged 2 memories into ${C} \\(2 soft-deleted, restorable\\)`));
  });

  it("POSTs with --into and no content; reports a replay", async () => {
    vi.stubEnv("GETMNEMO_CONTAINER", "user:env");
    const fetchMock = mockFetch(jsonResponse({ ...MERGED, memory: { ...MERGED.memory, id: A }, deletedIds: [B], replayed: true }));
    await run(["--json", "memories", "merge", A, B, "--into", A, "-y"]);
    expect(requestAt(fetchMock).body).toEqual({ containerTag: "user:env", ids: [A, B], into: A });
    expect(JSON.parse(out.stdout())).toMatchObject({ replayed: true });
  });

  it("dedupes repeated ids before sending", async () => {
    const fetchMock = mockFetch(jsonResponse(MERGED, 201));
    await run(["memories", "merge", A, B, A, "-y", "-C", "user:me", "--into", B]);
    expect(requestAt(fetchMock).body).toEqual({ containerTag: "user:me", ids: [A, B], into: B });
  });

  it("exits 2 with fewer than two distinct ids", async () => {
    const fetchMock = mockFetch();
    await runExpectingExit(["--json", "memories", "merge", A, A, "-y", "-C", "user:me", "--into", A], 2);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(out.stdout()).toMatch(/invalid_argument/);
  });

  it("exits 2 when --into is not one of the ids", async () => {
    const fetchMock = mockFetch();
    await runExpectingExit(["memories", "merge", A, B, "-y", "-C", "user:me", "--into", C], 2);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(out.stderr()).toMatch(/--into must be one of the ids/);
  });

  it("exits 2 when neither --into nor --content is given", async () => {
    const fetchMock = mockFetch();
    await runExpectingExit(["memories", "merge", A, B, "-y", "-C", "user:me"], 2);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(out.stderr()).toMatch(/--content is required/);
  });

  it("exits 2 without a container before prompting or sending", async () => {
    const fetchMock = mockFetch();
    await runExpectingExit(["memories", "merge", A, B, "--into", A], 2);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(out.stderr()).toMatch(/A container is required/);
  });

  it("refuses without --yes in a non-interactive shell", async () => {
    const fetchMock = mockFetch();
    const isTTY = process.stdin.isTTY;
    Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });
    try {
      await runExpectingExit(["--json", "memories", "merge", A, B, "--into", A, "-C", "user:me"], 2);
    } finally {
      Object.defineProperty(process.stdin, "isTTY", { value: isTTY, configurable: true });
    }
    expect(fetchMock).not.toHaveBeenCalled();
    expect(out.stdout()).toMatch(/confirmation_required/);
  });

  it("cancels cleanly when the interactive prompt is declined", async () => {
    const fetchMock = mockFetch();
    const isTTY = process.stdin.isTTY;
    Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
    prompts.inject([false]);
    try {
      await run(["memories", "merge", A, B, "--into", A, "-C", "user:me"]);
    } finally {
      Object.defineProperty(process.stdin, "isTTY", { value: isTTY, configurable: true });
    }
    expect(fetchMock).not.toHaveBeenCalled();
    expect(out.stdout()).toMatch(/Cancelled/);
  });

  it("surfaces MERGE_CROSS_CONTAINER (400) as a coded error", async () => {
    mockFetch(jsonResponse({ statusCode: 400, code: "MERGE_CROSS_CONTAINER", message: "Memories must share a container", error: "Bad Request" }, 400));
    await expect(run(["memories", "merge", A, B, "--into", A, "-y", "-C", "user:me"])).rejects.toMatchObject({ status: 400, code: "MERGE_CROSS_CONTAINER" });
  });
});
