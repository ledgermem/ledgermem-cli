import { Command } from "commander";
import kleur from "kleur";
import { readConfig, writeConfig } from "../lib/config.js";
import { printInfo, printJson, printSuccess, rootJsonFlag } from "../lib/output.js";

export function registerWorkspaceCommands(program: Command): void {
  const ws = program.command("workspace").description("manage workspaces");

  ws.command("list")
    .description("list known workspaces from local config")
    .action(async (_opts: unknown, cmd: Command) => {
      const json = rootJsonFlag(cmd.parent ?? cmd);
      const cfg = await readConfig();
      const workspaces = cfg.workspaces ?? (cfg.workspaceId ? [{ id: cfg.workspaceId }] : []);
      if (json) {
        printJson({ current: cfg.workspaceId ?? null, workspaces });
        return;
      }
      if (workspaces.length === 0) {
        printInfo("No workspaces configured. Run `getmnemo login`.");
        return;
      }
      for (const w of workspaces) {
        const marker = w.id === cfg.workspaceId ? kleur.green("*") : " ";
        process.stdout.write(`${marker} ${w.id}${w.name ? "  " + kleur.dim(w.name) : ""}\n`);
      }
    });

  ws.command("switch <workspaceId>")
    .description("switch the active workspace")
    .action(async (workspaceId: string, _opts: unknown, cmd: Command) => {
      const json = rootJsonFlag(cmd.parent ?? cmd);
      const cfg = await readConfig();
      const known = cfg.workspaces ?? [];
      const exists = known.some((w) => w.id === workspaceId);
      const nextWorkspaces = exists ? known : [...known, { id: workspaceId }];
      await writeConfig({
        ...cfg,
        workspaceId,
        workspaces: nextWorkspaces,
      });
      if (json) {
        printJson({ ok: true, workspaceId });
        return;
      }
      printSuccess(`Switched to workspace ${workspaceId}`);
    });
}
