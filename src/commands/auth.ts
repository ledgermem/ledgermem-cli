import { Command } from "commander";
import prompts from "prompts";
import {
  clearConfig,
  readConfig,
  resolveApiUrl,
  writeConfig,
} from "../lib/config.js";
import { printJson, printSuccess, printInfo, rootJsonFlag } from "../lib/output.js";

export function registerAuthCommands(program: Command): void {
  program
    .command("login")
    .description("authenticate with LedgerMem and save credentials locally")
    .option("--api-key <key>", "API key (skips interactive prompt)")
    .option("--workspace-id <id>", "workspace id (skips interactive prompt)")
    .option("--api-url <url>", "override API base URL")
    .action(async (opts: { apiKey?: string; workspaceId?: string; apiUrl?: string }, cmd: Command) => {
      const json = rootJsonFlag(cmd);
      const cfg = await readConfig();
      const defaultApiUrl = resolveApiUrl(cfg);

      const responses = await prompts(
        [
          {
            type: opts.apiKey ? null : "password",
            name: "apiKey",
            message: "LedgerMem API key",
            validate: (val: string) => (val.trim().length > 0 ? true : "API key is required"),
          },
          {
            type: opts.workspaceId ? null : "text",
            name: "workspaceId",
            message: "Workspace ID",
            validate: (val: string) => (val.trim().length > 0 ? true : "Workspace ID is required"),
          },
          {
            type: opts.apiUrl ? null : "text",
            name: "apiUrl",
            message: "API URL",
            initial: defaultApiUrl,
          },
        ],
        {
          onCancel: () => {
            throw new Error("login cancelled");
          },
        },
      );

      const apiKey = opts.apiKey ?? (responses.apiKey as string);
      const workspaceId = opts.workspaceId ?? (responses.workspaceId as string);
      const apiUrl = opts.apiUrl ?? (responses.apiUrl as string) ?? defaultApiUrl;

      await writeConfig({ apiKey, workspaceId, apiUrl });

      if (json) {
        printJson({ ok: true, workspaceId, apiUrl });
        return;
      }
      printSuccess(`Logged in. Workspace: ${workspaceId}`);
    });

  program
    .command("logout")
    .description("remove saved credentials")
    .action(async (_opts: unknown, cmd: Command) => {
      const json = rootJsonFlag(cmd);
      await clearConfig();
      if (json) {
        printJson({ ok: true });
        return;
      }
      printSuccess("Logged out.");
    });

  program
    .command("whoami")
    .description("show the current authenticated workspace")
    .action(async (_opts: unknown, cmd: Command) => {
      const json = rootJsonFlag(cmd);
      const cfg = await readConfig();
      const apiKey = process.env.LEDGERMEM_API_KEY ?? cfg.apiKey;
      const workspaceId = process.env.LEDGERMEM_WORKSPACE_ID ?? cfg.workspaceId;
      const apiUrl = resolveApiUrl(cfg);

      const payload = {
        authenticated: Boolean(apiKey && workspaceId),
        workspaceId: workspaceId ?? null,
        apiUrl,
        apiKeyPreview: apiKey ? `${apiKey.slice(0, 4)}…${apiKey.slice(-4)}` : null,
      };

      if (json) {
        printJson(payload);
        return;
      }
      if (!payload.authenticated) {
        printInfo("Not logged in. Run `ledgermem login`.");
        return;
      }
      printInfo(`Workspace: ${payload.workspaceId}`);
      printInfo(`API URL:   ${payload.apiUrl}`);
      printInfo(`API key:   ${payload.apiKeyPreview}`);
    });
}
