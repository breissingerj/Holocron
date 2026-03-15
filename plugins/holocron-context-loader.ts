import type { Plugin } from "@opencode-ai/plugin";
import { readFile, readdir, stat } from "fs/promises";
import { join, basename } from "path";

/**
 * holocron-context-loader — Milestone 6: Personal Context Loading
 *
 * Injects personal memory, user identity, and active work context into every
 * OpenCode session. Reads from $HOLOCRON_MEMORY_DIR per MEMORY_CONTRACT.md.
 *
 * Hooks:
 *   session.created            → prepend memory context to the user's first prompt
 *   experimental.session.compacting → re-inject memory into compaction summaries
 *                                     so context survives context window resets
 */

const PLUGIN_TAG = "[holocron-context-loader]";

async function readFileSafe(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf-8");
  } catch {
    return null;
  }
}

async function getMostRecentPRD(workDir: string): Promise<string | null> {
  try {
    const entries = await readdir(workDir, { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
    if (dirs.length === 0) return null;

    // Find the most recently modified PRD.md
    let latestTime = 0;
    let latestPRD: { slug: string; task: string; phase: string } | null = null;

    for (const slug of dirs) {
      const prdPath = join(workDir, slug, "PRD.md");
      try {
        const s = await stat(prdPath);
        if (s.mtimeMs > latestTime) {
          const content = await readFileSafe(prdPath);
          if (content) {
            // Extract task and phase from YAML frontmatter
            const taskMatch = content.match(/^task:\s*(.+)$/m);
            const phaseMatch = content.match(/^phase:\s*(.+)$/m);
            if (taskMatch && phaseMatch) {
              latestTime = s.mtimeMs;
              latestPRD = {
                slug,
                task: taskMatch[1].trim(),
                phase: phaseMatch[1].trim(),
              };
            }
          }
        }
      } catch {
        // skip unreadable PRDs
      }
    }

    if (!latestPRD) return null;
    return `Active work: "${latestPRD.task}" (phase: ${latestPRD.phase}, slug: ${latestPRD.slug})`;
  } catch {
    return null;
  }
}

async function buildContextBlock($: any): Promise<string | null> {
  // $HOLOCRON_MEMORY_DIR must be set — fail gracefully if not
  const memoryDir = process.env.HOLOCRON_MEMORY_DIR;
  if (!memoryDir) {
    return null;
  }

  const sections: string[] = [];

  // 1. User identity / preferences
  const identityPath = join(memoryDir, "memory", "IDENTITY.md");
  const identity = await readFileSafe(identityPath);
  if (identity) {
    sections.push(`## Identity\n${identity.trim()}`);
  }

  // 2. Relationship memory index
  const memoryPath = join(memoryDir, "memory", "MEMORY.md");
  const memory = await readFileSafe(memoryPath);
  if (memory) {
    // Inject the full MEMORY.md (it's kept under 200 lines per contract)
    sections.push(`## Memory\n${memory.trim()}`);
  }

  // 3. Active work summary — most recent PRD only
  const workDir = join(memoryDir, "WORK");
  const activeWork = await getMostRecentPRD(workDir);
  if (activeWork) {
    sections.push(`## Active Work\n${activeWork}`);
  }

  if (sections.length === 0) return null;

  return [
    "<!-- holocron-context-loader: personal context injected at session start -->",
    "# Personal Context",
    "",
    ...sections,
    "",
    "<!-- end personal context -->",
  ].join("\n");
}

export const HolocronContextLoader: Plugin = async ({ $, client }) => {
  return {
    /**
     * session.created fires when a new session is opened.
     * We prepend personal context to the first user prompt via tui.prompt.append.
     * This ensures the agent sees identity + memory before any user message.
     */
    "session.created": async () => {
      try {
        const context = await buildContextBlock($);
        if (!context) {
          await client.app.log({
            body: {
              service: PLUGIN_TAG,
              level: "info",
              message:
                "HOLOCRON_MEMORY_DIR not set or no memory found — skipping context injection",
            },
          });
          return;
        }

        await client.app.log({
          body: {
            service: PLUGIN_TAG,
            level: "info",
            message: "Injecting personal context into session",
          },
        });

        // tui.prompt.append will be triggered via the event system below —
        // here we store the context for the prompt append hook to use
        // Note: session.created fires before any user input, so we use a
        // module-level variable to pass context to the tui.prompt.append handler
        pendingContextBlock = context;
      } catch (err) {
        await client.app.log({
          body: {
            service: PLUGIN_TAG,
            level: "warn",
            message: `Context injection failed: ${err}`,
          },
        });
      }
    },

    /**
     * tui.prompt.append fires before a prompt is submitted to the model.
     * On the first prompt after session creation, prepend the personal context block.
     */
    "tui.prompt.append": async (_input: any, output: any) => {
      if (pendingContextBlock) {
        const block = pendingContextBlock;
        pendingContextBlock = null; // consume — only inject once per session
        output.text = `${block}\n\n${output.text ?? ""}`;
      }
    },

    /**
     * experimental.session.compacting fires before the LLM generates a
     * compaction summary. Re-inject personal context so it survives the reset.
     */
    "experimental.session.compacting": async (
      _input: any,
      output: any
    ) => {
      try {
        const context = await buildContextBlock($);
        if (!context) return;

        output.context = output.context ?? [];
        output.context.push(context);
      } catch {
        // fail silently — don't break compaction
      }
    },
  };
};

// Module-level buffer: holds context between session.created and tui.prompt.append
let pendingContextBlock: string | null = null;
