/**
 * graphiti-memory — pi extension
 *
 * Registers tools and commands for the Graphiti temporal knowledge graph
 * backed by FalkorDB at graphiti.breissinger.dev.
 *
 * Graph layout (one FalkorDB graph per domain):
 *   holocron_user      — personal preferences, Jack-specific facts, career
 *   holocron_lahzo     — Lahzo work context, team, repos, architecture
 *   holocron_system    — Holocron tooling, config, voice, backup
 *   holocron_projects  — personal project state (non-Lahzo)
 *   holocron_learning  — reflections, learned patterns, ratings
 *
 * Tools (callable by LLM):
 *   graphiti_add              — ingest a fact/preference/context into a specific graph
 *   graphiti_search           — fan-out hybrid search for facts (edges) across all graphs
 *   graphiti_search_nodes     — fan-out search for entity node summaries across all graphs
 *   graphiti_get_episodes     — list recent episodes for a group
 *   graphiti_delete_episode   — delete an episode by UUID
 *   graphiti_get_entity_edge  — retrieve a specific fact/edge by UUID
 *   graphiti_delete_entity_edge — delete a specific fact/edge by UUID
 *   graphiti_status           — check connection and list graphs
 *
 * Commands:
 *   /graphiti-status         — show connection + graph info
 *   /graphiti-build-indices  — build/rebuild indices on all graphs
 *   /graphiti-migrate        — bulk ingest existing Holocron markdown files
 *   /graphiti-clear          — ⚠️  wipe a graph and rebuild indices (destructive)
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

const ALL_DATABASES = [
  "holocron_user",
  "holocron_lahzo",
  "holocron_system",
  "holocron_projects",
  "holocron_learning",
] as const;

const DB_DESCRIPTIONS =
  "holocron_user (personal/preferences/career), " +
  "holocron_lahzo (Lahzo work context), " +
  "holocron_system (tooling/config), " +
  "holocron_projects (personal projects), " +
  "holocron_learning (reflections/patterns)";

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
      "The graph automatically extracts entities and relationships using structured entity types " +
      "(Preference, Requirement, Procedure, Location, Event, Organization, Document, etc.) " +
      "and handles contradiction resolution over time. " +
      "The group_id determines which graph the data lands in — choose the most specific match.",
    promptSnippet: "Persist facts, preferences, or context to the long-term knowledge graph",
    promptGuidelines: [
      "Use graphiti_add when the user says 'remember', 'note that', 'save this', or explicitly wants something stored long-term.",
      "Use graphiti_add after discovering important project architecture, team structure, or user preferences worth persisting.",
      "group_id='holocron_user': Jack's personal preferences, workflow rules, editor choices, career facts.",
      "group_id='holocron_lahzo': Lahzo work context — team members, repo structure, architecture, clients, tickets.",
      "group_id='holocron_system': Holocron/tooling config — voice settings, algorithm version, extension state.",
      "group_id='holocron_projects': Personal project state — Homelab, personal tools, non-Lahzo repos.",
      "group_id='holocron_learning': Reflections, learned patterns, session ratings, retrospectives.",
      "When in doubt about the group, default to holocron_user for personal facts or holocron_lahzo for work facts.",
    ],
    parameters: Type.Object({
      text: Type.String({
        description: "The content to ingest. Can be a sentence, paragraph, or structured notes.",
      }),
      group_id: Type.String({
        description: `Target graph. Must be one of: ${DB_DESCRIPTIONS}.`,
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
        ? `✅ Ingested to [${result.database ?? params.group_id}] — ${result.chars} chars, episode: ${result.episode_uuid ?? "n/a"}, entity_types: ${result.entity_types}`
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
      "By default searches ALL graphs in parallel and returns merged results tagged with their source graph. " +
      "Each result is a fact with temporal metadata (valid_at / invalid_at). " +
      "Use graphiti_search_nodes instead when you want entity summaries rather than specific facts.",
    promptSnippet: "Retrieve stored facts and context from the long-term knowledge graph",
    promptGuidelines: [
      "Use graphiti_search when the user references past context, preferences, or facts that may not be in the current conversation.",
      "Default: omit databases to search ALL graphs — prefer this when the domain is unclear.",
      "Scope databases=['holocron_user'] for questions about Jack's personal preferences, workflow rules, or career.",
      "Scope databases=['holocron_lahzo'] for questions about Lahzo team, repos, architecture, clients, or specific tickets.",
      "Scope databases=['holocron_system'] for questions about Holocron config, voice settings, or tooling state.",
      "Scope databases=['holocron_projects'] for questions about personal project state.",
      "Scope databases=['holocron_learning'] for questions about reflections or learned patterns.",
      "Facts include 'valid_at' and 'invalid_at' timestamps — null invalid_at means the fact is currently true.",
      "Use graphiti_search_nodes when you want entity summaries (what an entity IS) rather than facts (what happened).",
    ],
    parameters: Type.Object({
      query: Type.String({ description: "Natural language search query" }),
      databases: Type.Optional(
        Type.Array(Type.String(), {
          description: `Graphs to search. Omit to search ALL (recommended when domain is unclear). Options: ${ALL_DATABASES.join(", ")}.`,
        })
      ),
      num_results: Type.Optional(
        Type.Number({ description: "Results per graph (default 10). Searching all graphs may yield up to 50 total." })
      ),
    }),

    async execute(_id, params, _signal, onUpdate) {
      const scope = params.databases?.length ? params.databases.join(", ") : "all graphs";
      onUpdate?.({
        content: [{ type: "text", text: `Searching Graphiti facts [${scope}]: "${params.query}"…` }],
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
        fact: string; database: string; valid_at: string | null; invalid_at: string | null;
      }>) ?? [];
      const total       = (result.total as number) ?? 0;
      const dbsSearched = (result.databases_searched as string[]) ?? [];
      const errors      = (result.errors as Array<{ database: string; error: string }>) ?? [];

      const lines: string[] = [
        `🔍 ${total} fact${total !== 1 ? "s" : ""} across [${dbsSearched.join(", ")}] for: "${params.query}"\n`,
      ];

      if (facts.length > 0) {
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
      "Complementary to graphiti_search (which returns edge facts). Use this when you want to understand " +
      "what entities exist and their summarized state, not what happened between them.",
    promptSnippet: "Find entity summaries (people, tools, concepts) in the knowledge graph",
    promptGuidelines: [
      "Use graphiti_search_nodes when the question is 'what do you know about X?' rather than 'what did X do?'.",
      "Node summaries aggregate all known facts about an entity into a coherent description.",
      "Use graphiti_search for facts/events; use graphiti_search_nodes for entity descriptions.",
      "Default: omit databases to search ALL graphs in parallel.",
      "Results include entity_type (Preference, Organization, Person, etc.) to help filter relevance.",
    ],
    parameters: Type.Object({
      query: Type.String({ description: "Natural language query describing the entities you're looking for" }),
      databases: Type.Optional(
        Type.Array(Type.String(), {
          description: `Graphs to search. Omit to search ALL. Options: ${ALL_DATABASES.join(", ")}.`,
        })
      ),
      num_results: Type.Optional(
        Type.Number({ description: "Results per graph (default 10)." })
      ),
    }),

    async execute(_id, params, _signal, onUpdate) {
      const scope = params.databases?.length ? params.databases.join(", ") : "all graphs";
      onUpdate?.({
        content: [{ type: "text", text: `Searching Graphiti nodes [${scope}]: "${params.query}"…` }],
      });

      const args = ["search-nodes", "--query", params.query];
      if (params.databases?.length) args.push("--databases", params.databases.join(","));
      if (params.num_results)       args.push("--num-results", String(params.num_results));

      const { stdout } = await runCli(args, 60_000);
      const result = parseResult(stdout);

      const nodes = (result.nodes as Array<{
        name: string; summary: string | null; entity_type: string | null;
        database: string; uuid: string | null;
      }>) ?? [];
      const total       = (result.total as number) ?? 0;
      const dbsSearched = (result.databases_searched as string[]) ?? [];
      const errors      = (result.errors as Array<{ database: string; error: string }>) ?? [];

      const lines: string[] = [
        `🧩 ${total} node${total !== 1 ? "s" : ""} across [${dbsSearched.join(", ")}] for: "${params.query}"\n`,
      ];

      if (nodes.length > 0) {
        const byDb = new Map<string, typeof nodes>();
        for (const n of nodes) {
          if (!byDb.has(n.database)) byDb.set(n.database, []);
          byDb.get(n.database)!.push(n);
        }
        for (const [db, dbNodes] of byDb) {
          lines.push(`**${db}:**`);
          for (const n of dbNodes) {
            const typeTag = n.entity_type ? ` [${n.entity_type}]` : "";
            lines.push(`• **${n.name}**${typeTag}: ${n.summary ?? "_(no summary)_"}`);
          }
          lines.push("");
        }
      } else {
        lines.push("_(no entity nodes found)_");
      }

      if (errors.length > 0) {
        lines.push(`⚠️ Errors: ${errors.map(e => `${e.database}: ${e.error}`).join("; ")}`);
      }

      return { content: [{ type: "text", text: lines.join("\n") }], details: result };
    },
  });

  // ── Tool: graphiti_get_episodes ─────────────────────────────────────────────
  pi.registerTool({
    name: "graphiti_get_episodes",
    label: "Graphiti: Get Episodes",
    description:
      "List the most recent episodes ingested into a specific Graphiti graph. " +
      "Useful for reviewing what has been stored, debugging ingestion, or finding episode UUIDs for deletion.",
    promptSnippet: "List recent episodes in a Graphiti graph",
    promptGuidelines: [
      "Use graphiti_get_episodes when the user asks 'what have you stored?', 'show me the graph', or 'what was ingested?'.",
      "Episode content is truncated to 200 chars for display — use get_entity_edge for full fact details.",
      "Use the returned UUIDs with graphiti_delete_episode to remove incorrect or outdated episodes.",
    ],
    parameters: Type.Object({
      group_id: Type.String({
        description: `Graph to query. One of: ${DB_DESCRIPTIONS}.`,
      }),
      limit: Type.Optional(
        Type.Number({ description: "Max episodes to return (default 10, max recommended 50)" })
      ),
    }),

    async execute(_id, params, _signal, onUpdate) {
      onUpdate?.({
        content: [{ type: "text", text: `Fetching recent episodes from [${params.group_id}]…` }],
      });

      const args = ["get-episodes", "--group", params.group_id];
      if (params.limit) args.push("--limit", String(params.limit));

      const { stdout } = await runCli(args, 30_000);
      const result = parseResult(stdout);

      if (!result.success) {
        return {
          content: [{ type: "text", text: `❌ Failed: ${result.error}` }],
          details: result,
        };
      }

      const episodes = (result.episodes as Array<{
        uuid: string; name: string | null; source: string; created_at: string | null; content: string;
      }>) ?? [];
      const total = (result.total as number) ?? 0;

      const lines: string[] = [
        `📚 ${total} episode${total !== 1 ? "s" : ""} in [${params.group_id}]\n`,
      ];
      for (const ep of episodes) {
        const ts   = ep.created_at ? ep.created_at.slice(0, 10) : "unknown";
        const name = ep.name ?? ep.uuid;
        lines.push(`• **${name}** (${ep.source}, ${ts})`);
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
      "Delete an episode from the Graphiti knowledge graph by UUID. " +
      "Removing an episode also removes the entity edges and nodes that were exclusively derived from it. " +
      "Use graphiti_get_episodes to find episode UUIDs before deleting.",
    promptSnippet: "Delete a stored episode from the knowledge graph",
    promptGuidelines: [
      "Use graphiti_delete_episode to correct mistakes — wrong info, outdated content, or mis-routed episodes.",
      "Always confirm the UUID with graphiti_get_episodes first before deleting.",
      "Deletion cascades: entities extracted only from this episode will also be removed.",
    ],
    parameters: Type.Object({
      uuid: Type.String({ description: "Episode UUID to delete" }),
      group_id: Type.String({
        description: `Graph containing the episode. One of: ${DB_DESCRIPTIONS}.`,
      }),
    }),

    async execute(_id, params, _signal, onUpdate) {
      onUpdate?.({
        content: [{ type: "text", text: `Deleting episode ${params.uuid} from [${params.group_id}]…` }],
      });

      const { stdout } = await runCli(
        ["delete-episode", "--uuid", params.uuid, "--group", params.group_id],
        30_000
      );
      const result = parseResult(stdout);

      const text = result.success
        ? `✅ Deleted episode \`${params.uuid}\` from [${params.group_id}]`
        : `❌ Failed: ${result.error}`;

      return { content: [{ type: "text", text }], details: result };
    },
  });

  // ── Tool: graphiti_get_entity_edge ──────────────────────────────────────────
  pi.registerTool({
    name: "graphiti_get_entity_edge",
    label: "Graphiti: Get Entity Edge",
    description:
      "Retrieve a specific entity edge (fact) from the Graphiti knowledge graph by UUID. " +
      "Returns full details including the fact text, temporal bounds, source/target nodes, and originating episodes. " +
      "Use graphiti_search to find fact UUIDs, then this tool to inspect before deleting.",
    promptSnippet: "Look up a specific fact/edge in the knowledge graph by UUID",
    promptGuidelines: [
      "Use graphiti_get_entity_edge to inspect a fact before deciding to delete it.",
      "The 'episodes' field lists episode UUIDs that contributed to this fact.",
      "valid_at/invalid_at show the fact's temporal scope — null invalid_at means currently true.",
    ],
    parameters: Type.Object({
      uuid: Type.String({ description: "Edge UUID to retrieve" }),
      group_id: Type.String({
        description: `Graph containing the edge. One of: ${DB_DESCRIPTIONS}.`,
      }),
    }),

    async execute(_id, params, _signal, onUpdate) {
      onUpdate?.({
        content: [{ type: "text", text: `Fetching edge ${params.uuid} from [${params.group_id}]…` }],
      });

      const { stdout } = await runCli(
        ["get-entity-edge", "--uuid", params.uuid, "--group", params.group_id],
        30_000
      );
      const result = parseResult(stdout);

      if (!result.success) {
        return {
          content: [{ type: "text", text: `❌ Failed: ${result.error}` }],
          details: result,
        };
      }

      const expired = result.invalid_at
        ? ` *(expired ${String(result.invalid_at).slice(0, 10)})*`
        : "";
      const text = [
        `📎 Edge \`${result.uuid}\` in [${result.database}]`,
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
      "Delete a specific entity edge (fact) from the Graphiti knowledge graph by UUID. " +
      "Use for surgical correction of individual incorrect or outdated facts without removing whole episodes. " +
      "Use graphiti_search or graphiti_get_entity_edge to find the UUID first.",
    promptSnippet: "Delete a specific fact/edge from the knowledge graph by UUID",
    promptGuidelines: [
      "Use graphiti_delete_entity_edge for precise corrections — removing one wrong fact without touching others.",
      "Prefer this over graphiti_delete_episode when only one specific fact is wrong, not the whole episode.",
      "Always inspect with graphiti_get_entity_edge before deleting to confirm it's the right edge.",
    ],
    parameters: Type.Object({
      uuid: Type.String({ description: "Edge UUID to delete" }),
      group_id: Type.String({
        description: `Graph containing the edge. One of: ${DB_DESCRIPTIONS}.`,
      }),
    }),

    async execute(_id, params, _signal, onUpdate) {
      onUpdate?.({
        content: [{ type: "text", text: `Deleting edge ${params.uuid} from [${params.group_id}]…` }],
      });

      const { stdout } = await runCli(
        ["delete-entity-edge", "--uuid", params.uuid, "--group", params.group_id],
        30_000
      );
      const result = parseResult(stdout);

      const text = result.success
        ? `✅ Deleted edge \`${params.uuid}\` from [${params.group_id}]`
        : `❌ Failed: ${result.error}`;

      return { content: [{ type: "text", text }], details: result };
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
          ? `🧠 Graphiti Connected\n  Host: ${r.host}:${r.port}\n  Graphs: ${JSON.stringify(r.graphs)}\n  Configured: ${ALL_DATABASES.join(", ")}`
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
        `Ingest all .md files from:\n  ${memoryPath}\n\n` +
        `This triggers 3-6 LLM calls per file (up to ${3} concurrent) and may take several minutes.`
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

  // ── Command: /graphiti-clear ───────────────────────────────────────────────
  pi.registerCommand("graphiti-clear", {
    description: "⚠️  DESTRUCTIVE: wipe all data from one or more graphs and rebuild indices",
    handler: async (args, ctx) => {
      if (!ctx.hasUI) return;

      // Accept optional graph name as argument: /graphiti-clear holocron_learning
      const target = args.trim() || "ALL graphs";
      const ok = await ctx.ui.confirm(
        "⚠️ Clear Graphiti Graph",
        `This will permanently delete ALL nodes, edges, and episodes from:\n  ${target}\n\n` +
        `Data cannot be recovered. Are you sure?`
      );
      if (!ok) return;

      const cliArgs = ["clear-graph"];
      if (args.trim()) cliArgs.push("--databases", args.trim());

      ctx.ui.notify(`🗑 Clearing ${target}…`, "info");
      try {
        const { stdout } = await runCli(cliArgs, 120_000);
        const r = parseResult(stdout);
        const detail = Object.entries(r.databases as Record<string, string>)
          .map(([db, status]) => `  ${status === "cleared" ? "✓" : "✗"} ${db}: ${status}`)
          .join("\n");
        ctx.ui.notify(
          `${r.success ? "✅" : "⚠️"} Clear complete\n${detail}`,
          r.success ? "success" : "warning"
        );
      } catch (err: unknown) {
        ctx.ui.notify(`❌ Clear failed: ${err instanceof Error ? err.message : String(err)}`, "error");
      }
    },
  });
}
