/**
 * graphiti-memory — pi extension
 *
 * Registers tools and commands for the Graphiti temporal knowledge graph
 * backed by FalkorDB at graphiti.breissinger.dev.
 *
 * Tools (callable by LLM):
 *   graphiti_add     — ingest a fact/preference/context into the graph
 *   graphiti_search  — hybrid BM25 + vector search over stored facts
 *   graphiti_status  — check connection
 *
 * Commands:
 *   /graphiti-status         — show connection + graph info
 *   /graphiti-build-indices  — one-time index setup for a new FalkorDB instance
 *   /graphiti-migrate        — bulk ingest existing Holocron markdown files
 *
 * Placement: ~/.pi/agent/extensions/graphiti-memory/ (symlinked by install.sh)
 * Reload:    /reload
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);

// Resolve the directory this file lives in (works with jiti)
const __dir = fileURLToPath(new URL(".", import.meta.url));
const CLI_SCRIPT = join(__dir, "graphiti_cli.py");

// ── uv binary discovery ───────────────────────────────────────────────────────

const UV_CANDIDATES = [
  "/Users/jbreissinger/.local/bin/uv",
  "/usr/local/bin/uv",
  "/opt/homebrew/bin/uv",
  "/root/.local/bin/uv",
];

function findUv(): string {
  for (const p of UV_CANDIDATES) {
    if (existsSync(p)) return p;
  }
  // Fall back to PATH resolution at call time
  return "uv";
}

// ── CLI runner ────────────────────────────────────────────────────────────────

async function runCli(
  args: string[],
  timeoutMs = 60_000
): Promise<{ stdout: string; stderr: string }> {
  const uv = findUv();
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    FALKORDB_HOST:     process.env.FALKORDB_HOST     ?? "graphiti.breissinger.dev",
    FALKORDB_PORT:     process.env.FALKORDB_PORT     ?? "6379",
    FALKORDB_DATABASE: process.env.FALKORDB_DATABASE ?? "holocron",
  };
  return execFileAsync(uv, ["run", "--script", CLI_SCRIPT, ...args], {
    env,
    timeout: timeoutMs,
    maxBuffer: 10 * 1024 * 1024, // 10 MB — migrate can be verbose
  });
}

function parseResult(stdout: string): Record<string, unknown> {
  try {
    return JSON.parse(stdout.trim());
  } catch {
    return { success: false, raw: stdout.trim() };
  }
}

// ── Extension ─────────────────────────────────────────────────────────────────

export default function graphitiMemory(pi: ExtensionAPI) {
  // ── Tool: graphiti_add ──────────────────────────────────────────────────────
  pi.registerTool({
    name: "graphiti_add",
    label: "Graphiti: Add Memory",
    description:
      "Persist a fact, preference, or piece of context into the Graphiti temporal knowledge graph. " +
      "The graph automatically extracts entities and relationships and handles contradiction resolution over time.",
    promptSnippet: "Persist facts, preferences, or context to the long-term knowledge graph",
    promptGuidelines: [
      "Use graphiti_add when the user says 'remember', 'note that', 'save this', or explicitly wants something stored long-term.",
      "Use graphiti_add after discovering important project architecture, team structure, or user preferences worth persisting.",
      "Use group_id='holocron-user' for personal preferences and Jack-specific facts.",
      "Use group_id='holocron-lahzo' for Lahzo work context, team members, repo details, and project facts.",
      "Use group_id='holocron-projects' for active personal project state.",
      "Use group_id='holocron-system' for Holocron/tooling configuration facts.",
    ],
    parameters: Type.Object({
      text: Type.String({
        description: "The content to ingest. Can be a sentence, paragraph, or structured notes.",
      }),
      group_id: Type.String({
        description:
          "Namespace: holocron-user | holocron-lahzo | holocron-projects | holocron-system | holocron-learning",
      }),
      name: Type.Optional(
        Type.String({ description: "Human-readable episode label (auto-generated if omitted)" })
      ),
      source_description: Type.Optional(
        Type.String({ description: "Provenance context, e.g. 'user conversation', 'code review'" })
      ),
      source: Type.Optional(
        Type.String({ description: "Episode type: text (default) | message | json" })
      ),
    }),

    async execute(_id, params, _signal, onUpdate) {
      onUpdate?.({
        content: [{ type: "text", text: `Adding to Graphiti [${params.group_id}]…` }],
      });

      const args = ["add", "--text", params.text, "--group", params.group_id];
      if (params.name)               args.push("--name",               params.name);
      if (params.source_description) args.push("--source-description", params.source_description);
      if (params.source)             args.push("--source",             params.source);

      const { stdout } = await runCli(args, 120_000);
      const result = parseResult(stdout);

      const summary = result.success
        ? `✅ Ingested to [${params.group_id}] — ${result.chars} chars, episode: ${result.episode_uuid ?? "n/a"}`
        : `❌ Failed: ${result.error}`;

      return {
        content: [{ type: "text", text: summary }],
        details: result,
      };
    },
  });

  // ── Tool: graphiti_search ───────────────────────────────────────────────────
  pi.registerTool({
    name: "graphiti_search",
    label: "Graphiti: Search Memory",
    description:
      "Search the Graphiti temporal knowledge graph for relevant facts and entity summaries. " +
      "Returns currently-valid facts (edges) and entity nodes matching the query via hybrid BM25 + vector search.",
    promptSnippet: "Retrieve stored facts and context from the long-term knowledge graph",
    promptGuidelines: [
      "Use graphiti_search when the user references past context that may not be in the current conversation.",
      "Use graphiti_search before answering questions about Jack's preferences, project history, Lahzo team structure, or long-term decisions.",
      "Prefer specific group_ids to narrow results: holocron-user for preferences, holocron-lahzo for work context.",
    ],
    parameters: Type.Object({
      query: Type.String({ description: "Natural language search query" }),
      group_ids: Type.Optional(
        Type.Array(Type.String(), {
          description:
            "Scope to specific groups: holocron-user, holocron-lahzo, holocron-projects, holocron-system, holocron-learning. Omit to search all.",
        })
      ),
      num_results: Type.Optional(
        Type.Number({ description: "Max results to return (default 10)" })
      ),
    }),

    async execute(_id, params, _signal, onUpdate) {
      onUpdate?.({
        content: [{ type: "text", text: `Searching Graphiti: "${params.query}"…` }],
      });

      const args = ["search", "--query", params.query];
      if (params.group_ids?.length) args.push("--groups", params.group_ids.join(","));
      if (params.num_results)       args.push("--num-results", String(params.num_results));

      const { stdout } = await runCli(args, 30_000);
      const result = parseResult(stdout);

      if (!result.success) {
        return {
          content: [{ type: "text", text: `❌ Search failed: ${result.error}` }],
          details: result,
        };
      }

      const facts  = (result.facts  as Array<{ fact: string; valid_at: string | null; invalid_at: string | null }>) ?? [];
      const nodes  = (result.nodes  as Array<{ name: string; summary: string | null }>) ?? [];
      const total  = result.total as number ?? 0;

      const lines: string[] = [`🔍 ${total} results for: "${params.query}"\n`];

      if (facts.length > 0) {
        lines.push("**Facts:**");
        for (const f of facts) {
          const validity = f.invalid_at ? ` *(until ${f.invalid_at.slice(0, 10)})*` : "";
          lines.push(`• ${f.fact}${validity}`);
        }
      }

      if (nodes.length > 0) {
        lines.push("\n**Entities:**");
        for (const n of nodes) {
          lines.push(`• **${n.name}**: ${n.summary ?? "(no summary)"}`);
        }
      }

      if (total === 0) {
        lines.push("_(no results found)_");
      }

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        details: result,
      };
    },
  });

  // ── Tool: graphiti_status ───────────────────────────────────────────────────
  pi.registerTool({
    name: "graphiti_status",
    label: "Graphiti: Status",
    description: "Check the FalkorDB connection status and list available graphs.",
    parameters: Type.Object({}),

    async execute(_id, _params, _signal, onUpdate) {
      onUpdate?.({ content: [{ type: "text", text: "Checking Graphiti connection…" }] });
      const { stdout } = await runCli(["status"], 15_000);
      const result = parseResult(stdout);
      const text = result.connected
        ? `✅ Connected to ${result.host}:${result.port} — db: ${result.database}, graphs: ${JSON.stringify(result.graphs)}`
        : `❌ Not connected: ${result.error}`;
      return { content: [{ type: "text", text }], details: result };
    },
  });

  // ── Command: /graphiti-status ───────────────────────────────────────────────
  pi.registerCommand("graphiti-status", {
    description: "Check FalkorDB connection and show graph info",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) return;
      ctx.ui.notify("Checking Graphiti…", "info");
      try {
        const { stdout } = await runCli(["status"], 15_000);
        const r = parseResult(stdout);
        const msg = r.connected
          ? `🧠 Graphiti Connected\n  Host: ${r.host}:${r.port}\n  Database: ${r.database}\n  Graphs: ${JSON.stringify(r.graphs)}`
          : `❌ Graphiti unreachable\n  ${r.error}`;
        ctx.ui.notify(msg, r.connected ? "success" : "error");
      } catch (err: unknown) {
        ctx.ui.notify(`❌ Graphiti error: ${err instanceof Error ? err.message : String(err)}`, "error");
      }
    },
  });

  // ── Command: /graphiti-build-indices ───────────────────────────────────────
  pi.registerCommand("graphiti-build-indices", {
    description: "One-time setup: build vector + full-text indices on the FalkorDB instance",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) return;
      ctx.ui.notify("Building Graphiti indices…", "info");
      try {
        const { stdout } = await runCli(["build-indices"], 90_000);
        const r = parseResult(stdout);
        ctx.ui.notify(
          r.success ? `✅ ${r.message}` : `❌ ${r.error}`,
          r.success ? "success" : "error"
        );
      } catch (err: unknown) {
        ctx.ui.notify(`❌ Index build failed: ${err instanceof Error ? err.message : String(err)}`, "error");
      }
    },
  });

  // ── Command: /graphiti-migrate ─────────────────────────────────────────────
  pi.registerCommand("graphiti-migrate", {
    description: "Bulk ingest Holocron memory/*.md files into Graphiti (slow — runs LLM per file)",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) return;
      const dir = process.env.HOLOCRON_MEMORY_DIR;
      if (!dir) {
        ctx.ui.notify("$HOLOCRON_MEMORY_DIR is not set", "error");
        return;
      }

      const memoryPath = join(dir, "memory");
      const ok = await ctx.ui.confirm(
        "Migrate Holocron Memory → Graphiti",
        `Ingest all .md files from:\n  ${memoryPath}\n\nThis triggers 3-6 LLM calls per file and may take several minutes.`
      );
      if (!ok) return;

      ctx.ui.notify("🔄 Migration running — progress in stderr/logs…", "info");
      try {
        const { stdout, stderr } = await runCli(["migrate", "--dir", memoryPath], 600_000);
        const r = parseResult(stdout);
        // Show stderr progress summary (last 10 lines)
        const progressLines = stderr.trim().split("\n").slice(-10).join("\n");
        ctx.ui.notify(
          r.success
            ? `✅ Migration complete\n  Ingested: ${r.ingested}\n  Skipped:  ${r.skipped}\n  Total:    ${r.total}\n\n${progressLines}`
            : `⚠️ Migration finished with errors\n  Ingested: ${r.ingested}  Errors: ${(r.errors as unknown[])?.length}\n\n${progressLines}`,
          r.success ? "success" : "warning"
        );
      } catch (err: unknown) {
        ctx.ui.notify(
          `❌ Migration failed: ${err instanceof Error ? err.message : String(err)}`,
          "error"
        );
      }
    },
  });
}
