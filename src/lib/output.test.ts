import { describe, expect, it } from "vitest";
import { buildQuery } from "./personal-api.js";
import { formatWhen, oneLine, truncate } from "./output.js";

describe("output helpers", () => {
  it("formatWhen keeps the zone verbatim and handles date-only / null", () => {
    expect(formatWhen("2026-09-03T10:00:00.000Z")).toBe("2026-09-03 10:00Z");
    expect(formatWhen("2026-09-03T10:00:00+05:00")).toBe("2026-09-03 10:00+05:00");
    expect(formatWhen("2026-09-03T10:00")).toBe("2026-09-03 10:00");
    expect(formatWhen("2026-09-03")).toBe("2026-09-03");
    expect(formatWhen(null)).toBe("—");
    expect(formatWhen("not a date")).toBe("not a date");
  });

  it("oneLine collapses whitespace and truncates", () => {
    expect(oneLine("  hello\n  world  ")).toBe("hello world");
    expect(oneLine("a".repeat(120), 10)).toBe("a".repeat(9) + "…");
    expect(truncate("short")).toBe("short");
  });

  it("buildQuery omits undefined and encodes reserved characters", () => {
    expect(buildQuery({ a: "x:y", b: undefined, c: 3, d: false })).toBe("?a=x%3Ay&c=3&d=false");
    expect(buildQuery({})).toBe("");
    expect(buildQuery(undefined)).toBe("");
  });
});
