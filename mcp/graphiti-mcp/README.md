# graphiti-mcp

Custom MCP server for the Graphiti temporal knowledge graph (FalkorDB @
graphiti.breissinger.dev) with **live document references** and
**read-through caching**.

Implements M1+M2 of `holocron-context/WORK/20260612-123557_graphiti-live-doc-references/PLAN.md`.

## What it does

- **Parity tools** — the full graphiti-memory toolset (add/search/episodes/edges/indices/status), harness-agnostic over MCP stdio.
- **DocRefs** — register a live source (today: any git codebase; Confluence M3 and Google Drive M4 pending auth decisions). The graph holds extracted knowledge; a SQLite registry (`~/.graphiti-mcp/registry.db`) holds version/freshness metadata; a disk cache holds the latest normalized markdown.
- **Read-through caching** — `docref_get` returns cached content instantly when fresh. Past TTL it runs a cheap probe (git SHA only). Unchanged → revalidate. Changed → return cached with `stale: true` and queue a durable refresh job — the read path **never** re-ingests inline.
- **Durable refresh queue** — jobs survive process death (stdio servers die with the client session). The in-process worker drains during the session; orphaned jobs are reclaimed at next server startup or by `graphiti-mcp drain`.
- **Ingestion hygiene** — section-anchored chunking (markdown headers, fence-aware, ~6k soft cap), per-chunk hash gating (a one-paragraph edit re-ingests one chunk), temporal supersession (old facts get `invalid_at`, never hard-deleted except by `docref_remove`/`prune`).

## Install / run

```bash
cd Holocron/mcp/graphiti-mcp
uv sync
uv run graphiti-mcp serve        # MCP server on stdio
uv run pytest                    # 135 unit tests
```

Secrets come from the environment — inject with 1Password when needed:
`op run --env-file=.env -- uv run graphiti-mcp serve`.

## Register with a harness

Claude Code (global):
```bash
claude mcp add graphiti-mcp --scope user -- \
  uv run --project /Users/jbreissinger/Projects/personalProjects/Holocron/mcp/graphiti-mcp graphiti-mcp serve
```

JSON config (`.mcp.json` / `mcp.json` style):
```json
{
  "mcpServers": {
    "graphiti-mcp": {
      "command": "uv",
      "args": ["run", "--project",
               "/Users/jbreissinger/Projects/personalProjects/Holocron/mcp/graphiti-mcp",
               "graphiti-mcp", "serve"]
    }
  }
}
```

Requires `OPENAI_API_KEY` (and optionally `FALKORDB_PASSWORD`) in the
harness environment.

## DocRef URIs

```
repo://github.com/<owner>/<repo>@<branch>/<path-glob>   remote repo (shallow bare mirror)
repo://local/<absolute-path>@<branch>/<path-glob>       local checkout (reads committed content, not working tree)
confluence://<site>/<space>/<pageId>                    recognized — M3, not yet enabled
gdrive://<fileId>                                       recognized — M4, not yet enabled
```

Glob defaults to `**/*.md`. Generic globs are restricted to doc extensions
(`.md .mdx .txt .rst`); a glob with an explicit extension (e.g. `**/*.py`)
opts that type in. Always blocked: `node_modules/ dist/ build/ vendor/`,
lockfiles, minified files, files over 100KB.

## Tools (MCP)

Core memory — `graphiti_add` `graphiti_search` `graphiti_search_nodes`
`graphiti_get_episodes` `graphiti_delete_episode` `graphiti_get_entity_edge`
`graphiti_delete_entity_edge` `graphiti_build_indices` `graphiti_status`.

Official-parity additions — `graphiti_add_triplet` `graphiti_get_episode_entities`
`graphiti_clear_graph` `graphiti_build_communities` `graphiti_summarize_saga`.

Live references — `docref_register` `docref_get` `docref_list` `docref_remove`.

### Extended params (parity with the official Zep MCP server)

- `graphiti_add`: `reference_time` (ISO-8601, bi-temporal event time), `uuid`
  (caller-chosen episode UUID), `excluded_entity_types`,
  `custom_extraction_instructions`, `previous_episode_uuids`,
  `update_communities`, `saga`, `saga_previous_episode_uuid`.
- `graphiti_search`: `center_node_uuid` (graph-distance rerank), `edge_types`,
  and `valid_at_after/before` + `invalid_at_after/before` date-range filters.
- `graphiti_search_nodes`: `entity_types` (label filter), `center_node_uuid`.

Pure arg-translation helpers live in `typing_helpers.py` (ported from the
official server's `utils/type_config.py`); entity types are now applied as
`dict[str, type[BaseModel]]` doc-only Pydantic models — the previous
`build_entity_types()` silently returned `None` because `graphiti_core.nodes`
no longer exports `EntityType`, so extraction never received them.

## Admin CLI (expensive ops stay off the agent surface)

```bash
uv run graphiti-mcp status                 # connectivity + registry summary
uv run graphiti-mcp register <uri> [--ttl S] [--group G]
uv run graphiti-mcp get <id-or-uri>
uv run graphiti-mcp list
uv run graphiti-mcp refresh <id> | --all   # force re-fetch/ingest now
uv run graphiti-mcp drain                  # work the pending queue (reclaims orphans)
uv run graphiti-mcp prune [--keep N]       # drop episodes beyond last N versions
uv run graphiti-mcp remove <id-or-uri>     # purge docref + derived episodes
```

## Config (env)

| Variable | Default |
|---|---|
| `FALKORDB_HOST` / `FALKORDB_PORT` / `FALKORDB_PASSWORD` | graphiti.breissinger.dev / 6379 / — |
| `GRAPHITI_GROUP_ID` | jbreissinger |
| `GRAPHITI_LLM_MODEL` / `GRAPHITI_EMBED_MODEL` | gpt-4.1-mini / text-embedding-3-small |
| `GRAPHITI_MCP_HOME` | ~/.graphiti-mcp |
| `GRAPHITI_MCP_CB_THRESHOLD` / `GRAPHITI_MCP_CB_COOLOFF` | 5 failures / 1800s |
| `GRAPHITI_MCP_MAX_FILE_BYTES` / `GRAPHITI_MCP_CHUNK_SOFT_MAX` | 100000 / 6000 |
| `GRAPHITI_MCP_PRUNE_KEEP` | 3 |

TTL defaults: codebase 6h, confluence 24h, gdrive 24h (override per docref at registration).

## Known limits

- If a refresh crashes between `add_episode` and the registry update, those episodes are ingested but unrecorded — the retry re-ingests, and supersession tolerates the duplicates; `prune`/group clear are the cleanup tools. (Future: record UUIDs incrementally.)
- Confluence/Drive connectors raise `NotConfigured` until M3/M4 auth decisions land.
- The pi extension (`pi/extensions/graphiti-memory/`) is intentionally untouched until M6 migration.
