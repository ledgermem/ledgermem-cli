import { Command } from "commander";
import kleur from "kleur";
import { getClient } from "../lib/client.js";
import {
  failUsage,
  formatWhen,
  parseIntFlag,
  printHeading,
  printInfo,
  printJson,
  printLine,
  printSuccess,
  rootJsonFlag,
  truncate,
} from "../lib/output.js";
import type {
  CreatePersonBody,
  ImportantDateInput,
  ListPeopleResponse,
  Person,
} from "../lib/personal-types.js";

interface ListOpts {
  q?: string;
  includeArchived?: boolean;
  limit?: string;
  cursor?: string;
}

interface AddOpts {
  slug?: string;
  relationship?: string;
  email?: string;
  phone?: string;
  company?: string;
  notes?: string;
  alias?: string[];
  importantDate?: string[];
}

const IMPORTANT_DATE_RE = /^(\d{4}-\d{2}-\d{2})(?::(recurring))?$/;

/** `label=YYYY-MM-DD[:recurring]` → ImportantDateInput, or exit 2. */
export function parseImportantDates(raw: string[] | undefined, json: boolean): ImportantDateInput[] | undefined {
  if (!raw || raw.length === 0) return undefined;
  return raw.map((entry) => {
    const idx = entry.indexOf("=");
    const label = idx === -1 ? "" : entry.slice(0, idx).trim();
    const match = idx === -1 ? null : IMPORTANT_DATE_RE.exec(entry.slice(idx + 1).trim());
    if (!label || !match || !match[1]) {
      return failUsage(
        json,
        "invalid_argument",
        `Invalid --important-date "${entry}". Expected label=YYYY-MM-DD or label=YYYY-MM-DD:recurring.`,
      );
    }
    return { label, date: match[1], recurring: match[2] === "recurring" };
  });
}

function printPerson(person: Person): void {
  printHeading(`${person.displayName} ${kleur.dim(`(${person.tag})`)}`);
  if (person.relationship) printInfo(`relationship: ${person.relationship}`);
  if (person.company) printInfo(`company:      ${person.company}`);
  if (person.email) printInfo(`email:        ${person.email}`);
  if (person.phone) printInfo(`phone:        ${person.phone}`);
  if (person.aliases.length > 0) printInfo(`aliases:      ${person.aliases.join(", ")}`);
  printInfo(`memories:     ${person.memoryCount}`);
  printInfo(
    `reminders:    ${person.openReminderCount} open${person.nextReminderAt ? `, next ${formatWhen(person.nextReminderAt)}` : ""}`,
  );
  for (const d of person.importantDates) {
    printInfo(`date:         ${d.label} ${d.date}${d.recurring ? " (recurring)" : ""}`);
  }
  if (person.notes) printInfo(`notes:        ${truncate(person.notes, 200)}`);
  if (person.archivedAt) printInfo(kleur.yellow(`archived:     ${formatWhen(person.archivedAt)}`));
}

export function registerPeopleCommands(program: Command): void {
  const people = program.command("people").description("manage people (one memory container per person)");

  people
    .command("list")
    .description("list people in the workspace")
    .option("-q, --q <text>", "filter by name or email")
    .option("--include-archived", "include archived people", false)
    .option("-l, --limit <n>", "page size (1-100)", "50")
    .option("-c, --cursor <cursor>", "pagination cursor")
    .action(async (opts: ListOpts, cmd: Command) => {
      const json = rootJsonFlag(cmd);
      const limit = parseIntFlag(opts.limit, "--limit", json, { min: 1, max: 100, fallback: 50 });
      const ctx = await getClient();
      const result = await ctx.api.get<ListPeopleResponse>("/v1/people", {
        limit,
        cursor: opts.cursor,
        q: opts.q,
        includeArchived: opts.includeArchived ? true : undefined,
      });
      if (json) return printJson(result);
      if (result.items.length === 0) return printInfo("No people yet. Add one with `getmnemo people add <name>`.");
      for (const p of result.items) {
        const slug = kleur.dim(p.slug.padEnd(24).slice(0, 24));
        const rel = p.relationship ? kleur.dim(` · ${p.relationship}`) : "";
        const archived = p.archivedAt ? kleur.yellow(" [archived]") : "";
        printLine(
          `${slug}  ${p.displayName}${rel}${archived}  ${kleur.dim(`${p.memoryCount} memories, ${p.openReminderCount} open reminders`)}`,
        );
      }
      if (result.nextCursor) printInfo(`more: --cursor ${result.nextCursor}`);
    });

  people
    .command("get <slug>")
    .description("show a person")
    .action(async (slug: string, _opts: unknown, cmd: Command) => {
      const json = rootJsonFlag(cmd);
      const ctx = await getClient();
      const person = await ctx.api.get<Person>(`/v1/people/${encodeURIComponent(slug)}`);
      if (json) return printJson(person);
      printPerson(person);
    });

  people
    .command("add <displayName>")
    .description("add a person")
    .option("--slug <slug>", "explicit slug (default: derived from the name)")
    .option("--relationship <text>", "e.g. friend, client, manager")
    .option("--email <email>")
    .option("--phone <phone>", "E.164 preferred, e.g. +14155550123")
    .option("--company <text>")
    .option("--notes <text>")
    .option("--alias <name...>", "alternate names (repeatable)")
    .option(
      "--important-date <entry...>",
      "important dates as label=YYYY-MM-DD[:recurring], e.g. birthday=1990-05-04:recurring (repeatable)",
    )
    .action(async (displayName: string, opts: AddOpts, cmd: Command) => {
      const json = rootJsonFlag(cmd);
      const name = displayName.trim();
      if (!name) return failUsage(json, "invalid_argument", "displayName must not be empty");
      const importantDates = parseImportantDates(opts.importantDate, json);
      const body: CreatePersonBody = {
        displayName: name,
        slug: opts.slug,
        relationship: opts.relationship,
        email: opts.email,
        phone: opts.phone,
        company: opts.company,
        notes: opts.notes,
        aliases: opts.alias && opts.alias.length > 0 ? opts.alias : undefined,
        importantDates,
      };
      const ctx = await getClient();
      const person = await ctx.api.post<Person>("/v1/people", body);
      if (json) return printJson(person);
      printSuccess(`Added ${person.displayName} ${kleur.dim(`(${person.tag})`)}`);
    });
}
