import type { Plugin } from "@opencode-ai/plugin";
import { readFile, writeFile, mkdir } from "fs/promises";
import { join } from "path";

/**
 * holocron-prd — Milestone 7: Memory & Work Tracking
 *
 * Scaffolds new PRD files and syncs frontmatter to work.json
 *
 * Hook strategy:
 *   experimental.chat.system.transform -> Injects startup PRD creation task
 *   tool.execute.after -> Listens to "edit" or "write" tool calls on PRD.md to sync frontmatter
 */

const PLUGIN_TAG = "[holocron-prd]";

export async function ensureDir(dir: string): Promise<void> {
  try {
    await mkdir(dir, { recursive: true });
  } catch (error: any) {
    if (error.code !== "EEXIST") throw error;
  }
}

export async function readFileSafe(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf-8");
  } catch {
    return null;
  }
}

/** Parse YAML frontmatter block (between --- delimiters) into a key/value map. */
export function parseFrontmatter(content: string): Record<string, string> | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  const state: Record<string, string> = {};
  match[1].split("\n").forEach((line) => {
    const colonIndex = line.indexOf(":");
    if (colonIndex > 0) {
      const key = line.substring(0, colonIndex).trim();
      const value = line.substring(colonIndex + 1).trim();
      state[key] = value;
    }
  });
  return state;
}

/** Generate a slug in the form YYYYMMDD-HHMMSS_new-task from a Date. */
export function generateSlug(now: Date): string {
  const datePart = now.toISOString().replace(/[:-]/g, "").split("T")[0];
  const timePart = now.toISOString().split("T")[1].replace(/[:-]/g, "").substring(0, 6);
  return `${datePart}-${timePart}_new-task`;
}

/** Build the PRD stub markdown string for a given slug and timestamp. */
export function buildPrdStub(slug: string, now: Date): string {
  const iso = now.toISOString();
  return `---
task: New Task
slug: ${slug}
effort: standard
phase: observe
progress: 0/0
mode: interactive
started: ${iso}
updated: ${iso}
---

## Context
<!-- Describe what this task is, why it matters, what was requested and not requested. -->

## Criteria
<!-- - [ ] ISC-1: criterion text -->

## Decisions
<!-- Record non-obvious technical decisions made during the BUILD phase here. -->

## Verification
<!-- Add evidence for each completed criterion (screenshots, tests passed, command output). -->
`;
}

/** Sync parsed frontmatter state into STATE/work.json, preserving existing entries. */
export async function syncToWorkJson(
  memoryDir: string,
  state: Record<string, string>
): Promise<void> {
  const stateDir = join(memoryDir, "STATE");
  await ensureDir(stateDir);

  const workJsonPath = join(stateDir, "work.json");
  let workData: Record<string, any> = {};

  const existingWork = await readFileSafe(workJsonPath);
  if (existingWork) {
    try {
      workData = JSON.parse(existingWork);
    } catch {
      // start fresh if corrupt
    }
  }

  workData[state.slug] = state;
  await writeFile(workJsonPath, JSON.stringify(workData, null, 2), "utf-8");
}

export const HolocronPrd: Plugin = async ({ $, client }) => {
  return {
    "experimental.chat.system.transform": async (input, output) => {
      const memoryDir = process.env.HOLOCRON_MEMORY_DIR;
      if (!memoryDir) {
        await client.app.log({
          body: {
            service: PLUGIN_TAG,
            level: "warn",
            message: "HOLOCRON_MEMORY_DIR not set, skipping PRD creation hint.",
          },
        });
        return;
      }

      const now = new Date();
      const slug = generateSlug(now);
      const workDir = join(memoryDir, "WORK", slug);

      try {
        await ensureDir(workDir);
      } catch (e) {
        // ignore errors making the directory
      }

      const prdPath = join(workDir, "PRD.md");
      const stubContent = buildPrdStub(slug, now);
      const prompt = `\n\n[HOLOCRON_PRD_STARTUP]: If there is no active PRD for this session, you must create one immediately at ${prdPath} using the following template:\n\`\`\`markdown\n${stubContent}\n\`\`\`\n`;
      output.system.push(prompt);
    },

    "tool.execute.after": async (input, output) => {
      if (input.tool !== "edit" && input.tool !== "write") return;

      const args = input.args;
      const filePath = args.filePath || args.path || args.file_path;

      if (!filePath || typeof filePath !== "string" || !filePath.endsWith("PRD.md")) return;

      const memoryDir = process.env.HOLOCRON_MEMORY_DIR;
      if (!memoryDir) return;

      if (!filePath.startsWith(join(memoryDir, "WORK"))) return;

      try {
        const content = await readFileSafe(filePath);
        if (!content) return;

        const state = parseFrontmatter(content);
        if (!state || !state.slug) return;

        await syncToWorkJson(memoryDir, state);

        await client.app.log({
          body: {
            service: PLUGIN_TAG,
            level: "info",
            message: `Synced PRD frontmatter to work.json for ${state.slug}`,
          },
        });
      } catch (err) {
        await client.app.log({
          body: {
            service: PLUGIN_TAG,
            level: "error",
            message: `Failed to sync PRD: ${err}`,
          },
        });
      }
    },
  };
};
