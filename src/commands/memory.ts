import { Command } from "commander";
import kleur from "kleur";
import prompts from "prompts";
import { getClient, parseMetadata } from "../lib/client.js";
import {
  printError,
  printInfo,
  printJson,
  printSuccess,
  rootJsonFlag,
  truncate,
} from "../lib/output.js";

interface MemoryRecord {
  id?: string;
  content?: string;
  text?: string;
  score?: number;
  metadata?: Record<string, unknown>;
  createdAt?: string;
}

function asMemory(value: unknown): MemoryRecord {
  if (value && typeof value === "object") return value as MemoryRecord;
  return {};
}

export function registerMemoryCommands(program: Command): void {
  program
    .command("add <content>")
    .description("add a new memory")
    .option("-m, --metadata <pair...>", "metadata key=value pairs (repeatable)")
    .action(async (content: string, opts: { metadata?: string[] }, cmd: Command) => {
      const json = rootJsonFlag(cmd);
      const ctx = await getClient();
      const metadata = parseMetadata(opts.metadata);
      const result = await ctx.client.add({ content, metadata });
      if (json) {
        printJson(result);
        return;
      }
      const m = asMemory(result);
      printSuccess(`Added memory ${kleur.dim(m.id ?? "(no id returned)")}`);
    });

  program
    .command("search <query>")
    .description("semantic search across memories")
    .option("-l, --limit <n>", "max results", "5")
    .action(async (query: string, opts: { limit?: string }, cmd: Command) => {
      const json = rootJsonFlag(cmd);
      const ctx = await getClient();
      const limit = Number.parseInt(opts.limit ?? "5", 10);
      if (Number.isNaN(limit) || limit <= 0) {
        printError("--limit must be a positive integer");
        process.exit(2);
      }
      const result = await ctx.client.search({ query, limit });
      if (json) {
        printJson(result);
        return;
      }
      const items = Array.isArray(result) ? result : ((result as { results?: unknown[] })?.results ?? []);
      if (items.length === 0) {
        printInfo("No matching memories.");
        return;
      }
      for (const raw of items) {
        const m = asMemory(raw);
        const score = typeof m.score === "number" ? kleur.yellow(m.score.toFixed(3)) : kleur.dim("—");
        const id = kleur.dim(m.id ?? "");
        const text = m.content ?? m.text ?? "";
        process.stdout.write(`${score}  ${id}\n  ${truncate(text, 200)}\n\n`);
      }
    });

  program
    .command("get <id>")
    .description("fetch a single memory by id")
    .action(async (id: string, _opts: unknown, cmd: Command) => {
      const json = rootJsonFlag(cmd);
      const ctx = await getClient();
      let raw: unknown;
      try {
        raw = await ctx.client.get(id);
      } catch (err: unknown) {
        const status = (err as { status?: number })?.status;
        if (status === 404) {
          if (json) printJson({ ok: false, error: "not_found" });
          else printError(`Memory ${id} not found.`);
          process.exit(1);
        }
        throw err;
      }
      const found = asMemory(raw);
      if (json) {
        printJson(found);
        return;
      }
      printInfo(`id:        ${found.id}`);
      printInfo(`content:   ${found.content ?? found.text ?? ""}`);
      if (found.metadata) printInfo(`metadata:  ${JSON.stringify(found.metadata)}`);
      if (found.createdAt) printInfo(`createdAt: ${found.createdAt}`);
    });

  program
    .command("rm <id>")
    .description("delete a memory")
    .option("-y, --yes", "skip confirmation prompt", false)
    .action(async (id: string, opts: { yes?: boolean }, cmd: Command) => {
      const json = rootJsonFlag(cmd);
      const ctx = await getClient();
      if (!opts.yes) {
        if (!process.stdin.isTTY) {
          if (json) printJson({ ok: false, error: "confirmation_required" });
          else printError("Refusing to delete without --yes in a non-interactive shell.");
          process.exit(2);
        }
        const { confirm } = await prompts({
          type: "confirm",
          name: "confirm",
          message: `Delete memory ${id}?`,
          initial: false,
        });
        if (!confirm) {
          printInfo("Cancelled.");
          return;
        }
      }
      await ctx.client.delete(id);
      if (json) {
        printJson({ ok: true, id });
        return;
      }
      printSuccess(`Deleted ${id}`);
    });

  program
    .command("list")
    .description("list memories in the current workspace")
    .option("-l, --limit <n>", "page size", "20")
    .option("-c, --cursor <cursor>", "pagination cursor")
    .action(async (opts: { limit?: string; cursor?: string }, cmd: Command) => {
      const json = rootJsonFlag(cmd);
      const ctx = await getClient();
      const limit = Number.parseInt(opts.limit ?? "20", 10);
      if (Number.isNaN(limit) || limit <= 0) {
        printError("--limit must be a positive integer");
        process.exit(2);
      }
      const result = await ctx.client.list({ limit, cursor: opts.cursor });
      if (json) {
        printJson(result);
        return;
      }
      const items = Array.isArray(result) ? result : ((result as { results?: unknown[] })?.results ?? []);
      if (items.length === 0) {
        printInfo("No memories yet.");
        return;
      }
      for (const raw of items) {
        const m = asMemory(raw);
        const id = kleur.dim((m.id ?? "").padEnd(24).slice(0, 24));
        const text = m.content ?? m.text ?? "";
        process.stdout.write(`${id}  ${truncate(text, 100)}\n`);
      }
    });
}
