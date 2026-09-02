import kleur from "kleur";

export interface RootOpts {
  json?: boolean;
}

interface CommandLike {
  parent?: CommandLike | null;
  opts(): RootOpts;
}

/** True when `--json` was given on this command or any ancestor (root flag). */
export function rootJsonFlag(cmd: CommandLike): boolean {
  let current: CommandLike | null | undefined = cmd;
  while (current) {
    if (current.opts().json) return true;
    current = current.parent;
  }
  return false;
}

export function printJson(value: unknown): void {
  process.stdout.write(JSON.stringify(value, null, 2) + "\n");
}

export function printSuccess(msg: string): void {
  process.stdout.write(kleur.green("✓ ") + msg + "\n");
}

export function printError(msg: string): void {
  process.stderr.write(kleur.red("✗ ") + msg + "\n");
}

export function printInfo(msg: string): void {
  process.stdout.write(kleur.cyan("→ ") + msg + "\n");
}

export function printHeading(msg: string): void {
  process.stdout.write(kleur.bold(msg) + "\n");
}

export function printLine(msg = ""): void {
  process.stdout.write(msg + "\n");
}

export function truncate(text: string, max = 80): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + "…";
}

/** `2026-09-03T10:00:00.000Z` → `2026-09-03 10:00Z`; null-safe. */
export function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  const match = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?/.exec(iso);
  if (!match) return iso;
  const [, day, time] = match;
  return time ? `${day} ${time}Z` : (day ?? iso);
}

/** Single-line first sentence of a memory/snippet. */
export function oneLine(text: string, max = 100): string {
  return truncate(text.replace(/\s+/g, " ").trim(), max);
}

/**
 * Usage failure: exit 2 with a stable machine-readable code under --json or
 * a human message otherwise. Runs before any network request.
 */
export function failUsage(json: boolean, code: string, message: string): never {
  if (json) {
    printJson({ ok: false, error: code, message });
  } else {
    printError(message);
  }
  return process.exit(2);
}

/** Parse an integer CLI flag within [min, max] or exit 2. */
export function parseIntFlag(
  raw: string | undefined,
  flag: string,
  json: boolean,
  bounds: { min: number; max: number; fallback: number },
): number {
  if (raw === undefined) return bounds.fallback;
  const value = Number.parseInt(raw, 10);
  if (Number.isNaN(value) || value < bounds.min || value > bounds.max || String(value) !== raw.trim()) {
    return failUsage(json, "invalid_argument", `${flag} must be an integer between ${bounds.min} and ${bounds.max}`);
  }
  return value;
}

/** Validate an ISO-8601 date/date-time flag (passed through verbatim) or exit 2. */
export function requireIsoDate(raw: string, flag: string, json: boolean): string {
  const trimmed = raw.trim();
  if (!trimmed || Number.isNaN(Date.parse(trimmed))) {
    return failUsage(json, "invalid_argument", `${flag} must be an ISO-8601 date or date-time (e.g. 2026-09-03T10:00:00Z)`);
  }
  return trimmed;
}

export function requireOneOf<T extends string>(
  raw: string | undefined,
  flag: string,
  allowed: readonly T[],
  json: boolean,
  fallback: T,
): T {
  if (raw === undefined) return fallback;
  if ((allowed as readonly string[]).includes(raw)) return raw as T;
  return failUsage(json, "invalid_argument", `${flag} must be one of: ${allowed.join(", ")}`);
}

export function systemTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}
