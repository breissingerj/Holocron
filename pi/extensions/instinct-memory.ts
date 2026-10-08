/**
 * instinct-memory.ts — pi adapter for the Instinct-style memory backend (specs/002-instinct-memory-backend)
 *
 * Active only when HOLOCRON_MEMORY_BACKEND=instinct. All logic lives in the harness-agnostic core
 * ($HOLOCRON_DIR/tools/instinct/instinct.ts); this file is a thin adapter:
 *   Tier 1  session_start → cache assemble(); before_agent_start → inject (sentinel-guarded)
 *   Tier 2  before_agent_start → per-prompt retrieval appended to the system prompt (no model decision)
 *   Tier 3  instinct_recall / instinct_remember tools (model-initiated fallback)
 *   Capture session_before_compact + session_shutdown → detached `session-end` (Haiku extraction + recap)
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { execFileSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ACTIVE = (process.env.HOLOCRON_MEMORY_BACKEND ?? "").toLowerCase() === "instinct";
const HERE = dirname(fileURLToPath(import.meta.url));
const CORE = join(process.env.HOLOCRON_DIR ?? process.env.HOLOCRON_REPO_ROOT ?? join(HERE, "..", ".."), "tools", "instinct", "instinct.ts");
const SENTINEL = "<!-- instinct-memory -->";

const run = (args: string[]): string => {
  try { return execFileSync("bun", [CORE, ...args], { encoding: "utf-8", timeout: 15000, env: { ...process.env, INSTINCT_INTERNAL: "" } }); }
  catch { return ""; }
};

export default function instinctMemory(pi: ExtensionAPI) {
  if (!ACTIVE) return;
  if (!existsSync(CORE)) return;

  let sessionBlock = "";
  let lastCaptured = 0;

  pi.on("session_start", async (_e, ctx) => {
    sessionBlock = run(["assemble"]).trim();
    if (ctx.hasUI) ctx.ui.notify(sessionBlock ? `🧠 Instinct memory primed (~${Math.ceil(sessionBlock.length / 4)} tok)` : "⚠️ Instinct memory: nothing to inject (run `instinct seed`)", sessionBlock ? "info" : "warning");
  });

  pi.on("before_agent_start", async (event) => {
    if (event.systemPrompt.includes(SENTINEL)) return;
    const retrieved = event.prompt ? run(["assemble", "--prompt-only", "--prompt", event.prompt]).trim() : "";
    const block = [sessionBlock, retrieved.replace(/<!-- instinct-memory -->|<!-- end instinct-memory -->/g, "").trim()].filter(Boolean).join("\n\n");
    if (!block) return;
    return { systemPrompt: event.systemPrompt + "\n\n" + (block.startsWith(SENTINEL) ? block : `${SENTINEL}\n${block}`) };
  });

  const capture = (ctx: any) => {
    const file = ctx?.sessionManager?.getSessionFile?.(); const id = ctx?.sessionManager?.getSessionId?.() ?? "pi";
    if (!file || Date.now() - lastCaptured < 30000) return;
    lastCaptured = Date.now();
    const p = spawn("bun", [CORE, "session-end", "--session", id, "--transcript", file], { detached: true, stdio: "ignore", env: { ...process.env, INSTINCT_INTERNAL: "1" } });
    p.unref();
  };
  pi.on("session_before_compact", async (_e, ctx) => { capture(ctx); });
  pi.on("session_shutdown", async (_e, ctx) => { capture(ctx); });

  pi.registerTool({
    name: "instinct_recall",
    label: "Instinct: Recall",
    description: "Look up stored memory (people, projects, preferences, decisions, topics) by keyword/alias. Typo tolerant. Use when relevant memory was not auto-injected.",
    promptSnippet: "Search the Instinct memory store by keyword",
    promptGuidelines: ["Memory relevant to each prompt is auto-injected; call instinct_recall only for deeper lookups."],
    parameters: Type.Object({ query: Type.String({ description: "Keywords, names, or aliases" }) }),
    async execute(_id, params) {
      const out = run(["recall", params.query]).trim() || "(no matches)";
      return { content: [{ type: "text", text: out }], details: {} };
    },
  });

  pi.registerTool({
    name: "instinct_remember",
    label: "Instinct: Remember",
    description: "Queue a durable fact for memory. It goes to the inbox and is merged into the store by the consolidator (you never edit the store directly). Use when the user says remember / note that / keep in mind.",
    promptSnippet: "Queue a durable fact into the Instinct inbox",
    promptGuidelines: ["Use for explicit remember requests. For 'forget X', run `bun $HOLOCRON_DIR/tools/instinct/instinct.ts forget \"X\"`."],
    parameters: Type.Object({
      fact: Type.String({ description: "A self-contained sentence" }),
      entity: Type.Optional(Type.String({ description: "Person/org/project the fact is about" })),
      type: Type.Optional(Type.String({ description: "person|org|project|preference|decision|topic" })),
      expires: Type.Optional(Type.String({ description: "YYYY-MM-DD if time-bound" })),
    }),
    async execute(_id, params) {
      const a = ["capture", "--fact", params.fact];
      if (params.entity) a.push("--entity", params.entity); if (params.type) a.push("--type", params.type); if (params.expires) a.push("--expires", params.expires);
      return { content: [{ type: "text", text: run(a).trim() || "failed to queue" }], details: {} };
    },
  });

  pi.registerCommand("instinct-status", {
    description: "Show Instinct memory layer sizes and store stats",
    handler: async (_a, ctx) => { if (ctx.hasUI) ctx.ui.notify(run(["status"]).trim() || "instinct: no output", "info"); },
  });
}
