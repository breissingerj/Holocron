#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "graphiti-core[falkordb,anthropic]",
#   "openai",
# ]
# ///
"""
graphiti_cli.py — CLI wrapper for graphiti-core with FalkorDB backend.

Called by the graphiti-memory pi extension via `uv run --script`.
All commands output JSON to stdout. Progress/logs go to stderr.

Graph layout (one FalkorDB graph per domain):
  holocron_user      — personal preferences, Jack-specific facts, career
  holocron_lahzo     — Lahzo work context, team, repos, architecture
  holocron_system    — Holocron tooling, config, voice, backup
  holocron_projects  — personal project state (non-Lahzo)
  holocron_learning  — reflections, learned patterns, ratings

Search fans out across ALL graphs by default. Scope with --databases to
restrict to a subset when the relevant domain is already known.

Add routes to the graph matching the group_id (group == database name).

Environment variables:
  FALKORDB_HOST          (default: graphiti.breissinger.dev)
  FALKORDB_PORT          (default: 6379)
  FALKORDB_PASSWORD      (default: none)
  ANTHROPIC_API_KEY      (required for add/migrate)
  OPENAI_API_KEY         (required for search/add/migrate — embeddings)
  GRAPHITI_LLM_MODEL     (default: claude-haiku-4-5-20251001)
  GRAPHITI_EMBED_MODEL   (default: text-embedding-3-small)
  GRAPHITI_SEMAPHORE     (default: 3 — concurrent episodes during migrate)
"""

import argparse
import asyncio
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

# ── Config ────────────────────────────────────────────────────────────────────

FALKORDB_HOST     = os.environ.get("FALKORDB_HOST",     "graphiti.breissinger.dev")
FALKORDB_PORT     = int(os.environ.get("FALKORDB_PORT", "6379"))
FALKORDB_PASSWORD = os.environ.get("FALKORDB_PASSWORD") or None
LLM_MODEL         = os.environ.get("GRAPHITI_LLM_MODEL",  "claude-haiku-4-5-20251001")
EMBED_MODEL       = os.environ.get("GRAPHITI_EMBED_MODEL", "text-embedding-3-small")
SEMAPHORE_LIMIT   = int(os.environ.get("GRAPHITI_SEMAPHORE", "3"))

# Canonical graph names (underscore required — FalkorDB RediSearch treats
# hyphens as negation operators in field-filter values).
ALL_DATABASES = [
    "holocron_user",
    "holocron_lahzo",
    "holocron_system",
    "holocron_projects",
    "holocron_learning",
]

# Migration: map filename stem keywords → database name
GROUP_MAP = {
    "lahzo":         "holocron_lahzo",
    "promeniq":      "holocron_lahzo",
    "multiverse":    "holocron_lahzo",
    "wilkins":       "holocron_lahzo",
    "analytics":     "holocron_lahzo",
    "monorepo":      "holocron_lahzo",
    "prompting":     "holocron_lahzo",
    "holocron":      "holocron_system",
    "pai":           "holocron_system",
    "opencode":      "holocron_system",
    "notifications": "holocron_system",
    "user-career":   "holocron_user",
    "reviews":       "holocron_user",
    "projects":      "holocron_projects",
    "learning":      "holocron_learning",
    "reflect":       "holocron_learning",
    "ratings":       "holocron_learning",
}

# ── Entity types ──────────────────────────────────────────────────────────────
# Mirrors the built-in entity types from the Graphiti MCP server.
# Passed to add_episode to guide LLM entity extraction.

_ENTITY_TYPE_DEFS = [
    ("Preference",    "User preferences, choices, opinions, or selections (prioritized for user-specific information)"),
    ("Requirement",   "Specific needs, features, or functionality that must be fulfilled"),
    ("Procedure",     "Standard operating procedures and sequential instructions"),
    ("Location",      "Physical or virtual places where activities occur"),
    ("Event",         "Time-bound activities, occurrences, or experiences"),
    ("Organization",  "Companies, institutions, groups, or formal entities"),
    ("Document",      "Information content in various forms (books, articles, reports, videos, etc.)"),
    ("Topic",         "Subject of conversation, interest, or knowledge domain (fallback)"),
    ("Object",        "Physical items, tools, devices, or possessions (fallback)"),
]


def _build_entity_types():
    """Return a list of graphiti-core EntityType objects, or None if not available."""
    try:
        from graphiti_core.nodes import EntityType  # type: ignore
        return [EntityType(name=n, description=d) for n, d in _ENTITY_TYPE_DEFS]
    except Exception:
        # Older graphiti-core versions may not expose EntityType — skip gracefully.
        return None


# ── Client factory ────────────────────────────────────────────────────────────

def make_graphiti(database: str):
    """Create a Graphiti instance connected to the given FalkorDB graph."""
    from graphiti_core import Graphiti
    from graphiti_core.driver.falkordb_driver import FalkorDriver
    from graphiti_core.llm_client.anthropic_client import AnthropicClient
    from graphiti_core.llm_client.config import LLMConfig
    from graphiti_core.embedder.openai import OpenAIEmbedder, OpenAIEmbedderConfig

    driver   = FalkorDriver(host=FALKORDB_HOST, port=FALKORDB_PORT,
                            password=FALKORDB_PASSWORD, database=database)
    llm      = AnthropicClient(config=LLMConfig(model=LLM_MODEL))
    embedder = OpenAIEmbedder(config=OpenAIEmbedderConfig(embedding_model=EMBED_MODEL))
    return Graphiti(graph_driver=driver, llm_client=llm, embedder=embedder)


# ── Commands ──────────────────────────────────────────────────────────────────

async def cmd_status(_args) -> dict:
    """Ping FalkorDB — no LLM calls needed."""
    try:
        from falkordb.asyncio import FalkorDB as FalkorDBClient  # type: ignore
        client = FalkorDBClient(host=FALKORDB_HOST, port=FALKORDB_PORT,
                                password=FALKORDB_PASSWORD)
        graphs = await client.list_graphs()
        return {
            "connected": True,
            "host":      FALKORDB_HOST,
            "port":      FALKORDB_PORT,
            "databases": ALL_DATABASES,
            "graphs":    sorted(graphs) if graphs else [],
        }
    except Exception as e:
        return {"connected": False, "host": FALKORDB_HOST, "port": FALKORDB_PORT,
                "error": str(e)}


async def cmd_build_indices(args) -> dict:
    """Build vector/full-text indices on every graph (idempotent)."""
    databases = (
        [d.strip() for d in args.databases.split(",")]
        if getattr(args, "databases", None)
        else ALL_DATABASES
    )
    results = {}
    for db in databases:
        g = make_graphiti(db)
        try:
            await g.build_indices_and_constraints()
            results[db] = "ok"
        except Exception as e:
            results[db] = f"error: {e}"
        finally:
            await g.close()
    success = all(v == "ok" for v in results.values())
    return {"success": success, "databases": results}


async def cmd_add(args) -> dict:
    """Ingest one episode. group_id determines which graph it lands in."""
    from graphiti_core.nodes import EpisodeType

    source_map = {"text": EpisodeType.text, "message": EpisodeType.message,
                  "json": EpisodeType.json}
    source = source_map.get(getattr(args, "source", "text"), EpisodeType.text)
    name   = getattr(args, "name", None) or f"episode_{uuid4().hex[:8]}"
    source_description = getattr(args, "source_description", None) or "pi session"

    # group_id IS the database name — route to matching graph
    database = args.group
    if database not in ALL_DATABASES:
        return {"success": False,
                "error": f"Unknown group '{database}'. Valid: {ALL_DATABASES}"}

    # Entity types: use default set unless caller opts out with --no-entity-types
    entity_types = None
    if not getattr(args, "no_entity_types", False):
        entity_types = _build_entity_types()

    g = make_graphiti(database)
    try:
        add_kwargs: dict = dict(
            name=name,
            episode_body=args.text,
            source=source,
            source_description=source_description,
            reference_time=datetime.now(timezone.utc),
            group_id=args.group,
        )
        if entity_types is not None:
            add_kwargs["entity_types"] = entity_types

        episode = await g.add_episode(**add_kwargs)
        return {
            "success":      True,
            "episode_uuid": str(episode.uuid) if episode and hasattr(episode, "uuid") else None,
            "name":         name,
            "group_id":     args.group,
            "database":     database,
            "chars":        len(args.text),
            "entity_types": "default" if entity_types else "none",
        }
    except Exception as e:
        return {"success": False, "error": str(e)}
    finally:
        await g.close()


# ── search_facts (edges) ──────────────────────────────────────────────────────

async def _search_facts_one(database: str, query: str, num_results: int) -> dict:
    """Search edges (facts) in a single graph."""
    g = make_graphiti(database)
    try:
        results = await g.search(query=query, num_results=num_results)
        edges = results if isinstance(results, list) else getattr(results, "edges", [])
        facts = []
        for edge in edges:
            facts.append({
                "fact":       edge.fact,
                "database":   database,
                "valid_at":   edge.valid_at.isoformat()   if edge.valid_at   else None,
                "invalid_at": edge.invalid_at.isoformat() if edge.invalid_at else None,
                "uuid":       str(edge.uuid),
            })
        return {"database": database, "facts": facts, "error": None}
    except Exception as e:
        return {"database": database, "facts": [], "error": str(e)}
    finally:
        await g.close()


async def cmd_search(args) -> dict:
    """Fan-out search across all graphs (or a specified subset) in parallel."""
    databases = (
        [d.strip() for d in args.databases.split(",")]
        if getattr(args, "databases", None)
        else ALL_DATABASES
    )
    num_results = getattr(args, "num_results", 10) or 10

    db_results = await asyncio.gather(*[
        _search_facts_one(db, args.query, num_results)
        for db in databases
    ])

    all_facts = []
    errors    = []
    for r in db_results:
        all_facts.extend(r["facts"])
        if r["error"]:
            errors.append({"database": r["database"], "error": r["error"]})

    return {
        "success":            len(errors) < len(databases),
        "query":              args.query,
        "databases_searched": databases,
        "facts":              all_facts,
        "total":              len(all_facts),
        "errors":             errors,
    }


# ── search_nodes (entity summaries) ──────────────────────────────────────────

async def _search_nodes_one(database: str, query: str, num_results: int) -> dict:
    """Search entity node summaries in a single graph."""
    g = make_graphiti(database)
    try:
        # graphiti-core exposes get_nodes_by_query for node-level search.
        # Fall back to extracting nodes from a combined search result if the
        # dedicated method isn't available in older versions.
        nodes_raw = []
        if hasattr(g, "get_nodes_by_query"):
            nodes_raw = await g.get_nodes_by_query(query, limit=num_results)
        elif hasattr(g, "_search_node_distance"):
            nodes_raw = await g._search_node_distance(query=query, limit=num_results)
        else:
            # Fallback: run standard search and extract any node objects
            results = await g.search(query=query, num_results=num_results)
            nodes_raw = getattr(results, "nodes", [])

        nodes = []
        for node in nodes_raw:
            nodes.append({
                "name":        getattr(node, "name",    None),
                "summary":     getattr(node, "summary", None),
                "entity_type": getattr(node, "entity_type", getattr(node, "labels", None)),
                "database":    database,
                "uuid":        str(node.uuid) if hasattr(node, "uuid") else None,
                "created_at":  node.created_at.isoformat() if getattr(node, "created_at", None) else None,
            })
        return {"database": database, "nodes": nodes, "error": None}
    except Exception as e:
        return {"database": database, "nodes": [], "error": str(e)}
    finally:
        await g.close()


async def cmd_search_nodes(args) -> dict:
    """Fan-out node-summary search across all graphs (or a specified subset)."""
    databases = (
        [d.strip() for d in args.databases.split(",")]
        if getattr(args, "databases", None)
        else ALL_DATABASES
    )
    num_results = getattr(args, "num_results", 10) or 10

    db_results = await asyncio.gather(*[
        _search_nodes_one(db, args.query, num_results)
        for db in databases
    ])

    all_nodes = []
    errors    = []
    for r in db_results:
        all_nodes.extend(r["nodes"])
        if r["error"]:
            errors.append({"database": r["database"], "error": r["error"]})

    return {
        "success":            len(errors) < len(databases),
        "query":              args.query,
        "databases_searched": databases,
        "nodes":              all_nodes,
        "total":              len(all_nodes),
        "errors":             errors,
    }


# ── Episode management ────────────────────────────────────────────────────────

async def cmd_get_episodes(args) -> dict:
    """Get the most recent episodes for a specific group."""
    database = args.group
    if database not in ALL_DATABASES:
        return {"success": False,
                "error": f"Unknown group '{database}'. Valid: {ALL_DATABASES}"}

    limit = getattr(args, "limit", 10) or 10
    g = make_graphiti(database)
    try:
        episodes_raw = await g.get_episodes(group_ids=[database], last_n=limit)
        episodes = []
        for ep in episodes_raw:
            episodes.append({
                "uuid":        str(ep.uuid) if hasattr(ep, "uuid") else None,
                "name":        getattr(ep, "name",    None),
                "source":      str(getattr(ep, "source", None)),
                "source_description": getattr(ep, "source_description", None),
                "content":     (getattr(ep, "content", None) or "")[:200],  # truncate for display
                "created_at":  ep.created_at.isoformat() if getattr(ep, "created_at", None) else None,
                "group_id":    getattr(ep, "group_id", database),
            })
        return {
            "success":  True,
            "group":    database,
            "episodes": episodes,
            "total":    len(episodes),
        }
    except Exception as e:
        return {"success": False, "error": str(e)}
    finally:
        await g.close()


async def cmd_delete_episode(args) -> dict:
    """Delete an episode (and its extracted edges/nodes) by UUID."""
    database = args.group
    if database not in ALL_DATABASES:
        return {"success": False,
                "error": f"Unknown group '{database}'. Valid: {ALL_DATABASES}"}

    g = make_graphiti(database)
    try:
        await g.delete_episode(episode_uuid=args.uuid)
        return {"success": True, "deleted_uuid": args.uuid, "group": database}
    except Exception as e:
        return {"success": False, "error": str(e), "uuid": args.uuid}
    finally:
        await g.close()


# ── Entity edge management ────────────────────────────────────────────────────

async def cmd_get_entity_edge(args) -> dict:
    """Retrieve a single entity edge (fact) by UUID from a specific graph."""
    database = args.group
    if database not in ALL_DATABASES:
        return {"success": False,
                "error": f"Unknown group '{database}'. Valid: {ALL_DATABASES}"}

    g = make_graphiti(database)
    try:
        edge = await g.get_entity_edge(uuid=args.uuid)
        if edge is None:
            return {"success": False, "error": f"Edge {args.uuid} not found in {database}"}
        return {
            "success":    True,
            "uuid":       str(edge.uuid),
            "fact":       edge.fact,
            "database":   database,
            "source_node_uuid": str(getattr(edge, "source_node_uuid", "")) or None,
            "target_node_uuid": str(getattr(edge, "target_node_uuid", "")) or None,
            "valid_at":   edge.valid_at.isoformat()   if edge.valid_at   else None,
            "invalid_at": edge.invalid_at.isoformat() if edge.invalid_at else None,
            "created_at": edge.created_at.isoformat() if getattr(edge, "created_at", None) else None,
            "episodes":   [str(e) for e in getattr(edge, "episodes", [])],
        }
    except Exception as e:
        return {"success": False, "error": str(e), "uuid": args.uuid}
    finally:
        await g.close()


async def cmd_delete_entity_edge(args) -> dict:
    """Delete a specific entity edge (fact) by UUID."""
    database = args.group
    if database not in ALL_DATABASES:
        return {"success": False,
                "error": f"Unknown group '{database}'. Valid: {ALL_DATABASES}"}

    g = make_graphiti(database)
    try:
        await g.delete_entity_edge(uuid=args.uuid)
        return {"success": True, "deleted_uuid": args.uuid, "group": database}
    except Exception as e:
        return {"success": False, "error": str(e), "uuid": args.uuid}
    finally:
        await g.close()


# ── Graph maintenance ─────────────────────────────────────────────────────────

async def cmd_clear_graph(args) -> dict:
    """Wipe all data from a graph and rebuild its indices."""
    databases = (
        [d.strip() for d in args.databases.split(",")]
        if getattr(args, "databases", None)
        else ALL_DATABASES
    )
    results = {}
    for db in databases:
        g = make_graphiti(db)
        try:
            # clear_data removes all nodes/edges; build_indices_and_constraints restores schema
            if hasattr(g, "clear_data"):
                await g.clear_data()
            else:
                # Fallback: delete graph via driver if clear_data not available
                try:
                    await g.driver.delete_graph(db)  # type: ignore[attr-defined]
                except Exception:
                    pass
            await g.build_indices_and_constraints()
            results[db] = "cleared"
        except Exception as e:
            results[db] = f"error: {e}"
        finally:
            await g.close()
    success = all(v == "cleared" for v in results.values())
    return {"success": success, "databases": results}


# ── Bulk migration ────────────────────────────────────────────────────────────

async def cmd_migrate(args) -> dict:
    """Bulk ingest Holocron markdown files. Each file routes to its graph."""
    from graphiti_core.nodes import EpisodeType

    memory_dir = Path(args.dir)
    if not memory_dir.exists():
        return {"success": False, "error": f"Directory not found: {memory_dir}"}

    md_files = sorted(memory_dir.glob("*.md"))
    if not md_files:
        return {"success": False, "error": f"No .md files found in {memory_dir}"}

    entity_types = _build_entity_types()
    semaphore    = asyncio.Semaphore(SEMAPHORE_LIMIT)
    ingested_count = 0
    skipped_count  = 0
    errors: list[dict] = []
    lock = asyncio.Lock()

    async def ingest_one(md_file: Path):
        nonlocal ingested_count, skipped_count

        content = md_file.read_text(encoding="utf-8")
        if len(content.strip()) < 50:
            async with lock:
                skipped_count += 1
            print(f"  SKIP {md_file.name} (< 50 chars)", file=sys.stderr)
            return

        stem     = md_file.stem.lower()
        group    = next((v for k, v in GROUP_MAP.items() if k in stem), "holocron_user")
        database = group

        print(f"  → {md_file.name} [{database}]", file=sys.stderr, flush=True)

        async with semaphore:
            g = make_graphiti(database)
            try:
                add_kwargs: dict = dict(
                    name=f"holocron_{md_file.stem}",
                    episode_body=content,
                    source=EpisodeType.text,
                    source_description=f"Holocron memory file: {md_file.name}",
                    reference_time=datetime.fromtimestamp(
                        md_file.stat().st_mtime, tz=timezone.utc
                    ),
                    group_id=group,
                )
                if entity_types is not None:
                    add_kwargs["entity_types"] = entity_types

                await g.add_episode(**add_kwargs)
                async with lock:
                    ingested_count += 1
                print(f"    ✓ {md_file.name}", file=sys.stderr, flush=True)
            except Exception as e:
                async with lock:
                    errors.append({"file": md_file.name, "error": str(e)})
                print(f"    ✗ {md_file.name}: {e}", file=sys.stderr, flush=True)
            finally:
                await g.close()

    await asyncio.gather(*[ingest_one(f) for f in md_files])

    return {
        "success":  len(errors) == 0,
        "ingested": ingested_count,
        "skipped":  skipped_count,
        "total":    len(md_files),
        "errors":   errors,
    }


# ── CLI ───────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Graphiti CLI — FalkorDB temporal knowledge graph"
    )
    sub = parser.add_subparsers(dest="command", required=True)

    # status
    sub.add_parser("status")

    # build-indices
    p_idx = sub.add_parser("build-indices")
    p_idx.add_argument("--databases", default=None,
                       help=f"Comma-separated subset to index (default: all — {ALL_DATABASES})")

    # add
    p_add = sub.add_parser("add")
    p_add.add_argument("--text",               required=True)
    p_add.add_argument("--group",              required=True,
                       help=f"Target graph/group. One of: {ALL_DATABASES}")
    p_add.add_argument("--name",               default=None)
    p_add.add_argument("--source",             default="text",
                       choices=["text", "message", "json"])
    p_add.add_argument("--source-description", default=None)
    p_add.add_argument("--no-entity-types",    action="store_true",
                       help="Skip passing entity type hints to the LLM (faster, lower extraction quality)")

    # search (facts / edges)
    p_search = sub.add_parser("search")
    p_search.add_argument("--query",       required=True)
    p_search.add_argument("--databases",   default=None,
                          help=f"Comma-separated graphs to search (default: all — {ALL_DATABASES})")
    p_search.add_argument("--num-results", type=int, default=10)

    # search-nodes (entity node summaries)
    p_sn = sub.add_parser("search-nodes")
    p_sn.add_argument("--query",       required=True)
    p_sn.add_argument("--databases",   default=None,
                      help=f"Comma-separated graphs to search (default: all — {ALL_DATABASES})")
    p_sn.add_argument("--num-results", type=int, default=10)

    # get-episodes
    p_gep = sub.add_parser("get-episodes")
    p_gep.add_argument("--group",  required=True,
                       help=f"Graph to query. One of: {ALL_DATABASES}")
    p_gep.add_argument("--limit",  type=int, default=10,
                       help="Max episodes to return (default 10)")

    # delete-episode
    p_dep = sub.add_parser("delete-episode")
    p_dep.add_argument("--uuid",   required=True)
    p_dep.add_argument("--group",  required=True,
                       help=f"Graph containing the episode. One of: {ALL_DATABASES}")

    # get-entity-edge
    p_gee = sub.add_parser("get-entity-edge")
    p_gee.add_argument("--uuid",  required=True)
    p_gee.add_argument("--group", required=True,
                       help=f"Graph containing the edge. One of: {ALL_DATABASES}")

    # delete-entity-edge
    p_dee = sub.add_parser("delete-entity-edge")
    p_dee.add_argument("--uuid",  required=True)
    p_dee.add_argument("--group", required=True,
                       help=f"Graph containing the edge. One of: {ALL_DATABASES}")

    # clear-graph
    p_clr = sub.add_parser("clear-graph")
    p_clr.add_argument("--databases", default=None,
                       help=f"Comma-separated graphs to clear (default: ALL — {ALL_DATABASES})")

    # migrate
    p_migrate = sub.add_parser("migrate")
    p_migrate.add_argument("--dir", required=True)

    args = parser.parse_args()

    handlers = {
        "status":             cmd_status,
        "build-indices":      cmd_build_indices,
        "add":                cmd_add,
        "search":             cmd_search,
        "search-nodes":       cmd_search_nodes,
        "get-episodes":       cmd_get_episodes,
        "delete-episode":     cmd_delete_episode,
        "get-entity-edge":    cmd_get_entity_edge,
        "delete-entity-edge": cmd_delete_entity_edge,
        "clear-graph":        cmd_clear_graph,
        "migrate":            cmd_migrate,
    }

    result = asyncio.run(handlers[args.command](args))
    print(json.dumps(result, default=str))


if __name__ == "__main__":
    main()
