#!/usr/bin/env node
import { Command } from "commander";
import kleur from "kleur";
import { pathToFileURL } from "node:url";
import { registerAuthCommands } from "./commands/auth.js";
import { registerMemoryCommands } from "./commands/memory.js";
import { registerWorkspaceCommands } from "./commands/workspace.js";
import { registerMcpCommand } from "./commands/mcp.js";
import { registerDoctorCommand } from "./commands/doctor.js";

const VERSION = "0.1.0";

export function buildCli(): Command {
  const program = new Command();

  program
    .name("ledgermem")
    .description(kleur.cyan("LedgerMem CLI") + " — manage memories from your terminal.")
    .version(VERSION, "-v, --version", "print the CLI version")
    .option("--json", "format output as JSON for machine consumption", false)
    .showHelpAfterError("(add --help for additional information)");

  registerAuthCommands(program);
  registerMemoryCommands(program);
  registerWorkspaceCommands(program);
  registerMcpCommand(program);
  registerDoctorCommand(program);

  program.exitOverride((err) => {
    if (err.code === "commander.helpDisplayed" || err.code === "commander.version") {
      process.exit(0);
    }
    if (err.code === "commander.unknownCommand" || err.code === "commander.unknownOption") {
      process.exit(2);
    }
    process.exit(err.exitCode ?? 1);
  });

  return program;
}

async function main(): Promise<void> {
  const program = buildCli();
  try {
    await program.parseAsync(process.argv);
  } catch (err) {
    if (err instanceof Error) {
      process.stderr.write(kleur.red(`error: ${err.message}\n`));
    } else {
      process.stderr.write(kleur.red(`error: ${String(err)}\n`));
    }
    process.exit(1);
  }
}

function isMainModule(): boolean {
  const argv1 = process.argv[1];
  if (!argv1) return false;
  try {
    return import.meta.url === pathToFileURL(argv1).href;
  } catch {
    return false;
  }
}

if (isMainModule()) {
  void main();
}
