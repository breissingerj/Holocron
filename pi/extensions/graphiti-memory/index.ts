/**
 * graphiti-memory — pi extension
 *
 * Registers tools and commands for the Graphiti temporal knowledge graph
 * backed by FalkorDB at graphiti.breissinger.dev.
 *
 * Graph layout (one FalkorDB graph per domain):
 *   holocron_user    — personal preferences, Jack-specific facts, career
 *   holocron_lahzo   — Lahzo work context, team, repos, architecture
 *   holocron_system  — Holocron tooling, config, voice, backup
 *
 * Tools (callable by LLM):
 *   graphiti_add     — ingest a fact/preference/context into a specific graph
 *   graphiti_search  — fan-out hybrid search across all graphs (or a subset)
 *   graphiti_status  — check connection and list graphs
 *
 * Commands:
 *   /graphiti-status         — show connection + graph info
 *   /graphiti-build-indices  — build/rebuild indices on all graphs
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

const __dir = fileURLToPath(new URL(".", import.meta.url));
const CLI_SCRIPT = join(__dir, "graphiti_cli.py");

const ALL_DATABASES = ["holocron_user", "holocron_lahzo", "holocron_system"] as const;

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
    FALKORDB_HOST: process.env.FALKORDB_HOST ?? "graphiti.breissinger.dev",
    FALKORDB_PORT: process.env.FALKORDB_PORT ?? "6379",
  };
  return execFileAsync(uv, ["run", "--script", CLI_SCRIPT, ...args], {
    env,
    timeout: timeoutMs,
    maxBuffer: 10 * 1024 * 1024,
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
      "The graph automatically extracts entities and relationships and handles contradiction resolution over time. " +
      "The group_id determines which graph the data lands in — choose the most specific match.",
    promptSnippet: "Persist facts, preferences, or context to the long-term knowledge graph",
    promptGuidelines: [
      "Use graphiti_add when the user says 'remember', 'note that', 'save this', or explicitly wants something stored long-term.",
      "Use graphiti_add after discovering important project architecture, team structure, or user preferences worth persisting.",
      "group_id='holocron_user': Jack's personal preferences, workflow rules, editor choices, career facts.",
      "group_id='holocron_lahzo': Lahzo work context — team members, repo structure, architecture, clients, tickets.",
      "group_id='holocron_system': Holocron/tooling config — voice settings, algorithm version, extension state.",
      "When in doubt about the group, default to holocron_user for personal facts or holocron_lahzo for work facts.",
    ],
    parameters: Type.Object({
      text: Type.String({
        description: "The content to ingest. Can be a sentence, paragraph, or structured notes.",
      }),
      group_id: Type.String({
        description:
          "Target graph. Must be one of: holocron_user (personal/preferences), " +
          "holocron_lahzo (Lahzo work context), holocron_system (tooling/config).",
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
        ? `✅ Ingested to [${result.database ?? params.group_id}] — ${result.chars} chars, episode: ${result.episode_uuid ?? "n/a"}`
        : `❌ Failed: ${result.error}`;

      return { content: [{ type: "text", text: summary }], details: result };
    },
  });

  // ── Tool: graphiti_search ───────────────────────────────────────────────────
  pi.registerTool({
    name: "graphiti_search",
    label: "Graphiti: Search Memory",
    description:
      "Search the Graphiti temporal knowledge graph for relevant facts and context. " +
      "By default searches ALL graphs in parallel (holocron_user, holocron_lahzo, holocron_system) " +
      "and returns merged results tagged with their source graph. " +
      "Optionally scope to specific graphs when the relevant domain is already known — " +
      "this is faster and reduces noise. Prefer open search when the domain is unclear.",
    promptSnippet: "Retrieve stored facts and context from the long-term knowledge graph",
    promptGuidelines: [
      "Use graphiti_search when the user references past context, preferences, or facts that may not be in the current conversation.",
      "Default: omit databases to search ALL graphs — prefer this when the domain is unclear.",
      "Scope databases=['holocron_user'] for questions about Jack's personal preferences, workflow rules, or career.",
      "Scope databases=['holocron_lahzo'] for questions about Lahzo team, repos, architecture, clients, or specific tickets.",
      "Scope databases=['holocron_system'] for questions about Holocron config, voice settings, or tooling state.",
      "Each result includes a 'database' field showing which graph it came from.",
      "Facts include 'valid_at' and 'invalid_at' timestamps — null invalid_at means the fact is currently true.",
    ],
    parameters: Type.Object({
      query: Type.String({ description: "Natural language search query" }),
      databases: Type.Optional(
        Type.Array(Type.String(), {
          description:
            "Graphs to search. Omit to search ALL (recommended when domain is unclear). " +
            "Options: holocron_user, holocron_lahzo, holocron_system.",
        })
      ),
      num_results: Type.Optional(
        Type.Number({
          description:
            "Results per graph (default 10). When searching all graphs, total results may be up to 30.",
        })
      ),
    }),

    async execute(_id, params, _signal, onUpdate) {
      const scope = params.databases?.length
        ? params.databases.join(", ")
        : "all graphs";
      onUpdate?.({
        content: [{ type: "text", text: `Searching Graphiti [${scope}]: "${params.query}"…` }],
      });

      const args = ["search", "--query", params.query];
      if (params.databases?.length) args.push("--databases", params.databases.join(","));
      if (params.num_results)       args.push("--num-results", String(params.num_results));

      const { stdout } = await runCli(args, 60_000);
      const result = parseResult(stdout);

      if (!result.success && !(result.facts as unknown[])?.length) {
        return {
          content: [{ type: "text", text: `❌ Search failed: ${result.error}` }],
          details: result,
        };
      }

      const facts = (result.facts as Array<{
        fact: string;
        database: string;
        valid_at: string | null;
        invalid_at: string | null;
      }>) ?? [];
      const total = result.total as number ?? 0;
      const dbsSearched = (result.databases_searched as string[]) ?? [];
      const errors = (result.errors as Array<{ database: string; error: string }>) ?? [];

      const lines: string[] = [
        `🔍 ${total} result${total !== 1 ? "s" : ""} across [${dbsSearched.join(", ")}] for: "${params.query}"\n`,
      ];

      if (facts.length > 0) {
        // Group by database for readability
        const byDb = new Map<string, typeof facts>();
        for (const f of facts) {
          if (!byDb.has(f.database)) byDb.set(f.database, []);
          byDb.get(f.database)!.push(f);
        }
        for (const [db, dbFacts] of byDb) {
          lines.push(`**${db}:**`);
          for (const f of dbFacts) {
            const expired = f.invalid_at ? ` *(expired ${f.invalid_at.slice(0, 10)})*` : "";
            lines.push(`• ${f.fact}${expired}`);
          }
          lines.push("");
        }
      } else {
        lines.push("_(no results found)_");
      }

      if (errors.length > 0) {
        lines.push(`⚠️ Errors: ${errors.map(e => `${e.database}: ${e.error}`).join("; ")}`);
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
        ? `✅ Connected to ${result.host}:${result.port}\n  Graphs: ${JSON.stringify(result.graphs)}`
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
          ? `🧠 Graphiti Connected\n  Host: ${r.host}:${r.port}\n  Graphs: ${JSON.stringify(r.graphs)}\n  Searchable: ${ALL_DATABASES.join(", ")}`
          : `❌ Graphiti unreachable\n  ${r.error}`;
        ctx.ui.notify(msg, r.connected ? "success" : "error");
      } catch (err: unknown) {
        ctx.ui.notify(`❌ Graphiti error: ${err instanceof Error ? err.message : String(err)}`, "error");
      }
    },
  });

  // ── Command: /graphiti-build-indices ───────────────────────────────────────
  pi.registerCommand("graphiti-build-indices", {
    description: "Build/rebuild vector + full-text indices on all Graphiti graphs",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) return;
      ctx.ui.notify(`Building Graphiti indices on: ${ALL_DATABASES.join(", ")}…`, "info");
      try {
        const { stdout } = await runCli(["build-indices"], 120_000);
        const r = parseResult(stdout);
        const detail = Object.entries(r.databases as Record<string, string>)
          .map(([db, status]) => `  ${status === "ok" ? "✓" : "✗"} ${db}: ${status}`)
          .join("\n");
        ctx.ui.notify(
          `${r.success ? "✅" : "⚠️"} Index build complete\n${detail}`,
          r.success ? "success" : "warning"
        );
      } catch (err: unknown) {
        ctx.ui.notify(`❌ Index build failed: ${err instanceof Error ? err.message : String(err)}`, "error");
      }
    },
  });

  // ── Command: /graphiti-migrate ─────────────────────────────────────────────
  pi.registerCommand("graphiti-migrate", {
    description: "Bulk ingest Holocron memory/*.md files into Graphiti (slow — LLM per file)",
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
        const { stdout, stderr } = await runCli(
          ["migrate", "--dir", memoryPath],
          600_000
        );
        const r = parseResult(stdout);
        const progressLines = stderr.trim().split("\n").slice(-10).join("\n");
        ctx.ui.notify(
          r.success
            ? `✅ Migration complete\n  Ingested: ${r.ingested}\n  Skipped:  ${r.skipped}\n\n${progressLines}`
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
