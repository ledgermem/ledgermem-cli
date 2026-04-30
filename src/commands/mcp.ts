import { Command } from "commander";
import { readConfig, resolveApiKey, resolveApiUrl, resolveWorkspaceId } from "../lib/config.js";
import { printJson, rootJsonFlag } from "../lib/output.js";

export function registerMcpCommand(program: Command): void {
  program
    .command("mcp")
    .description("print an MCP server config snippet for Claude Desktop / Cursor")
    .option("--client <name>", "target MCP client (claude|cursor)", "claude")
    .action(async (opts: { client?: string }, cmd: Command) => {
      const json = rootJsonFlag(cmd);
      const cfg = await readConfig();
      const apiKey = resolveApiKey(cfg) ?? "<your-getmnemo-api-key>";
      const workspaceId = resolveWorkspaceId(cfg) ?? "<your-workspace-id>";
      const apiUrl = resolveApiUrl(cfg);

      const snippet = {
        mcpServers: {
          getmnemo: {
            command: "npx",
            args: ["-y", "@mnemo/mcp"],
            env: {
              GETMNEMO_API_KEY: apiKey,
              GETMNEMO_WORKSPACE_ID: workspaceId,
              GETMNEMO_API_URL: apiUrl,
            },
          },
        },
      };

      if (json) {
        printJson({ client: opts.client ?? "claude", snippet });
        return;
      }

      const target = opts.client === "cursor"
        ? "~/.cursor/mcp.json"
        : "~/Library/Application Support/Claude/claude_desktop_config.json (macOS)";

      process.stdout.write(`# Add to: ${target}\n`);
      process.stdout.write(JSON.stringify(snippet, null, 2) + "\n");
    });
}
