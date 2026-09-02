import { describe, expect, it } from "vitest";
import { installHarness, run } from "../test/harness.js";

describe("getmnemo mcp", () => {
  const out = installHarness();

  it("emits the published getmnemo-mcp package in the npx snippet", async () => {
    await run(["--json", "mcp"]);
    const payload = JSON.parse(out.stdout()) as {
      client: string;
      snippet: { mcpServers: { getmnemo: { command: string; args: string[]; env: Record<string, string> } } };
    };
    expect(payload.client).toBe("claude");
    expect(payload.snippet.mcpServers.getmnemo.command).toBe("npx");
    expect(payload.snippet.mcpServers.getmnemo.args).toEqual(["-y", "getmnemo-mcp"]);
    expect(payload.snippet.mcpServers.getmnemo.env.GETMNEMO_API_KEY).toBe("mk_test_key");
    expect(out.stdout()).not.toMatch(/@mnemo\/mcp/);
  });

  it("targets the cursor config path with --client cursor", async () => {
    await run(["mcp", "--client", "cursor"]);
    expect(out.stdout()).toMatch(/~\/\.cursor\/mcp\.json/);
    expect(out.stdout()).toMatch(/getmnemo-mcp/);
  });
});
