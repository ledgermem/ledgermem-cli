import kleur from "kleur";

export interface RootOpts {
  json?: boolean;
}

export function rootJsonFlag(cmd: { parent?: { opts(): RootOpts } | null; opts(): RootOpts }): boolean {
  return Boolean(cmd.opts().json) || Boolean(cmd.parent?.opts().json);
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

export function truncate(text: string, max = 80): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + "…";
}
