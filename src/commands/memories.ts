import { Command } from "commander";
import kleur from "kleur";
import prompts from "prompts";
import { getClient, parseMetadata } from "../lib/client.js";
import { CONTAINER_OPTION_DESC, CONTAINER_OPTION_FLAGS, requireContainerTag } from "../lib/container.js";
import { failUsage, printInfo, printJson, printSuccess, rootJsonFlag } from "../lib/output.js";
import type { MergeMemoriesBody, MergeMemoriesResponse } from "../lib/personal-types.js";

const MIN_MERGE_IDS = 2;
const MAX_MERGE_IDS = 20;

interface MergeOpts {
  into?: string;
  content?: string;
  type?: string;
  mergeKey?: string;
  metadata?: string[];
  container?: string;
  yes?: boolean;
}

/** Local validation of the merge set (mirrors MergeMemoriesDto) or exit 2. */
export function validateMergeIds(ids: string[], into: string | undefined, json: boolean): string[] {
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  if (unique.length < MIN_MERGE_IDS || unique.length > MAX_MERGE_IDS) {
    return failUsage(json, "invalid_argument", `merge needs between ${MIN_MERGE_IDS} and ${MAX_MERGE_IDS} distinct memory ids.`);
  }
  if (into !== undefined && !unique.includes(into)) {
    return failUsage(json, "invalid_argument", "--into must be one of the ids being merged.");
  }
  return unique;
}

export function registerMemoriesCommands(program: Command): void {
  const memories = program.command("memories").description("bulk memory operations");

  memories
    .command("merge <ids...>")
    .description("merge 2-20 memories into one (sources are soft-deleted and restorable)")
    .option("--into <id>", "keep this memory as the survivor (must be one of the ids)")
    .option("--content <text>", "content of the merged memory (required without --into)")
    .option("--type <memoryType>", "memoryType for a newly created survivor")
    .option("--merge-key <key>", "idempotency key (default: hash of the sorted ids)")
    .option("-m, --metadata <pair...>", "metadata key=value pairs (repeatable)")
    .option(CONTAINER_OPTION_FLAGS, CONTAINER_OPTION_DESC)
    .option("-y, --yes", "skip confirmation prompt", false)
    .action(async (rawIds: string[], opts: MergeOpts, cmd: Command) => {
      const json = rootJsonFlag(cmd);
      const ids = validateMergeIds(rawIds, opts.into, json);
      if (opts.into === undefined && !opts.content?.trim()) {
        return failUsage(json, "invalid_argument", "--content is required when no --into survivor is given.");
      }
      const metadata = parseMetadata(opts.metadata);
      const ctx = await getClient();
      const containerTag = requireContainerTag(ctx.cfg, opts.container, json);
      const sources = ids.filter((id) => id !== opts.into);
      if (!opts.yes) {
        if (!process.stdin.isTTY) {
          return failUsage(json, "confirmation_required", "Refusing to merge without --yes in a non-interactive shell.");
        }
        const { confirm } = await prompts({
          type: "confirm",
          name: "confirm",
          message: `Merge ${ids.length} memories${opts.into ? ` into ${opts.into}` : ""}? ${sources.length} source(s) will be soft-deleted.`,
          initial: false,
        });
        if (!confirm) return printInfo("Cancelled.");
      }
      const body: MergeMemoriesBody = {
        containerTag,
        ids,
        into: opts.into,
        content: opts.content?.trim() || undefined,
        memoryType: opts.type,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
        mergeKey: opts.mergeKey,
      };
      const result = await ctx.api.post<MergeMemoriesResponse>("/v1/memories/merge", body);
      if (json) return printJson(result);
      const verb = result.replayed ? "Already merged" : "Merged";
      printSuccess(
        `${verb} ${result.mergedFromIds.length} memories into ${kleur.dim(result.memory.id)} (${result.deletedIds.length} soft-deleted, restorable)`,
      );
    });
}
