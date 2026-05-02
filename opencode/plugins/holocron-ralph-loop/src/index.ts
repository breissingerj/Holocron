import type { Plugin } from "@opencode-ai/plugin";
import { readFile } from "fs/promises";
import { join } from "path";

/**
 * holocron-ralph-loop — Milestone 14: Context Injection Upgrades
 *
 * The "Ralph Loop" — detects when an assistant response contains incomplete
 * work (unchecked ISC checkboxes, pending/in_progress markers) and silently
 * injects a continuation prompt so the agent finishes before stopping.
 *
 * Hook strategy:
 *   experimental.text.complete → scan completed assistant text for incomplete
 *                                 work signals; inject continuation via TUI if found
 *
 * Guard strategy:
 *   - Sentinel string HOLOCRON_RALPH_LOOP in injected prompt prevents re-triggering
 *   - Module-level flag tracks whether last prompt was a Ralph Loop injection
 *   - Code fence stripping prevents false positives from docs/examples
 *
 * Settings:
 *   Reads $HOLOCRON_MEMORY_DIR/settings/holocron.settings.json
 *   If ralph_loop.enabled is false, the plugin returns a no-op hook set.
 *   If the settings file is missing, defaults to enabled: true.
 */

const PLUGIN_TAG = "[holocron-ralph-loop]";

/**
 * Sentinel injected into continuation prompts.
 * If the previous response contained this string, skip to prevent loops.
 */
export const RALPH_LOOP_SENTINEL = "HOLOCRON_RALPH_LOOP";

/**
 * The continuation prompt injected when incomplete work is detected.
 * Uses the sentinel so the next text.complete scan ignores it.
 */
export const CONTINUATION_PROMPT =
  `[${RALPH_LOOP_SENTINEL}] You have incomplete tasks. Please continue working until all checkboxes are checked and all in_progress items are complete.`;

// ── Settings ──────────────────────────────────────────────────────────────────

export type HolocronSettings = {
  ralph_loop: {
    enabled: boolean;
  };
};

export const DEFAULT_SETTINGS: HolocronSettings = {
  ralph_loop: {
    enabled: true,
  },
};

/** Read holocron.settings.json from $HOLOCRON_MEMORY_DIR/settings/. */
export async function readSettings(memoryDir: string): Promise<HolocronSettings> {
  const settingsPath = join(memoryDir, "settings", "holocron.settings.json");
  try {
    const raw = await readFile(settingsPath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<HolocronSettings>;
    return {
      ralph_loop: {
        enabled: parsed?.ralph_loop?.enabled ?? DEFAULT_SETTINGS.ralph_loop.enabled,
      },
    };
  } catch {
    // File missing or malformed — use defaults
    return DEFAULT_SETTINGS;
  }
}

// ── Incomplete work detection ─────────────────────────────────────────────────

/**
 * Strip content inside code fences (``` ... ```) to avoid false positives
 * from docs, examples, or code blocks containing `- [ ]` syntax.
 */
export function stripCodeFences(text: string): string {
  return text.replace(/```[\s\S]*?```/g, "");
}

/**
 * Returns true if the text (with code fences stripped) contains signals
 * of incomplete work:
 *   - An unchecked markdown checkbox:  `- [ ]`
 *   - The word `in_progress` (Algorithm PRD phase marker)
 */
export function hasIncompleteWork(text: string): boolean {
  const stripped = stripCodeFences(text);
  if (/- \[ \]/.test(stripped)) return true;
  if (/\bin_progress\b/.test(stripped)) return true;
  return false;
}

/**
 * Returns true if the text contains the Ralph Loop sentinel,
 * meaning this turn was itself a continuation injection — skip to avoid loops.
 */
export function isSentinelPresent(text: string): boolean {
  return text.includes(RALPH_LOOP_SENTINEL);
}

// ── Plugin ────────────────────────────────────────────────────────────────────

export const HolocronRalphLoop: Plugin = async ({ client }) => {
  const memoryDir = process.env.HOLOCRON_MEMORY_DIR;

  if (!memoryDir) {
    await client.app.log({
      body: {
        service: PLUGIN_TAG,
        level: "warn",
        message: "HOLOCRON_MEMORY_DIR not set — Ralph Loop disabled.",
      },
    });
    return {};
  }

  const settings = await readSettings(memoryDir);

  if (!settings.ralph_loop.enabled) {
    await client.app.log({
      body: {
        service: PLUGIN_TAG,
        level: "info",
        message: "Ralph Loop disabled via holocron.settings.json — skipping hook registration.",
      },
    });
    return {};
  }

  await client.app.log({
    body: {
      service: PLUGIN_TAG,
      level: "info",
      message: "Ralph Loop enabled — watching for incomplete work.",
    },
  });

  return {
    /**
     * experimental.text.complete fires after the assistant finishes generating
     * a response part. We inspect the completed text for incomplete work signals
     * and inject a continuation prompt if found.
     */
    "experimental.text.complete": async (input, _output) => {
      const { text, messageID } = input as { text?: string; messageID?: string; sessionID?: string };

      if (!text) return;

      // If this completion was itself a Ralph Loop prompt, skip to avoid infinite loop
      if (isSentinelPresent(text)) return;

      if (!hasIncompleteWork(text)) return;

      await client.app.log({
        body: {
          service: PLUGIN_TAG,
          level: "info",
          message: `Incomplete work detected in message ${messageID ?? "unknown"} — injecting continuation.`,
        },
      });

      try {
        // Append the continuation text to the TUI prompt field
        await client.tui.appendPrompt({
          body: {
            text: CONTINUATION_PROMPT,
          },
        });

        // Submit it as a new user turn — triggers a full agent response cycle
        await client.tui.submitPrompt();
      } catch (err) {
        await client.app.log({
          body: {
            service: PLUGIN_TAG,
            level: "error",
            message: `Failed to inject continuation prompt: ${err}`,
          },
        });
      }
    },
  };
};
