import { Command } from "commander";
import kleur from "kleur";
import { getClient } from "../lib/client.js";
import { CONTAINER_OPTION_DESC, CONTAINER_OPTION_FLAGS, requireContainerTag } from "../lib/container.js";
import {
  failUsage,
  formatWhen,
  oneLine,
  parseIntFlag,
  printHeading,
  printInfo,
  printJson,
  printLine,
  rootJsonFlag,
  systemTimezone,
} from "../lib/output.js";
import type { DailyBrief } from "../lib/personal-types.js";
import { printImportantDates, printReminderSection } from "./reminders.js";

const SECTIONS = ["core", "followUps", "meetings"] as const;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

interface BriefOpts {
  container?: string;
  date?: string;
  timezone?: string;
  days?: string;
  sections?: string;
}

/** Validates a csv of sections (order preserved, duplicates dropped) or exit 2. */
export function parseSections(raw: string | undefined, json: boolean): string | undefined {
  if (raw === undefined) return undefined;
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  const unique = [...new Set(parts)];
  if (unique.length === 0 || unique.some((s) => !(SECTIONS as readonly string[]).includes(s))) {
    return failUsage(json, "invalid_argument", `--sections must be a comma-separated subset of: ${SECTIONS.join(", ")}`);
  }
  return unique.join(",");
}

function printBrief(brief: DailyBrief, days: number): void {
  const scope = brief.scope.containerTag ? brief.scope.containerTag : "workspace";
  printHeading(`Daily brief — ${brief.date} ${kleur.dim(`(${brief.timezone} · ${scope})`)}`);
  let printed = 0;
  if (brief.reminders) {
    printed += brief.reminders.overdue.length + brief.reminders.dueToday.length + brief.reminders.upcoming.length;
    printReminderSection(kleur.red("Overdue"), brief.reminders.overdue);
    printReminderSection("Due today", brief.reminders.dueToday);
    printReminderSection(`Coming up (${days}d)`, brief.reminders.upcoming);
  }
  if (brief.importantDates) {
    printed += brief.importantDates.length;
    printImportantDates(brief.importantDates);
  }
  if (brief.meetings && brief.meetings.length > 0) {
    printed += brief.meetings.length;
    printHeading("Today's meetings");
    for (const m of brief.meetings) {
      const who = m.attendees.filter((a) => !a.self).map((a) => a.person?.displayName ?? a.name ?? a.email ?? "?");
      printLine(`  ${kleur.yellow(formatWhen(m.start))}  ${m.title}${who.length ? kleur.dim(` · ${who.join(", ")}`) : ""}`);
    }
  }
  if (brief.followUps) {
    if (!brief.followUps.abstained) printed += 1;
    printHeading("Follow-ups & promises");
    printLine(brief.followUps.abstained ? kleur.dim("  Nothing outstanding that I can find.") : `  ${brief.followUps.answer}`);
  }
  if (brief.recentMemories && brief.recentMemories.length > 0) {
    printed += brief.recentMemories.length;
    printHeading("Captured in the last 24h");
    for (const m of brief.recentMemories) {
      const by = m.createdBy?.label ?? m.createdBy?.kind ?? "";
      printLine(`  ${kleur.dim(formatWhen(m.createdAt))}  ${oneLine(m.content)}${by ? kleur.dim(` · ${by}`) : ""}`);
    }
  }
  if (brief.counts) {
    printInfo(`${brief.counts.memoriesLast24h} memories, ${brief.counts.documentsLast24h} documents in the last 24h`);
  }
  if (printed === 0) printInfo("Nothing to report today.");
}

export function registerBriefCommand(program: Command): void {
  program
    .command("brief")
    .description("your daily brief: reminders, important dates, meetings, follow-ups, recent captures")
    .option(CONTAINER_OPTION_FLAGS, CONTAINER_OPTION_DESC)
    .option("--date <YYYY-MM-DD>", "local date of the brief (default: today)")
    .option("--timezone <tz>", "IANA timezone (default: system timezone)")
    .option("--days <n>", "look-ahead window in days (1-30)", "7")
    .option("--sections <csv>", "subset of core,followUps,meetings (default: all)")
    .action(async (opts: BriefOpts, cmd: Command) => {
      const json = rootJsonFlag(cmd);
      const days = parseIntFlag(opts.days, "--days", json, { min: 1, max: 30, fallback: 7 });
      if (opts.date !== undefined && !DATE_RE.test(opts.date)) {
        return failUsage(json, "invalid_argument", "--date must be YYYY-MM-DD");
      }
      const sections = parseSections(opts.sections, json);
      const ctx = await getClient();
      const containerTag = requireContainerTag(ctx.cfg, opts.container, json);
      const brief = await ctx.api.get<DailyBrief>("/v1/brief", {
        containerTag,
        date: opts.date,
        timezone: opts.timezone ?? systemTimezone(),
        days,
        sections,
      });
      if (json) return printJson(brief);
      printBrief(brief, days);
    });
}
