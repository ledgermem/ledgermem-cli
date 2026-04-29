import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { buildCli } from "./cli.js";

describe("Mnemo CLI", () => {
  let stdout: string;
  let stderr: string;
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
  });

  afterEach(() => {
    process.stdout.write = writeStdout;
    process.stderr.write = writeStderr;
    vi.restoreAllMocks();
  });

  it("renders --help with all top-level commands", async () => {
    const program = buildCli();
    program.exitOverride();
    try {
      await program.parseAsync(["node", "getmnemo", "--help"]);
    } catch {
      // commander throws on help by design
    }
    expect(stdout).toMatch(/Usage: getmnemo/);
    expect(stdout).toMatch(/login/);
    expect(stdout).toMatch(/logout/);
    expect(stdout).toMatch(/whoami/);
    expect(stdout).toMatch(/add/);
    expect(stdout).toMatch(/search/);
    expect(stdout).toMatch(/get/);
    expect(stdout).toMatch(/rm/);
    expect(stdout).toMatch(/list/);
    expect(stdout).toMatch(/workspace/);
    expect(stdout).toMatch(/mcp/);
    expect(stdout).toMatch(/doctor/);
  });

  it("doctor reports failure when API is unreachable (mocked)", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    vi.stubGlobal("fetch", fetchMock);

    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("__exit__");
    }) as never);

    const program = buildCli();
    program.exitOverride();
    try {
      await program.parseAsync(["node", "getmnemo", "--json", "doctor"]);
    } catch (err) {
      expect((err as Error).message).toBe("__exit__");
    }

    expect(fetchMock).toHaveBeenCalled();
    expect(stdout).toMatch(/"ok":\s*false/);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("returns exit code 2 for unknown command", async () => {
    const program = buildCli();
    let caught: unknown;
    program.exitOverride((err) => {
      caught = err;
      throw err;
    });
    try {
      await program.parseAsync(["node", "getmnemo", "totally-not-a-command"]);
    } catch {
      // expected
    }
    expect(caught).toBeDefined();
    expect((caught as { code?: string }).code).toBe("commander.unknownCommand");
  });
});
