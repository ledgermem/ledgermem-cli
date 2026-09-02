import { Command } from "commander";
import kleur from "kleur";
import { getClient, parseMetadata } from "../lib/client.js";
import { CONTAINER_OPTION_DESC, CONTAINER_OPTION_FLAGS } from "../lib/container.js";
import { resolveContainerTag } from "../lib/config.js";
import {
  failUsage,
  formatWhen,
  oneLine,
  parseIntFlag,
  printHeading,
  printInfo,
  printJson,
  printLine,
  printSuccess,
  requireIsoDate,
  requireOneOf,
  rootJsonFlag,
  systemTimezone,
} from "../lib/output.js";
import type {
  CreateReminderBody,
  ImportantDate,
  ListRemindersResponse,
  Reminder,
  UpcomingRemindersResponse,
} from "../lib/personal-types.js";

const STATUSES = ["open", "completed", "all"] as const;

interface ListOpts {
  status?: string;
  days?: string;
  dueAfter?: string;
  dueBefore?: string;
  container?: string;
  containerType?: string;
  limit?: string;
  cursor?: string;
}

interface UpcomingOpts {
  days?: string;
  timezone?: string;
  container?: string;
  containerType?: string;
  limit?: string;
}

interface AddOpts {
  due?: string;
  person?: string;
  container?: string;
  idempotencyKey?: string;
  metadata?: string[];
}

export function reminderLine(r: Reminder): string {
  const when = r.dueAt ? formatWhen(r.dueAt) : r.completedAt ? `done ${formatWhen(r.completedAt)}` : "—";
  const person = r.person ? kleur.dim(` · ${r.person.displayName}`) : "";
  return `${kleur.dim(r.id)}  ${kleur.yellow(when)}  ${oneLine(r.content)}${person}`;
}

export function printReminderSection(title: string, items: Reminder[]): void {
  if (items.length === 0) return;
  printHeading(title);
  for (const r of items) printLine(`  ${reminderLine(r)}`);
}

export function printImportantDates(items: ImportantDate[]): void {
  if (items.length === 0) return;
  printHeading("Important dates");
  for (const d of items) {
    const inDays = d.daysUntil === 0 ? "today" : d.daysUntil === 1 ? "tomorrow" : `in ${d.daysUntil} days`;
    printLine(`  ${kleur.yellow(d.date)}  ${d.displayName} — ${d.label} ${kleur.dim(`(${inDays})`)}`);
  }
}

export function registerRemindersCommands(program: Command): void {
  const reminders = program.command("reminders").description("manage reminders (memories with a due date)");

  reminders
    .command("list")
    .description("list reminders across the workspace")
    .option("-s, --status <status>", "open | completed | all", "open")
    .option("--days <n>", "only reminders due within n days (1-365)")
    .option("--due-after <iso>", "only reminders due at/after this time")
    .option("--due-before <iso>", "only reminders due at/before this time")
    .option(CONTAINER_OPTION_FLAGS, "only reminders in this container (explicit flag only)")
    .option("--container-type <type>", "only reminders in containers of this type (e.g. person)")
    .option("-l, --limit <n>", "page size (1-100)", "50")
    .option("-c, --cursor <cursor>", "pagination cursor")
    .action(async (opts: ListOpts, cmd: Command) => {
      const json = rootJsonFlag(cmd);
      const status = requireOneOf(opts.status, "--status", STATUSES, json, "open");
      const limit = parseIntFlag(opts.limit, "--limit", json, { min: 1, max: 100, fallback: 50 });
      const days = opts.days === undefined ? undefined : parseIntFlag(opts.days, "--days", json, { min: 1, max: 365, fallback: 7 });
      const dueAfter = opts.dueAfter === undefined ? undefined : requireIsoDate(opts.dueAfter, "--due-after", json);
      const dueBefore = opts.dueBefore === undefined ? undefined : requireIsoDate(opts.dueBefore, "--due-before", json);
      const ctx = await getClient();
      const result = await ctx.api.get<ListRemindersResponse>("/v1/reminders", {
        status,
        days,
        dueAfter,
        dueBefore,
        containerTag: opts.container,
        containerType: opts.containerType,
        limit,
        cursor: opts.cursor,
      });
      if (json) return printJson(result);
      if (result.items.length === 0) return printInfo(`No ${status === "all" ? "" : status + " "}reminders.`);
      for (const r of result.items) printLine(reminderLine(r));
      if (result.nextCursor) printInfo(`more: --cursor ${result.nextCursor}`);
    });

  reminders
    .command("upcoming")
    .description("overdue / due today / coming up, bucketed in your timezone")
    .option("--days <n>", "window in days (1-90)", "7")
    .option("--timezone <tz>", "IANA timezone (default: system timezone)")
    .option(CONTAINER_OPTION_FLAGS, "only reminders in this container (explicit flag only)")
    .option("--container-type <type>", "only reminders in containers of this type")
    .option("-l, --limit <n>", "max per bucket (1-100)", "50")
    .action(async (opts: UpcomingOpts, cmd: Command) => {
      const json = rootJsonFlag(cmd);
      const days = parseIntFlag(opts.days, "--days", json, { min: 1, max: 90, fallback: 7 });
      const limit = parseIntFlag(opts.limit, "--limit", json, { min: 1, max: 100, fallback: 50 });
      const ctx = await getClient();
      const result = await ctx.api.get<UpcomingRemindersResponse>("/v1/reminders/upcoming", {
        days,
        timezone: opts.timezone ?? systemTimezone(),
        containerTag: opts.container,
        containerType: opts.containerType,
        limit,
      });
      if (json) return printJson(result);
      const total = result.overdue.length + result.dueToday.length + result.upcoming.length + result.importantDates.length;
      if (total === 0) return printInfo(`Nothing due in the next ${days} days.`);
      printReminderSection(kleur.red("Overdue"), result.overdue);
      printReminderSection("Due today", result.dueToday);
      printReminderSection(`Coming up (${days}d)`, result.upcoming);
      printImportantDates(result.importantDates);
    });

  reminders
    .command("add <content>")
    .description("create a reminder for a person or a container")
    .requiredOption("--due <iso>", "when it is due (ISO-8601, e.g. 2026-09-03T10:00:00Z)")
    .option("-p, --person <slug>", "attach to a person (lands in person:<slug>)")
    .option(CONTAINER_OPTION_FLAGS, CONTAINER_OPTION_DESC)
    .option("--idempotency-key <key>", "natural key to make retries safe")
    .option("-m, --metadata <pair...>", "metadata key=value pairs (repeatable)")
    .action(async (content: string, opts: AddOpts, cmd: Command) => {
      const json = rootJsonFlag(cmd);
      const dueAt = requireIsoDate(opts.due ?? "", "--due", json);
      const metadata = parseMetadata(opts.metadata);
      if (opts.person && opts.container) {
        return failUsage(json, "invalid_argument", "Pass either --person <slug> or --container <tag>, not both.");
      }
      const ctx = await getClient();
      const containerTag = opts.person ? undefined : resolveContainerTag(ctx.cfg, opts.container);
      if (!opts.person && !containerTag) {
        return failUsage(
          json,
          "container_required",
          "A target is required. Pass --person <slug>, --container <tag>, set GETMNEMO_CONTAINER, or add defaultContainerTag to your config.",
        );
      }
      const body: CreateReminderBody = {
        content,
        dueAt,
        personSlug: opts.person,
        containerTag,
        idempotencyKey: opts.idempotencyKey,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
      };
      const reminder = await ctx.api.post<Reminder>("/v1/reminders", body);
      if (json) return printJson(reminder);
      printSuccess(`Reminder ${kleur.dim(reminder.id)} due ${formatWhen(reminder.dueAt)}`);
    });

  reminders
    .command("complete <id>")
    .description("mark a reminder as done")
    .action(async (id: string, _opts: unknown, cmd: Command) => {
      const json = rootJsonFlag(cmd);
      const ctx = await getClient();
      const reminder = await ctx.api.post<Reminder>(`/v1/reminders/${encodeURIComponent(id)}/complete`);
      if (json) return printJson(reminder);
      printSuccess(`Completed ${kleur.dim(reminder.id)}: ${oneLine(reminder.content)}`);
    });
}
