import type { Plugin } from "@opencode-ai/plugin";
import { appendFile, mkdir } from "fs/promises";
import { dirname } from "path";

/**
 * holocron-memory-feed — Milestone 13: Memory Feed Sidebar
 *
 * Watches for file.edited events and appends a timestamped entry to
 * /tmp/holocron-memory-feed.log whenever the agent writes a file inside
 * $HOLOCRON_MEMORY_DIR.
 *
 * Pair with scripts/memory-feed.sh running in a Ghostty split pane to get a
 * live sidebar showing every memory write during the session.
 *
 * Log format (one line per write):
 *   <ISO timestamp> <TAB> <short label> <TAB> <absolute path>
 *
 * Example:
 *   2026-03-15T20:14:02.123Z	WORK	/Users/jack/.memory/WORK/my-task/PRD.md
 */

const PLUGIN_TAG = "[holocron-memory-feed]";
const LOG_FILE = "/tmp/holocron-memory-feed.log";

/** Classify a memory path into a short human-readable label. */
function classifyPath(filePath: string): string {
  if (filePath.includes("/WORK/")) return "WORK";
  if (filePath.includes("/LEARNING/CAPTURES/")) return "CAPTURE";
  if (filePath.includes("/LEARNING/REFLECTIONS/")) return "REFLECT";
  if (filePath.includes("/LEARNING/SIGNALS/")) return "SIGNAL";
  if (filePath.includes("/LEARNING/")) return "LEARN";
  if (filePath.includes("/RELATIONSHIP/") || filePath.includes("/memory/MEMORY")) return "MEMORY";
  if (filePath.includes("/STATE/")) return "STATE";
  if (filePath.includes("/RESEARCH/")) return "RESEARCH";
  return "MEM";
}

export const HolocronMemoryFeed: Plugin = async ({ client }) => {
  const memoryDir = process.env.HOLOCRON_MEMORY_DIR;

  if (!memoryDir) {
    await client.app.log({
      body: {
        service: PLUGIN_TAG,
        level: "info",
        message: "HOLOCRON_MEMORY_DIR not set — memory feed disabled",
      },
    });
    return {};
  }

  // Ensure the log file's parent dir exists (it's /tmp so it always will, but
  // guard anyway for custom LOG_FILE overrides via env var).
  await mkdir(dirname(LOG_FILE), { recursive: true });

  await client.app.log({
    body: {
      service: PLUGIN_TAG,
      level: "info",
      message: `Memory feed active — watching ${memoryDir}, logging to ${LOG_FILE}`,
    },
  });

  return {
    event: async ({ event }) => {
      if (event.type !== "file.edited") return;

      const filePath: string = event.properties?.file ?? "";
      if (!filePath || !filePath.startsWith(memoryDir)) return;

      const label = classifyPath(filePath);
      const ts = new Date().toISOString();
      const line = `${ts}\t${label}\t${filePath}\n`;

      try {
        await appendFile(LOG_FILE, line, "utf-8");
      } catch (err) {
        await client.app.log({
          body: {
            service: PLUGIN_TAG,
            level: "warn",
            message: `Failed to write feed entry: ${err}`,
          },
        });
      }
    },
  };
};
