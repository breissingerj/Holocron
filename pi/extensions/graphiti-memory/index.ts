/**
 * graphiti-memory — pi extension
 *
 * Registers tools and commands for the Graphiti temporal knowledge graph
 * backed by FalkorDB at graphiti.breissinger.dev.
 *
 * Default graph: all data lives under group_id "jbreissinger".
 * Any tool that accepts an optional `group` parameter can target a different
 * FalkorDB graph (e.g. "rivian_demo"). The graph is created automatically on
 * first write; call graphiti_build_indices after creating a new graph.
 *
 * Tools (callable by LLM):
 *   graphiti_add              — ingest a fact, preference, or context into the graph
 *   graphiti_search           — hybrid search for facts (edges) in the graph
 *   graphiti_search_nodes     — search for entity node summaries
 *   graphiti_get_episodes     — list recent episodes
 *   graphiti_delete_episode   — delete an episode by UUID
 *   graphiti_get_entity_edge  — retrieve a specific fact/edge by UUID
 *   graphiti_delete_entity_edge — delete a specific fact/edge by UUID
 *   graphiti_build_indices     — build/rebuild indices for a graph (required for new graphs)
 *   graphiti_status           — check connection and graph info
 *
 * Commands:
 *   /graphiti-status         — show connection info
 *   /graphiti-build-indices  — build/rebuild indices
 *   /graphiti-migrate        — bulk ingest Holocron markdown files
 *   /graphiti-clear          — ⚠️  wipe the graph and rebuild indices (destructive)
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

const DEFAULT_GROUP = "jbreissinger";

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
    FALKORDB_HOST:      process.env.FALKORDB_HOST      ?? "graphiti.breissinger.dev",
    FALKORDB_PORT:      process.env.FALKORDB_PORT      ?? "6379",
    GRAPHITI_GROUP_ID:  process.env.GRAPHITI_GROUP_ID  ?? DEFAULT_GROUP,
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

  // ── Tool: graphiti_build_indices ────────────────────────────────────────────
  pi.registerTool({
    name: "graphiti_build_indices",
    label: "Graphiti: Build Indices",
    description:
      "Build or rebuild vector and full-text indices for a Graphiti graph group. " +
      "Required after creating a new graph group for the first time (e.g. a demo or project-specific graph). " +
      "Safe to re-run on existing groups — the operation is idempotent.",
    promptSnippet: "Build indices for a Graphiti graph (required for new graphs)",
    promptGuidelines: [
      "Call graphiti_build_indices with the group name immediately after the first graphiti_add to a new group.",
      "If search returns errors on a freshly created group, re-run build_indices.",
      "Omit group to rebuild indices on the default jbreissinger graph.",
    ],
    parameters: Type.Object({
      group: Type.Optional(
        Type.String({ description: "Graph group/namespace to build indices for (default: jbreissinger)" })
      ),
    }),

    async execute(_id, params, _signal, onUpdate) {
      const target = params.group ?? DEFAULT_GROUP;
      onUpdate?.({
        content: [{ type: "text", text: `Building indices for graph "${target}"…` }],
      });

      const args = ["build-indices"];
      if (params.group) args.push("--group", params.group);

      const { stdout } = await runCli(args, 60_000);
      const result = parseResult(stdout);

      return {
        content: [{ type: "text", text: result.success
          ? `✅ Indices built for group: "${result.group ?? target}"`
          : `❌ Failed: ${result.error}` }],
        details: result,
      };
    },
  });

  // ── Tool: graphiti_add ──────────────────────────────────────────────────────
  pi.registerTool({
    name: "graphiti_add",
    label: "Graphiti: Add Memory",
    description:
      "Persist a fact, preference, or piece of context into the Graphiti temporal knowledge graph. " +
      "The graph automatically extracts entities and relationships using structured entity types " +
      "(Preference, Requirement, Procedure, Location, Event, Organization, Document, etc.) " +
      "and handles contradiction resolution over time. Everything lives in a single unified graph — " +
      "cross-domain relationships (e.g. between work context and personal preferences) form naturally.",
    promptSnippet: "Persist facts, preferences, or context to the long-term knowledge graph",
    promptGuidelines: [
      "Use graphiti_add when the user says 'remember', 'note that', 'save this', or explicitly wants something stored long-term.",
      "Use graphiti_add after discovering important project architecture, team structure, or user preferences worth persisting.",
      "Omit group to write to the default jbreissinger graph. Pass group='rivian_demo' (or any name) to write to an isolated graph.",
      "After writing to a new group for the first time, call graphiti_build_indices with that group name.",
      "Use source_description to record provenance: 'user conversation', 'standup notes', 'code review', etc.",
      "Use source='json' for structured data, source='message' for conversation turns, source='text' (default) for prose.",
    ],
    parameters: Type.Object({
      text: Type.String({
        description: "The content to ingest. Can be a sentence, paragraph, or structured notes.",
      }),
      name: Type.Optional(
        Type.String({ description: "Human-readable episode label (auto-generated if omitted)" })
      ),
      source_description: Type.Optional(
        Type.String({ description: "Provenance context, e.g. 'standup notes 2026-05-14', 'user conversation'" })
      ),
      source: Type.Optional(
        Type.String({ description: "Episode type: text (default) | message | json" })
      ),
      group: Type.Optional(
        Type.String({ description: "Graph group/namespace to write to (default: jbreissinger). Use a custom group like 'rivian_demo' to isolate data in a separate graph. Call graphiti_build_indices for the group after the first write." })
      ),
    }),

    async execute(_id, params, _signal, onUpdate) {
      onUpdate?.({
        content: [{ type: "text", text: `Adding to Graphiti…` }],
      });

      const args = ["add", "--text", params.text];
      if (params.name)               args.push("--name",               params.name);
      if (params.source_description) args.push("--source-description", params.source_description);
      if (params.source)             args.push("--source",             params.source);
      if (params.group)              args.push("--group",              params.group);

      const { stdout } = await runCli(args, 120_000);
      const result = parseResult(stdout);

      const targetGroup = params.group ?? DEFAULT_GROUP;
      const summary = result.success
        ? `✅ Ingested — ${result.chars} chars, group: "${result.group_id ?? targetGroup}", episode: ${result.episode_uuid ?? "n/a"}`
        : `❌ Failed: ${result.error}`;

      return { content: [{ type: "text", text: summary }], details: result };
    },
  });

  // ── Tool: graphiti_search ───────────────────────────────────────────────────
  pi.registerTool({
    name: "graphiti_search",
    label: "Graphiti: Search Facts",
    description:
      "Search the Graphiti temporal knowledge graph for relevant facts (edges between entities). " +
      "Returns facts with temporal metadata (valid_at / invalid_at). " +
      "Use graphiti_search_nodes when you want entity summaries rather than specific facts.",
    promptSnippet: "Retrieve stored facts and context from the long-term knowledge graph",
    promptGuidelines: [
      "Use graphiti_search when the user references past context, preferences, or facts that may not be in the current conversation.",
      "Use specific, targeted queries — 'Jack editor preference' not 'preferences'.",
      "Facts include 'valid_at' and 'invalid_at' timestamps — null invalid_at means the fact is currently true.",
      "Use graphiti_search_nodes when you want to understand what an entity IS (its summary), not what happened with it.",
    ],
    parameters: Type.Object({
      query: Type.String({ description: "Natural language search query" }),
      num_results: Type.Optional(
        Type.Number({ description: "Max results to return (default 10)" })
      ),
      group: Type.Optional(
        Type.String({ description: "Graph group/namespace to search (default: jbreissinger)" })
      ),
    }),

    async execute(_id, params, _signal, onUpdate) {
      onUpdate?.({
        content: [{ type: "text", text: `Searching Graphiti: "${params.query}"…` }],
      });

      const args = ["search", "--query", params.query];
      if (params.num_results) args.push("--num-results", String(params.num_results));
      if (params.group)       args.push("--group",       params.group);

      const { stdout } = await runCli(args, 60_000);
      const result = parseResult(stdout);

      if (!result.success && !(result.facts as unknown[])?.length) {
        return {
          content: [{ type: "text", text: `❌ Search failed: ${result.error}` }],
          details: result,
        };
      }

      const facts = (result.facts as Array<{
        fact: string; valid_at: string | null; invalid_at: string | null; uuid: string;
      }>) ?? [];
      const total = (result.total as number) ?? 0;

      const lines: string[] = [
        `🔍 ${total} fact${total !== 1 ? "s" : ""} for: "${params.query}"\n`,
      ];

      if (facts.length > 0) {
        for (const f of facts) {
          const expired = f.invalid_at ? ` *(expired ${f.invalid_at.slice(0, 10)})*` : "";
          lines.push(`• ${f.fact}${expired}`);
        }
      } else {
        lines.push("_(no results found)_");
      }

      return { content: [{ type: "text", text: lines.join("\n") }], details: result };
    },
  });

  // ── Tool: graphiti_search_nodes ─────────────────────────────────────────────
  pi.registerTool({
    name: "graphiti_search_nodes",
    label: "Graphiti: Search Entity Nodes",
    description:
      "Search the Graphiti knowledge graph for entity node summaries — the extracted entities themselves " +
      "(people, organizations, tools, concepts, preferences, locations, etc.) rather than the facts between them. " +
      "Use this when you want to understand what an entity IS, not what happened with it.",
    promptSnippet: "Find entity summaries (people, tools, concepts) in the knowledge graph",
    promptGuidelines: [
      "Use graphiti_search_nodes when the question is 'what do you know about X?' rather than 'what did X do?'.",
      "Node summaries aggregate all known facts about an entity into a coherent description.",
      "Use graphiti_search for specific facts/events; use graphiti_search_nodes for entity descriptions.",
      "Results include entity_type (Preference, Organization, Person, etc.) to help assess relevance.",
    ],
    parameters: Type.Object({
      query: Type.String({ description: "Natural language query describing the entities you're looking for" }),
      num_results: Type.Optional(
        Type.Number({ description: "Max results to return (default 10)" })
      ),
      group: Type.Optional(
        Type.String({ description: "Graph group/namespace to search (default: jbreissinger)" })
      ),
    }),

    async execute(_id, params, _signal, onUpdate) {
      onUpdate?.({
        content: [{ type: "text", text: `Searching Graphiti nodes: "${params.query}"…` }],
      });

      const args = ["search-nodes", "--query", params.query];
      if (params.num_results) args.push("--num-results", String(params.num_results));
      if (params.group)       args.push("--group",       params.group);

      const { stdout } = await runCli(args, 60_000);
      const result = parseResult(stdout);

      const nodes = (result.nodes as Array<{
        name: string; summary: string | null; entity_type: string | null; uuid: string | null;
      }>) ?? [];
      const total = (result.total as number) ?? 0;

      const lines: string[] = [
        `🧩 ${total} node${total !== 1 ? "s" : ""} for: "${params.query}"\n`,
      ];

      if (nodes.length > 0) {
        for (const n of nodes) {
          const typeTag = n.entity_type ? ` [${n.entity_type}]` : "";
          lines.push(`• **${n.name}**${typeTag}: ${n.summary ?? "_(no summary)_"}`);
        }
      } else {
        lines.push("_(no entity nodes found)_");
      }

      return { content: [{ type: "text", text: lines.join("\n") }], details: result };
    },
  });

  // ── Tool: graphiti_get_episodes ─────────────────────────────────────────────
  pi.registerTool({
    name: "graphiti_get_episodes",
    label: "Graphiti: Get Episodes",
    description:
      "List the most recent episodes ingested into the Graphiti graph. " +
      "Useful for reviewing what has been stored, debugging ingestion, or finding episode UUIDs for deletion.",
    promptSnippet: "List recent episodes in the Graphiti graph",
    promptGuidelines: [
      "Use graphiti_get_episodes when the user asks 'what have you stored?' or 'show me the graph'.",
      "Episode content is truncated to 200 chars — use graphiti_get_entity_edge for full fact details.",
      "Use the returned UUIDs with graphiti_delete_episode to remove incorrect or outdated episodes.",
    ],
    parameters: Type.Object({
      limit: Type.Optional(
        Type.Number({ description: "Max episodes to return (default 10)" })
      ),
      full: Type.Optional(
        Type.Boolean({ description: "Return full episode content instead of truncating at 200 chars (default false)" })
      ),
      group: Type.Optional(
        Type.String({ description: "Graph group/namespace to list episodes from (default: jbreissinger)" })
      ),
    }),

    async execute(_id, params, _signal, onUpdate) {
      onUpdate?.({
        content: [{ type: "text", text: `Fetching recent episodes…` }],
      });

      const args = ["get-episodes"];
      if (params.limit) args.push("--limit", String(params.limit));
      if (params.full)  args.push("--full");
      if (params.group) args.push("--group", params.group);

      const { stdout } = await runCli(args, 30_000);
      const result = parseResult(stdout);

      if (!result.success) {
        return { content: [{ type: "text", text: `❌ Failed: ${result.error}` }], details: result };
      }

      const episodes = (result.episodes as Array<{
        uuid: string; name: string | null; source: string; created_at: string | null; content: string;
      }>) ?? [];
      const total = (result.total as number) ?? 0;

      const lines: string[] = [`📚 ${total} episode${total !== 1 ? "s" : ""}\n`];
      for (const ep of episodes) {
        const ts = ep.created_at ? ep.created_at.slice(0, 10) : "unknown";
        lines.push(`• **${ep.name ?? ep.uuid}** (${ep.source}, ${ts})`);
        if (ep.content) lines.push(`  _${ep.content}_`);
        lines.push(`  UUID: \`${ep.uuid}\``);
        lines.push("");
      }

      return { content: [{ type: "text", text: lines.join("\n") }], details: result };
    },
  });

  // ── Tool: graphiti_delete_episode ───────────────────────────────────────────
  pi.registerTool({
    name: "graphiti_delete_episode",
    label: "Graphiti: Delete Episode",
    description:
      "Delete an episode from the Graphiti graph by UUID. " +
      "Removing an episode also removes entity edges and nodes exclusively derived from it. " +
      "Use graphiti_get_episodes to find episode UUIDs before deleting.",
    promptSnippet: "Delete a stored episode from the knowledge graph",
    promptGuidelines: [
      "Use graphiti_delete_episode to correct mistakes — wrong info, outdated content.",
      "Always confirm the UUID with graphiti_get_episodes first.",
      "Deletion cascades: entities extracted only from this episode will also be removed.",
      "If a retrieved fact contradicts what the user said, flag the conflict, ask for clarification, and offer to update Graphiti with the correct information using graphiti_add (temporal resolution) or graphiti_delete_entity_edge (surgical removal).",
    ],
    parameters: Type.Object({
      uuid: Type.String({ description: "Episode UUID to delete" }),
      group: Type.Optional(
        Type.String({ description: "Graph group/namespace the episode belongs to (default: jbreissinger)" })
      ),
    }),

    async execute(_id, params, _signal, onUpdate) {
      onUpdate?.({
        content: [{ type: "text", text: `Deleting episode ${params.uuid}…` }],
      });

      const args = ["delete-episode", "--uuid", params.uuid];
      if (params.group) args.push("--group", params.group);
      const { stdout } = await runCli(args, 30_000);
      const result = parseResult(stdout);

      return {
        content: [{ type: "text", text: result.success
          ? `✅ Deleted episode \`${params.uuid}\``
          : `❌ Failed: ${result.error}` }],
        details: result,
      };
    },
  });

  // ── Tool: graphiti_get_entity_edge ──────────────────────────────────────────
  pi.registerTool({
    name: "graphiti_get_entity_edge",
    label: "Graphiti: Get Entity Edge",
    description:
      "Retrieve a specific entity edge (fact) from the graph by UUID. " +
      "Returns full details including fact text, temporal bounds, source/target nodes, and originating episodes.",
    promptSnippet: "Look up a specific fact/edge in the knowledge graph by UUID",
    promptGuidelines: [
      "Use graphiti_get_entity_edge to inspect a fact before deciding to delete it.",
      "valid_at/invalid_at show the fact's temporal scope — null invalid_at means currently true.",
    ],
    parameters: Type.Object({
      uuid: Type.String({ description: "Edge UUID to retrieve" }),
      group: Type.Optional(
        Type.String({ description: "Graph group/namespace the edge belongs to (default: jbreissinger)" })
      ),
    }),

    async execute(_id, params, _signal, onUpdate) {
      onUpdate?.({
        content: [{ type: "text", text: `Fetching edge ${params.uuid}…` }],
      });

      const args = ["get-entity-edge", "--uuid", params.uuid];
      if (params.group) args.push("--group", params.group);
      const { stdout } = await runCli(args, 30_000);
      const result = parseResult(stdout);

      if (!result.success) {
        return { content: [{ type: "text", text: `❌ Failed: ${result.error}` }], details: result };
      }

      const expired = result.invalid_at ? ` *(expired ${String(result.invalid_at).slice(0, 10)})*` : "";
      const text = [
        `📎 Edge \`${result.uuid}\``,
        `**Fact:** ${result.fact}${expired}`,
        `**Valid from:** ${result.valid_at ?? "unknown"}`,
        `**Episodes:** ${JSON.stringify(result.episodes)}`,
      ].join("\n");

      return { content: [{ type: "text", text }], details: result };
    },
  });

  // ── Tool: graphiti_delete_entity_edge ───────────────────────────────────────
  pi.registerTool({
    name: "graphiti_delete_entity_edge",
    label: "Graphiti: Delete Entity Edge",
    description:
      "Delete a specific entity edge (fact) from the graph by UUID. " +
      "Use for surgical correction of individual incorrect facts without removing whole episodes.",
    promptSnippet: "Delete a specific fact/edge from the knowledge graph by UUID",
    promptGuidelines: [
      "Use graphiti_delete_entity_edge for precise corrections — removing one wrong fact without touching others.",
      "Prefer this over graphiti_delete_episode when only one specific fact is wrong, not the whole episode.",
      "Always inspect with graphiti_get_entity_edge before deleting to confirm it's the right edge.",
    ],
    parameters: Type.Object({
      uuid: Type.String({ description: "Edge UUID to delete" }),
      group: Type.Optional(
        Type.String({ description: "Graph group/namespace the edge belongs to (default: jbreissinger)" })
      ),
    }),

    async execute(_id, params, _signal, onUpdate) {
      onUpdate?.({
        content: [{ type: "text", text: `Deleting edge ${params.uuid}…` }],
      });

      const args = ["delete-entity-edge", "--uuid", params.uuid];
      if (params.group) args.push("--group", params.group);
      const { stdout } = await runCli(args, 30_000);
      const result = parseResult(stdout);

      return {
        content: [{ type: "text", text: result.success
          ? `✅ Deleted edge \`${params.uuid}\``
          : `❌ Failed: ${result.error}` }],
        details: result,
      };
    },
  });

  // ── Tool: graphiti_status ───────────────────────────────────────────────────
  pi.registerTool({
    name: "graphiti_status",
    label: "Graphiti: Status",
    description: "Check the FalkorDB connection status and list graphs.",
    parameters: Type.Object({}),

    async execute(_id, _params, _signal, onUpdate) {
      onUpdate?.({ content: [{ type: "text", text: "Checking Graphiti connection…" }] });
      const { stdout } = await runCli(["status"], 15_000);
      const result = parseResult(stdout);
      const text = result.connected
        ? `✅ Connected to ${result.host}:${result.port}\n  Default group: ${result.default_group}\n  Graphs: ${JSON.stringify(result.graphs)}`
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
          ? `🧠 Graphiti Connected\n  Host: ${r.host}:${r.port}\n  Default group: ${r.default_group}\n  Graphs: ${JSON.stringify(r.graphs)}`
          : `❌ Graphiti unreachable\n  ${r.error}`;
        ctx.ui.notify(msg, r.connected ? "success" : "error");
      } catch (err: unknown) {
        ctx.ui.notify(`❌ Graphiti error: ${err instanceof Error ? err.message : String(err)}`, "error");
      }
    },
  });

  // ── Command: /graphiti-build-indices ───────────────────────────────────────
  pi.registerCommand("graphiti-build-indices", {
    description: "Build/rebuild vector + full-text indices on the Graphiti graph",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) return;
      ctx.ui.notify(`Building Graphiti indices…`, "info");
      try {
        const { stdout } = await runCli(["build-indices"], 120_000);
        const r = parseResult(stdout);
        ctx.ui.notify(
          r.success ? `✅ Indices built for group: ${r.group}` : `⚠️ Index build failed: ${r.error}`,
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
        `Ingest all .md files from:\n  ${memoryPath}\n\n` +
        `This triggers 3-6 LLM calls per file (up to 3 concurrent) and may take several minutes.`
      );
      if (!ok) return;

      ctx.ui.notify("🔄 Migration running — progress in stderr/logs…", "info");
      try {
        const { stdout, stderr } = await runCli(["migrate", "--dir", memoryPath], 600_000);
        const r = parseResult(stdout);
        const progressLines = stderr.trim().split("\n").slice(-10).join("\n");
        ctx.ui.notify(
          r.success
            ? `✅ Migration complete\n  Ingested: ${r.ingested}\n  Skipped:  ${r.skipped}\n\n${progressLines}`
            : `⚠️ Migration finished with errors\n  Ingested: ${r.ingested}  Errors: ${(r.errors as unknown[])?.length}\n\n${progressLines}`,
          r.success ? "success" : "warning"
        );
      } catch (err: unknown) {
        ctx.ui.notify(`❌ Migration failed: ${err instanceof Error ? err.message : String(err)}`, "error");
      }
    },
  });

  // ── Command: /graphiti-clear ───────────────────────────────────────────────
  pi.registerCommand("graphiti-clear", {
    description: "⚠️  DESTRUCTIVE: wipe all data from the graph and rebuild indices",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) return;

      const ok = await ctx.ui.confirm(
        "⚠️ Clear Graphiti Graph",
        `This will permanently delete ALL nodes, edges, and episodes from the graph.\n\nData cannot be recovered. Are you sure?`
      );
      if (!ok) return;

      ctx.ui.notify(`🗑 Clearing graph…`, "info");
      try {
        const { stdout } = await runCli(["clear-graph"], 120_000);
        const r = parseResult(stdout);
        ctx.ui.notify(
          r.success ? `✅ Graph cleared and indices rebuilt (group: ${r.group})` : `⚠️ Clear failed: ${r.error}`,
          r.success ? "success" : "warning"
        );
      } catch (err: unknown) {
        ctx.ui.notify(`❌ Clear failed: ${err instanceof Error ? err.message : String(err)}`, "error");
      }
    },
  });
}
