import { resolveContainerTag, type CliConfig } from "./config.js";
import { failUsage } from "./output.js";

export const CONTAINER_OPTION_FLAGS = "-C, --container <tag>";
export const CONTAINER_OPTION_DESC =
  "container tag / tenant boundary (e.g. user:jane); falls back to GETMNEMO_CONTAINER or config";

/**
 * Resolve a container tag (flag > GETMNEMO_CONTAINER > config) or exit 2.
 * Every container-scoped route 400s without one, so fail before any request.
 */
export function requireContainerTag(cfg: CliConfig, flag: string | undefined, json: boolean): string {
  const containerTag = resolveContainerTag(cfg, flag);
  if (!containerTag) {
    return failUsage(
      json,
      "container_required",
      "A container is required. Pass --container <tag>, set GETMNEMO_CONTAINER, or add defaultContainerTag to your config.",
    );
  }
  return containerTag;
}
