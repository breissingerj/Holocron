"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HolocronPrd = void 0;
const promises_1 = require("fs/promises");
const path_1 = require("path");
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
async function ensureDir(dir) {
    try {
        await (0, promises_1.mkdir)(dir, { recursive: true });
    }
    catch (error) {
        if (error.code !== "EEXIST")
            throw error;
    }
}
async function readFileSafe(filePath) {
    try {
        return await (0, promises_1.readFile)(filePath, "utf-8");
    }
    catch {
        return null;
    }
}
const HolocronPrd = async ({ $, client }) => {
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
            // Generate slug: YYYYMMDD-HHMMSS_kebab-task
            const now = new Date();
            const datePart = now.toISOString().replace(/[:-]/g, "").split("T")[0];
            const timePart = now.toISOString().split("T")[1].replace(/[:-]/g, "").substring(0, 6);
            const slug = `${datePart}-${timePart}_new-task`;
            const workDir = (0, path_1.join)(memoryDir, "WORK", slug);
            try {
                await ensureDir(workDir);
            }
            catch (e) {
                // ignore errors making the directory
            }
            const prdPath = (0, path_1.join)(workDir, "PRD.md");
            const stubContent = `---
task: New Task
slug: ${slug}
effort: standard
phase: observe
progress: 0/0
mode: interactive
started: ${now.toISOString()}
updated: ${now.toISOString()}
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
            const prompt = `\n\n[HOLOCRON_PRD_STARTUP]: If there is no active PRD for this session, you must create one immediately at ${prdPath} using the following template:\n\`\`\`markdown\n${stubContent}\n\`\`\`\n`;
            output.system.push(prompt);
        },
        "tool.execute.after": async (input, output) => {
            if (input.tool !== "edit" && input.tool !== "write")
                return;
            const args = input.args;
            const filePath = args.filePath || args.path || args.file_path; // depending on tool definition
            if (!filePath || typeof filePath !== "string" || !filePath.endsWith("PRD.md"))
                return;
            const memoryDir = process.env.HOLOCRON_MEMORY_DIR;
            if (!memoryDir)
                return;
            // Only sync PRDs within the WORK directory
            if (!filePath.startsWith((0, path_1.join)(memoryDir, "WORK")))
                return;
            try {
                const content = await readFileSafe(filePath);
                if (!content)
                    return;
                // Parse frontmatter
                const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
                if (!frontmatterMatch)
                    return;
                const frontmatterText = frontmatterMatch[1];
                const state = {};
                frontmatterText.split("\n").forEach((line) => {
                    const colonIndex = line.indexOf(":");
                    if (colonIndex > 0) {
                        const key = line.substring(0, colonIndex).trim();
                        const value = line.substring(colonIndex + 1).trim();
                        state[key] = value;
                    }
                });
                if (!state.slug)
                    return;
                const stateDir = (0, path_1.join)(memoryDir, "STATE");
                await ensureDir(stateDir);
                const workJsonPath = (0, path_1.join)(stateDir, "work.json");
                let workData = {};
                const existingWork = await readFileSafe(workJsonPath);
                if (existingWork) {
                    try {
                        workData = JSON.parse(existingWork);
                    }
                    catch {
                        // start fresh if corrupt
                    }
                }
                workData[state.slug] = state;
                await (0, promises_1.writeFile)(workJsonPath, JSON.stringify(workData, null, 2), "utf-8");
                await client.app.log({
                    body: {
                        service: PLUGIN_TAG,
                        level: "info",
                        message: `Synced PRD frontmatter to work.json for ${state.slug}`,
                    },
                });
            }
            catch (err) {
                await client.app.log({
                    body: {
                        service: PLUGIN_TAG,
                        level: "error",
                        message: `Failed to sync PRD: ${err}`,
                    },
                });
            }
        }
    };
};
exports.HolocronPrd = HolocronPrd;
