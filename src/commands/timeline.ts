import { Command } from "commander";
import kleur from "kleur";
import { getClient } from "../lib/client.js";
import { CONTAINER_OPTION_DESC, CONTAINER_OPTION_FLAGS, requireContainerTag } from "../lib/container.js";
import {
  failUsage,
  formatWhen,
  oneLine,
  parseIntFlag,
  printInfo,
  printJson,
  printLine,
  requireIsoDate,
  requireOneOf,
  rootJsonFlag,
} from "../lib/output.js";
import { TIMELINE_ITEM_TYPES, type TimelineItem, type TimelineResponse } from "../lib/personal-types.js";

const DIRECTIONS = ["desc", "asc"] as const;

interface TimelineOpts {
  container?: string;
  from?: string;
  to?: string;
  types?: string;
  direction?: string;
  limit?: string;
  cursor?: string;
}

/** Validates a csv of item types (order preserved, duplicates dropped) or exit 2. */
export function parseTypes(raw: string | undefined, json: boolean): string | undefined {
  if (raw === undefined) return undefined;
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  const unique = [...new Set(parts)];
  if (unique.length === 0 || unique.some((t) => !(TIMELINE_ITEM_TYPES as readonly string[]).includes(t))) {
    return failUsage(json, "invalid_argument", `--types must be a comma-separated subset of: ${TIMELINE_ITEM_TYPES.join(", ")}`);
  }
  return unique.join(",");
}

const TYPE_GLYPH: Record<TimelineItem["type"], string> = {
  memory: "●",
  reminder: "◷",
  document: "▤",
  event: "·",
};

function timelineLine(item: TimelineItem): string {
  const glyph = TYPE_GLYPH[item.type];
  const by = item.createdBy?.label ?? item.createdBy?.kind;
  const snippet = item.snippet && item.snippet !== item.title ? kleur.dim(`  ${oneLine(item.snippet, 80)}`) : "";
  return `${kleur.dim(formatWhen(item.occurredAt))}  ${glyph} ${item.type.padEnd(8)} ${oneLine(item.title, 100)}${by ? kleur.dim(` · ${by}`) : ""}${snippet}`;
}

export function registerTimelineCommand(program: Command): void {
  program
    .command("timeline")
    .description("chronological memories, reminders and documents for one container")
    .option(CONTAINER_OPTION_FLAGS, CONTAINER_OPTION_DESC)
    .option("--from <iso>", "only items at/after this time")
    .option("--to <iso>", "only items at/before this time")
    .option("--types <csv>", "subset of memory,reminder,document,event (default: memory,reminder,document)")
    .option("--direction <dir>", "desc | asc", "desc")
    .option("-l, --limit <n>", "page size (1-100)", "50")
    .option("-c, --cursor <cursor>", "pagination cursor")
    .action(async (opts: TimelineOpts, cmd: Command) => {
      const json = rootJsonFlag(cmd);
      const limit = parseIntFlag(opts.limit, "--limit", json, { min: 1, max: 100, fallback: 50 });
      const direction = requireOneOf(opts.direction, "--direction", DIRECTIONS, json, "desc");
      const from = opts.from === undefined ? undefined : requireIsoDate(opts.from, "--from", json);
      const to = opts.to === undefined ? undefined : requireIsoDate(opts.to, "--to", json);
      const types = parseTypes(opts.types, json);
      const ctx = await getClient();
      const containerTag = requireContainerTag(ctx.cfg, opts.container, json);
      const result = await ctx.api.get<TimelineResponse>("/v1/timeline", {
        containerTag,
        from,
        to,
        types,
        direction,
        limit,
        cursor: opts.cursor,
      });
      if (json) return printJson(result);
      if (result.items.length === 0) return printInfo(`Nothing on the timeline for ${containerTag}.`);
      for (const item of result.items) printLine(timelineLine(item));
      if (result.nextCursor) printInfo(`more: --cursor ${result.nextCursor}`);
    });
}
