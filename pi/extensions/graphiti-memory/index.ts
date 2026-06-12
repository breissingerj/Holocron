/**
 * graphiti-memory — pi extension
 *
 * Thin MCP client over the custom graphiti-mcp server (streamable-HTTP).
 * All graph access, entity extraction, and OpenAI/embedding calls happen
 * server-side; this extension only marshals tool args and formats results.
 *   Endpoint: GRAPHITI_MCP_URL (default https://graphiti-mcp.breissinger.dev/mcp/)
 *   Auth:     optional Bearer via GRAPHITI_MCP_TOKEN
 *
 * Default graph: all data lives under group_id "jbreissinger".
 * Any tool that accepts an optional `group` parameter can target a different
 * graph (e.g. "rivian_demo"). The graph is created automatically on first
 * write; call graphiti_build_indices after creating a new graph.
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
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

const DEFAULT_GROUP = "jbreissinger";

// Remote MCP server (custom graphiti-mcp — parity tools + docrefs).
// Override with GRAPHITI_MCP_URL (e.g. http://localhost:8000/mcp/ for local dev).
// Optional bearer auth via GRAPHITI_MCP_TOKEN once the traefik route is protected.
const MCP_URL = process.env.GRAPHITI_MCP_URL ?? "https://graphiti-mcp.breissinger.dev/mcp/";
const MCP_TOKEN = process.env.GRAPHITI_MCP_TOKEN;

// ── MCP client (lazy singleton, reused across tool calls) ─────────────────────

let _client: Client | null = null;
let _connecting: Promise<Client> | null = null;

function makeTransport(): StreamableHTTPClientTransport {
  const requestInit: RequestInit = MCP_TOKEN
    ? { headers: { Authorization: `Bearer ${MCP_TOKEN}` } }
    : {};
  return new StreamableHTTPClientTransport(new URL(MCP_URL), { requestInit });
}

async function getClient(): Promise<Client> {
  if (_client) return _client;
  if (_connecting) return _connecting;
  _connecting = (async () => {
    const client = new Client({ name: "graphiti-memory-ext", version: "2.0.0" });
    await client.connect(makeTransport());
    _client = client;
    return client;
  })();
  try {
    return await _connecting;
  } finally {
    _connecting = null;
  }
}

async function resetClient(): Promise<void> {
  const c = _client;
  _client = null;
  if (c) { try { await c.close(); } catch { /* ignore */ } }
}

/**
 * Call a graphiti tool on the remote MCP server and return its JSON payload.
 * The server's tools return the same dict shapes the old CLI emitted, so the
 * per-tool formatting below is unchanged. Reconnects once on transport error
 * (HTTP sessions can drop between calls).
 */
async function callGraphiti(
  tool: string,
  args: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const invoke = async (): Promise<Record<string, unknown>> => {
    const client = await getClient();
    const res = await client.callTool({ name: tool, arguments: pruneUndefined(args) });
    // Prefer structuredContent (FastMCP dict return); fall back to text JSON.
    const structured = (res as { structuredContent?: unknown }).structuredContent;
    if (structured && typeof structured === "object") {
      return structured as Record<string, unknown>;
    }
    const content =
      (res as { content?: Array<{ type: string; text?: string }> }).content ?? [];
    const textBlock = content.find((c) => c.type === "text" && typeof c.text === "string");
    if (textBlock?.text) {
      try { return JSON.parse(textBlock.text); }
      catch { return { success: false, raw: textBlock.text }; }
    }
    if ((res as { isError?: boolean }).isError) {
      return { success: false, error: "MCP tool reported an error with no payload" };
    }
    return { success: false, error: "empty MCP tool result" };
  };

  try {
    return await invoke();
  } catch {
    await resetClient(); // one reconnect attempt on a dropped session
    try {
      return await invoke();
    } catch (err2) {
      return { success: false, error: err2 instanceof Error ? err2.message : String(err2) };
    }
  }
}

function pruneUndefined(o: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v;
  return out;
}

/** Recursively list *.md files under a directory (for /graphiti-migrate). */
async function listMarkdown(dir: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...await listMarkdown(full));
    else if (e.isFile() && e.name.toLowerCase().endsWith(".md")) out.push(full);
  }
  return out;
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

      const result = await callGraphiti("graphiti_build_indices", { group: params.group });

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

      const result = await callGraphiti("graphiti_add", {
        text: params.text,
        name: params.name,
        source_description: params.source_description,
        source: params.source,
        group: params.group,
      });

      const targetGroup = params.group ?? DEFAULT_GROUP;
      const summary = result.success
        ? `✅ Ingested — ${result.chars} chars, group: "${result.group ?? result.group_id ?? targetGroup}", episode: ${result.episode_uuid ?? "n/a"}`
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

      const result = await callGraphiti("graphiti_search", {
        query: params.query,
        num_results: params.num_results,
        group: params.group,
      });

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

      const result = await callGraphiti("graphiti_search_nodes", {
        query: params.query,
        num_results: params.num_results,
        group: params.group,
      });

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

      const result = await callGraphiti("graphiti_get_episodes", {
        limit: params.limit,
        full: params.full,
        group: params.group,
      });

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

      const result = await callGraphiti("graphiti_delete_episode", {
        uuid: params.uuid,
        group: params.group,
      });

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

      const result = await callGraphiti("graphiti_get_entity_edge", {
        uuid: params.uuid,
        group: params.group,
      });

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

      const result = await callGraphiti("graphiti_delete_entity_edge", {
        uuid: params.uuid,
        group: params.group,
      });

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
      const result = await callGraphiti("graphiti_status", {});
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
        const r = await callGraphiti("graphiti_status", {});
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
        const r = await callGraphiti("graphiti_build_indices", {});
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

      // Collect .md files locally; ingestion (LLM extraction/embeddings) is
      // offloaded to the MCP server via graphiti_add.
      let files: string[];
      try {
        files = await listMarkdown(memoryPath);
      } catch (err: unknown) {
        ctx.ui.notify(`❌ Cannot read ${memoryPath}: ${err instanceof Error ? err.message : String(err)}`, "error");
        return;
      }
      if (files.length === 0) {
        ctx.ui.notify(`No .md files found under ${memoryPath}`, "warning");
        return;
      }

      const ok = await ctx.ui.confirm(
        "Migrate Holocron Memory → Graphiti",
        `Ingest ${files.length} .md file(s) from:\n  ${memoryPath}\n\n` +
        `Each triggers server-side LLM extraction (up to 3 concurrent) and may take several minutes.`
      );
      if (!ok) return;

      ctx.ui.notify(`🔄 Migrating ${files.length} file(s) via MCP server…`, "info");

      let ingested = 0;
      const errors: string[] = [];
      const CONCURRENCY = 3;
      let cursor = 0;
      const worker = async () => {
        while (cursor < files.length) {
          const idx = cursor++;
          const file = files[idx];
          const rel = relative(memoryPath, file);
          try {
            const text = await readFile(file, "utf8");
            if (!text.trim()) continue;
            const r = await callGraphiti("graphiti_add", {
              text,
              name: rel,
              source_description: `holocron migration: ${rel}`,
            });
            if (r.success) ingested++;
            else errors.push(`${rel}: ${r.error}`);
          } catch (err: unknown) {
            errors.push(`${rel}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      };
      await Promise.all(Array.from({ length: CONCURRENCY }, worker));

      const tail = errors.slice(-8).join("\n");
      ctx.ui.notify(
        errors.length === 0
          ? `✅ Migration complete\n  Ingested: ${ingested}/${files.length}`
          : `⚠️ Migration finished with errors\n  Ingested: ${ingested}/${files.length}  Errors: ${errors.length}\n\n${tail}`,
        errors.length === 0 ? "success" : "warning"
      );
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
        const r = await callGraphiti("graphiti_clear_graph", {});
        if (r.success) await callGraphiti("graphiti_build_indices", {});
        ctx.ui.notify(
          r.success ? `✅ Graph cleared and indices rebuilt (group: ${r.cleared_group ?? r.group})` : `⚠️ Clear failed: ${r.error}`,
          r.success ? "success" : "warning"
        );
      } catch (err: unknown) {
        ctx.ui.notify(`❌ Clear failed: ${err instanceof Error ? err.message : String(err)}`, "error");
      }
    },
  });
}
