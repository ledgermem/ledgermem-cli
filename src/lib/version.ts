import { createRequire } from "node:module";

/**
 * Single source of truth for the CLI version: read from package.json at
 * runtime (works from both `dist/` and `src/` because both sit one level
 * below the package root). A hardcoded const drifted before (0.2.0 vs 0.2.1).
 */
function readPackageVersion(): string {
  try {
    const require = createRequire(import.meta.url);
    const pkg: unknown = require("../../package.json");
    if (pkg && typeof pkg === "object" && "version" in pkg) {
      const version = (pkg as { version: unknown }).version;
      if (typeof version === "string" && version.length > 0) return version;
    }
  } catch {
    // fall through
  }
  return "0.0.0-unknown";
}

export const CLI_VERSION: string = readPackageVersion();
