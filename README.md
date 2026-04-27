# @ledgermem/cli

The official command-line interface for [LedgerMem](https://proofly.dev) — a verifiable, append-only memory layer for AI agents.

`ledgermem` lets you create, search, and manage memories from your terminal, plus drop a turnkey MCP config snippet into Claude Desktop or Cursor.

## Install

```bash
npm install -g @ledgermem/cli
```

Or run without installing:

```bash
npx @ledgermem/cli --help
```

## Quickstart

```bash
ledgermem login                       # save API key + workspace to ~/.ledgermem/config.json
ledgermem add "Acme prefers blue branding"
ledgermem search "what brand color does Acme use?"
ledgermem doctor                      # verify auth + API reachability
```

## Commands

### Authentication

| Command | Description |
| --- | --- |
| `ledgermem login` | Prompt for API key, workspace ID, and (optionally) API URL; persist to `~/.ledgermem/config.json`. |
| `ledgermem logout` | Remove saved credentials. |
| `ledgermem whoami` | Print the active workspace + API URL. |

`login` flags: `--api-key`, `--workspace-id`, `--api-url` (skip the prompt).

### Memory operations

| Command | Description |
| --- | --- |
| `ledgermem add "<content>" [-m key=value ...]` | Add a memory with optional metadata. |
| `ledgermem search "<query>" [--limit 5]` | Semantic search. |
| `ledgermem get <id>` | Fetch a single memory. |
| `ledgermem rm <id> [--yes]` | Delete a memory. |
| `ledgermem list [--limit 20] [--cursor <c>]` | Paginate the workspace. |

### Workspaces

| Command | Description |
| --- | --- |
| `ledgermem workspace list` | List workspaces from local config. |
| `ledgermem workspace switch <id>` | Switch the active workspace. |

### Other

| Command | Description |
| --- | --- |
| `ledgermem mcp [--client claude\|cursor]` | Print an MCP server config snippet. |
| `ledgermem doctor` | Check auth + `GET /healthz`. |

## Global flags

- `--json` — emit machine-readable JSON instead of pretty output. Honoured by every command.
- `--version` / `-v`
- `--help` / `-h`

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Success |
| `1` | Runtime error (auth missing, API failure, not found, ...) |
| `2` | Invalid arguments / unknown command |

## Environment variables

| Variable | Purpose | Default |
| --- | --- | --- |
| `LEDGERMEM_API_KEY` | Overrides the saved API key. | — |
| `LEDGERMEM_WORKSPACE_ID` | Overrides the active workspace. | — |
| `LEDGERMEM_API_URL` | Overrides the API base URL. | `https://api.proofly.dev` |

Environment variables take precedence over `~/.ledgermem/config.json`.

## Examples

```bash
# add a tagged memory
ledgermem add "Customer asked about SOC 2 timeline" -m customer=acme -m channel=email

# JSON output for piping into jq
ledgermem search "soc 2" --limit 3 --json | jq '.results[].id'

# delete without prompting (CI-safe)
ledgermem rm mem_01HX... --yes

# generate Claude Desktop MCP config
ledgermem mcp --client claude > claude_desktop_config.json
```

## Development

```bash
npm install
npm run dev -- --help    # run from source via tsx
npm run build            # compile to dist/
npm test                 # vitest
```

## License

[MIT](./LICENSE)
