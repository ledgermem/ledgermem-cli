import { Command } from "commander";
import kleur from "kleur";
import { getClient } from "../lib/client.js";
import { CONTAINER_OPTION_FLAGS } from "../lib/container.js";
import {
  formatWhen,
  oneLine,
  parseIntFlag,
  printHeading,
  printInfo,
  printJson,
  printLine,
  rootJsonFlag,
} from "../lib/output.js";
import type { ListUpcomingMeetingsResponse, Meeting, MeetingBrief } from "../lib/personal-types.js";
import { reminderLine } from "./reminders.js";

interface UpcomingOpts {
  days?: string;
  limit?: string;
  cursor?: string;
  container?: string;
}

interface BriefOpts {
  q?: string;
}

function attendeeNames(m: Meeting): string[] {
  return m.attendees
    .filter((a) => !a.self)
    .map((a) => (a.person ? `${a.person.displayName}${kleur.dim(` (${a.person.slug})`)}` : a.name ?? a.email ?? "?"));
}

function meetingLine(m: Meeting): string {
  const when = m.isAllDay && m.start ? m.start.slice(0, 10) : formatWhen(m.start);
  const who = attendeeNames(m);
  return `${kleur.dim(m.documentId)}  ${kleur.yellow(when)}  ${m.title}${who.length ? kleur.dim(` · ${who.join(", ")}`) : ""}`;
}

function printMeetingBrief(b: MeetingBrief): void {
  printHeading(`${b.title} ${kleur.dim(`— ${formatWhen(b.start)}${b.location ? ` · ${b.location}` : ""}`)}`);
  const who = attendeeNames(b);
  if (who.length) printInfo(`with: ${who.join(", ")}`);
  if (b.brief) {
    printHeading("Brief");
    printLine(b.brief.abstained ? kleur.dim("  Nothing in memory prepares you for this one yet.") : `  ${b.brief.answer}`);
  }
  for (const p of b.people) {
    printHeading(`${p.displayName}${p.relationship ? kleur.dim(` · ${p.relationship}`) : ""}`);
    for (const r of p.openReminders) printLine(`  ${reminderLine(r)}`);
    for (const m of p.recentMemories) printLine(`  ${kleur.dim(formatWhen(m.createdAt))}  ${oneLine(m.content)}`);
    if (p.openReminders.length === 0 && p.recentMemories.length === 0) printLine(kleur.dim("  no open reminders or recent memories"));
  }
  if (b.previousMeetings.length > 0) {
    printHeading("Previous meetings");
    for (const pm of b.previousMeetings) printLine(`  ${kleur.dim(formatWhen(pm.start))}  ${pm.title} ${kleur.dim(pm.documentId)}`);
  }
}

export function registerMeetingsCommands(program: Command): void {
  const meetings = program.command("meetings").description("upcoming calendar meetings and pre-meeting briefs");

  meetings
    .command("upcoming")
    .description("list upcoming meetings from connected calendars")
    .option("--days <n>", "window in days (1-30)", "7")
    .option("-l, --limit <n>", "page size (1-100)", "50")
    .option("-c, --cursor <cursor>", "pagination cursor")
    .option(CONTAINER_OPTION_FLAGS, "only one calendar connection's container (explicit flag only)")
    .action(async (opts: UpcomingOpts, cmd: Command) => {
      const json = rootJsonFlag(cmd);
      const days = parseIntFlag(opts.days, "--days", json, { min: 1, max: 30, fallback: 7 });
      const limit = parseIntFlag(opts.limit, "--limit", json, { min: 1, max: 100, fallback: 50 });
      const ctx = await getClient();
      const result = await ctx.api.get<ListUpcomingMeetingsResponse>("/v1/meetings/upcoming", {
        days,
        limit,
        cursor: opts.cursor,
        containerTag: opts.container,
      });
      if (json) return printJson(result);
      if (result.connections.length === 0) {
        return printInfo("No calendar connected. Connect Google Calendar in the dashboard (Connectors).");
      }
      if (result.items.length === 0) return printInfo(`No meetings in the next ${days} days.`);
      for (const m of result.items) printLine(meetingLine(m));
      if (result.nextCursor) printInfo(`more: --cursor ${result.nextCursor}`);
    });

  meetings
    .command("brief <documentId>")
    .description("pre-meeting brief: attendees' memories, open reminders, previous meetings")
    .option("-q, --q <question>", "focus the brief on a question")
    .action(async (documentId: string, opts: BriefOpts, cmd: Command) => {
      const json = rootJsonFlag(cmd);
      const ctx = await getClient();
      const brief = await ctx.api.get<MeetingBrief>(`/v1/meetings/${encodeURIComponent(documentId)}/brief`, {
        q: opts.q,
      });
      if (json) return printJson(brief);
      printMeetingBrief(brief);
    });
}
