import type { Plugin } from "@opencode-ai/plugin";
import { readFile, access } from "fs/promises";
import { dirname, join } from "path";

/**
 * holocron-agents-loader — Milestone 14: Context Injection Upgrades
 *
 * Hierarchical Context: hooks into tool.execute.after for the "read" tool.
 * When a file is read, walks up its directory tree looking for context files.
 * Any found are appended to the tool output, injecting directory-specific rules
 * into the agent's context window only when it actually reads from that directory.
 *
 * Supported context files (checked in priority order per directory):
 *   1. AGENTS.md  — preferred; used if present
 *   2. CLAUDE.md  — fallback; used only when no AGENTS.md exists in that directory
 *
 * This gives per-directory behavioral rules (e.g., React standards in components/,
 * API constraints in routes/) without polluting the global system prompt.
 *
 * Hook strategy:
 *   tool.execute.after → intercept read tool results, walk directories, append context
 *
 * Deduplication:
 *   Module-level Set<string> tracks injected file paths per session.
 *   Each unique context file is injected at most once per session.
 *
 * Walk strategy:
 *   Walk from file's directory upward toward root, max 20 levels.
 *   At each level: use AGENTS.md if present, else CLAUDE.md if present, else skip.
 *   Returns paths in bottom-up order (most specific directory first).
 */

const PLUGIN_TAG = "[holocron-agents-loader]";

/** Maximum number of directory levels to walk upward from a file. */
export const MAX_WALK_DEPTH = 20;

/** Context filenames in priority order. First match per directory wins. */
export const CONTEXT_FILENAMES = ["AGENTS.md", "CLAUDE.md"] as const;

// ── Deduplication ─────────────────────────────────────────────────────────────

/**
 * Module-level set tracking which context file paths have already been injected
 * in this session. Reset is intentionally not provided — dedup is session-scoped.
 */
export const injectedPaths = new Set<string>();

/** Reset for testing — clears the dedup set between test cases. */
export function resetInjectedPaths(): void {
  injectedPaths.clear();
}

// ── Directory walk ────────────────────────────────────────────────────────────

/**
 * Walk upward from `startDir` toward the filesystem root.
 *
 * At each directory level, checks for context files in priority order
 * (AGENTS.md first, then CLAUDE.md). Returns the first match found per level.
 * If AGENTS.md is present, CLAUDE.md at the same level is ignored.
 *
 * Returns winning paths in bottom-up order (most specific directory first).
 * Caps at MAX_WALK_DEPTH to prevent runaway on deep trees or symlink cycles.
 */
export async function walkForContextFiles(startDir: string): Promise<string[]> {
  const found: string[] = [];
  let current = startDir;
  let depth = 0;

  while (depth < MAX_WALK_DEPTH) {
    // Check each filename in priority order — take the first one that exists
    for (const filename of CONTEXT_FILENAMES) {
      const candidate = join(current, filename);
      try {
        await access(candidate);
        found.push(candidate);
        break; // AGENTS.md found — do not check CLAUDE.md at this level
      } catch {
        // Not present at this level — try next filename
      }
    }

    const parent = dirname(current);

    // Stop at filesystem root (dirname of root returns root itself)
    if (parent === current) {
      break;
    }

    current = parent;
    depth++;
  }

  return found;
}

// ── Content reading ───────────────────────────────────────────────────────────

/**
 * Read a context file and return its content, or null if unreadable.
 * Errors are swallowed — an unreadable file should not break file reads.
 */
export async function readContextFile(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf-8");
  } catch {
    return null;
  }
}

// ── Injection formatting ──────────────────────────────────────────────────────

/**
 * Format a discovered context file for appending to the tool output.
 * Wraps in a clear header so the agent knows the source.
 */
export function formatInjection(contextFilePath: string, content: string): string {
  return [
    "",
    `<!-- holocron-agents-loader: local rules from ${contextFilePath} -->`,
    `# Local Rules (${contextFilePath})`,
    "",
    content.trim(),
    "",
    `<!-- end local rules -->`,
  ].join("\n");
}

// ── Backwards-compatible alias ────────────────────────────────────────────────

/** @deprecated Use walkForContextFiles. Kept for test compatibility. */
export const walkForAgentsMd = walkForContextFiles;

/** @deprecated Use readContextFile. Kept for test compatibility. */
export const readAgentsMd = readContextFile;

// ── Plugin ────────────────────────────────────────────────────────────────────

export const HolocronAgentsLoader: Plugin = async ({ client }) => {
  await client.app.log({
    body: {
      service: PLUGIN_TAG,
      level: "info",
      message: "Hierarchical context loader initialized (AGENTS.md > CLAUDE.md per directory).",
    },
  });

  // Log whether HOLOCRON_MEMORY_DIR is set (not required, but useful for debugging)
  const memoryDir = process.env.HOLOCRON_MEMORY_DIR;
  if (!memoryDir) {
    await client.app.log({
      body: {
        service: PLUGIN_TAG,
        level: "warn",
        message: "HOLOCRON_MEMORY_DIR not set — plugin will still function but cannot filter memory-dir reads.",
      },
    });
  }

  return {
    /**
     * tool.execute.after fires after any tool completes.
     * We intercept "read" tool calls, walk the file's directory tree for AGENTS.md,
     * and append any found (not yet injected) content to the tool output.
     */
    "tool.execute.after": async (input, output) => {
      // Only intercept the read tool
      if (input.tool !== "read") return;

      // Extract filePath from args — fail gracefully if missing or not a string
      const filePath = (input as any).args?.filePath;
      if (typeof filePath !== "string" || !filePath) return;

      // Walk upward from the file's directory
      const startDir = dirname(filePath);
      let contextPaths: string[];
      try {
        contextPaths = await walkForContextFiles(startDir);
      } catch {
        return; // Walk failed — do not break the tool output
      }

      if (contextPaths.length === 0) return;

      const injections: string[] = [];

      for (const contextPath of contextPaths) {
        // Skip if already injected in this session
        if (injectedPaths.has(contextPath)) continue;

        const content = await readContextFile(contextPath);
        if (!content) {
          await client.app.log({
            body: {
              service: PLUGIN_TAG,
              level: "warn",
              message: `Could not read ${contextPath} — skipping`,
            },
          });
          continue;
        }

        injectedPaths.add(contextPath);
        injections.push(formatInjection(contextPath, content));

        await client.app.log({
          body: {
            service: PLUGIN_TAG,
            level: "info",
            message: `Injected local rules from ${contextPath}`,
          },
        });
      }

      if (injections.length > 0) {
        (output as any).output = ((output as any).output ?? "") + injections.join("\n");
      }
    },
  };
};
