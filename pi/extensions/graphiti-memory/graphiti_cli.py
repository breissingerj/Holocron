#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "graphiti-core[falkordb]",
#   "openai",
# ]
# ///
"""
graphiti_cli.py — CLI wrapper for graphiti-core with FalkorDB backend.

Called by the graphiti-memory pi extension via `uv run --script`.
All commands output JSON to stdout. Progress/logs go to stderr.

Single graph: all data lives in one FalkorDB database named by DEFAULT_GROUP_ID.
group_id is a tenancy/namespace concept — "jbreissinger" is the owner of this
instance. Additional users can be onboarded by passing --group <their_id>.

Environment variables:
  FALKORDB_HOST          (default: graphiti.breissinger.dev)
  FALKORDB_PORT          (default: 6379)
  FALKORDB_PASSWORD      (default: none)
  OPENAI_API_KEY         (required — LLM entity extraction + embeddings)
  GRAPHITI_GROUP_ID      (default: jbreissinger)
  GRAPHITI_LLM_MODEL     (default: gpt-4.1-mini)
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
DEFAULT_GROUP_ID  = os.environ.get("GRAPHITI_GROUP_ID", "jbreissinger")
LLM_MODEL         = os.environ.get("GRAPHITI_LLM_MODEL",  "gpt-4.1-mini")
EMBED_MODEL       = os.environ.get("GRAPHITI_EMBED_MODEL", "text-embedding-3-small")
SEMAPHORE_LIMIT   = int(os.environ.get("GRAPHITI_SEMAPHORE", "3"))

# ── Entity types ──────────────────────────────────────────────────────────────

_ENTITY_TYPE_DEFS = [
    ("Preference",   "User preferences, choices, opinions, or selections"),
    ("Requirement",  "Specific needs, features, or functionality that must be fulfilled"),
    ("Procedure",    "Standard operating procedures and sequential instructions"),
    ("Location",     "Physical or virtual places where activities occur"),
    ("Event",        "Time-bound activities, occurrences, or experiences"),
    ("Organization", "Companies, institutions, groups, or formal entities"),
    ("Document",     "Information content in various forms (books, articles, reports, videos, etc.)"),
    ("Topic",        "Subject of conversation, interest, or knowledge domain (fallback)"),
    ("Object",       "Physical items, tools, devices, or possessions (fallback)"),
]


def _build_entity_types():
    """Return graphiti-core EntityType objects, or None if not available."""
    try:
        from graphiti_core.nodes import EntityType  # type: ignore
        return [EntityType(name=n, description=d) for n, d in _ENTITY_TYPE_DEFS]
    except Exception:
        return None


# ── Client factory ────────────────────────────────────────────────────────────

def make_graphiti(group_id: str = DEFAULT_GROUP_ID):
    """Create a Graphiti instance connected to the given group's FalkorDB graph."""
    from graphiti_core import Graphiti
    from graphiti_core.driver.falkordb_driver import FalkorDriver
    from graphiti_core.llm_client.openai_client import OpenAIClient
    from graphiti_core.llm_client.config import LLMConfig
    from graphiti_core.embedder.openai import OpenAIEmbedder, OpenAIEmbedderConfig

    driver   = FalkorDriver(host=FALKORDB_HOST, port=FALKORDB_PORT,
                            password=FALKORDB_PASSWORD, database=group_id)
    llm      = OpenAIClient(config=LLMConfig(model=LLM_MODEL))
    embedder = OpenAIEmbedder(config=OpenAIEmbedderConfig(embedding_model=EMBED_MODEL))
    return Graphiti(graph_driver=driver, llm_client=llm, embedder=embedder)


def _group(args) -> str:
    """Resolve group_id from args, falling back to DEFAULT_GROUP_ID."""
    return getattr(args, "group", None) or DEFAULT_GROUP_ID


# ── Commands ──────────────────────────────────────────────────────────────────

async def cmd_status(_args) -> dict:
    """Ping FalkorDB and list all graphs."""
    try:
        from falkordb.asyncio import FalkorDB as FalkorDBClient  # type: ignore
        client = FalkorDBClient(host=FALKORDB_HOST, port=FALKORDB_PORT,
                                password=FALKORDB_PASSWORD)
        graphs = await client.list_graphs()
        return {
            "connected":       True,
            "host":            FALKORDB_HOST,
            "port":            FALKORDB_PORT,
            "default_group":   DEFAULT_GROUP_ID,
            "graphs":          sorted(graphs) if graphs else [],
        }
    except Exception as e:
        return {"connected": False, "host": FALKORDB_HOST, "port": FALKORDB_PORT,
                "error": str(e)}


async def cmd_build_indices(args) -> dict:
    """Build vector/full-text indices (idempotent)."""
    group_id = _group(args)
    g = make_graphiti(group_id)
    try:
        await g.build_indices_and_constraints()
        return {"success": True, "group": group_id}
    except Exception as e:
        return {"success": False, "group": group_id, "error": str(e)}
    finally:
        await g.close()


async def cmd_add(args) -> dict:
    """Ingest one episode into the graph."""
    from graphiti_core.nodes import EpisodeType

    group_id = _group(args)
    source_map = {"text": EpisodeType.text, "message": EpisodeType.message,
                  "json": EpisodeType.json}
    source             = source_map.get(getattr(args, "source", "text"), EpisodeType.text)
    name               = getattr(args, "name", None) or f"episode_{uuid4().hex[:8]}"
    source_description = getattr(args, "source_description", None) or "pi session"
    entity_types       = None if getattr(args, "no_entity_types", False) else _build_entity_types()

    g = make_graphiti(group_id)
    try:
        add_kwargs: dict = dict(
            name=name,
            episode_body=args.text,
            source=source,
            source_description=source_description,
            reference_time=datetime.now(timezone.utc),
            group_id=group_id,
        )
        if entity_types is not None:
            add_kwargs["entity_types"] = entity_types

        episode = await g.add_episode(**add_kwargs)
        return {
            "success":      True,
            "episode_uuid": str(episode.uuid) if episode and hasattr(episode, "uuid") else None,
            "name":         name,
            "group_id":     group_id,
            "chars":        len(args.text),
            "entity_types": "default" if entity_types else "none",
        }
    except Exception as e:
        return {"success": False, "error": str(e)}
    finally:
        await g.close()


async def cmd_search(args) -> dict:
    """Search facts (edges) in the graph."""
    group_id    = _group(args)
    num_results = getattr(args, "num_results", 10) or 10

    g = make_graphiti(group_id)
    try:
        results = await g.search(query=args.query, num_results=num_results,
                                 group_ids=[group_id])
        edges   = results if isinstance(results, list) else getattr(results, "edges", [])
        facts   = [
            {
                "fact":       edge.fact,
                "valid_at":   edge.valid_at.isoformat()   if edge.valid_at   else None,
                "invalid_at": edge.invalid_at.isoformat() if edge.invalid_at else None,
                "uuid":       str(edge.uuid),
            }
            for edge in edges
        ]
        return {"success": True, "query": args.query, "group": group_id,
                "facts": facts, "total": len(facts)}
    except Exception as e:
        return {"success": False, "error": str(e), "facts": [], "total": 0}
    finally:
        await g.close()


async def cmd_search_nodes(args) -> dict:
    """Search entity node summaries in the graph."""
    group_id    = _group(args)
    num_results = getattr(args, "num_results", 10) or 10

    g = make_graphiti(group_id)
    try:
        nodes_raw = []
        if hasattr(g, "get_nodes_by_query"):
            nodes_raw = await g.get_nodes_by_query(args.query, limit=num_results)
        elif hasattr(g, "_search_node_distance"):
            nodes_raw = await g._search_node_distance(query=args.query, limit=num_results)
        else:
            results   = await g.search(query=args.query, num_results=num_results,
                                        group_ids=[group_id])
            nodes_raw = getattr(results, "nodes", [])

        nodes = [
            {
                "name":        getattr(n, "name",    None),
                "summary":     getattr(n, "summary", None),
                "entity_type": getattr(n, "entity_type", getattr(n, "labels", None)),
                "uuid":        str(n.uuid) if hasattr(n, "uuid") else None,
                "created_at":  n.created_at.isoformat() if getattr(n, "created_at", None) else None,
            }
            for n in nodes_raw
        ]
        return {"success": True, "query": args.query, "group": group_id,
                "nodes": nodes, "total": len(nodes)}
    except Exception as e:
        return {"success": False, "error": str(e), "nodes": [], "total": 0}
    finally:
        await g.close()


async def cmd_get_episodes(args) -> dict:
    """List the most recent episodes."""
    from datetime import timezone
    group_id  = _group(args)
    limit     = getattr(args, "limit", 10) or 10
    full      = getattr(args, "full", False)

    g = make_graphiti(group_id)
    try:
        # retrieve_episodes requires a reference_time; use far-future to get latest N
        ref_time = datetime.now(timezone.utc).replace(year=2099)
        episodes_raw = await g.retrieve_episodes(
            reference_time=ref_time,
            last_n=limit,
            group_ids=[group_id],
        )
        episodes = []
        for ep in episodes_raw:
            content = getattr(ep, "content", None) or ""
            episodes.append({
                "uuid":               str(ep.uuid) if hasattr(ep, "uuid") else None,
                "name":               getattr(ep, "name", None),
                "source":             str(getattr(ep, "source", None)),
                "source_description": getattr(ep, "source_description", None),
                "content":            content if full else content[:200],
                "truncated":          not full and len(content) > 200,
                "created_at":         ep.created_at.isoformat() if getattr(ep, "created_at", None) else None,
            })
        return {"success": True, "group": group_id, "episodes": episodes,
                "total": len(episodes)}
    except Exception as e:
        return {"success": False, "error": str(e)}
    finally:
        await g.close()


async def cmd_delete_episode(args) -> dict:
    """Delete an episode by UUID."""
    group_id = _group(args)
    g = make_graphiti(group_id)
    try:
        await g.delete_episode(episode_uuid=args.uuid)
        return {"success": True, "deleted_uuid": args.uuid, "group": group_id}
    except Exception as e:
        return {"success": False, "error": str(e), "uuid": args.uuid}
    finally:
        await g.close()


async def cmd_get_entity_edge(args) -> dict:
    """Retrieve a specific entity edge by UUID."""
    group_id = _group(args)
    g = make_graphiti(group_id)
    try:
        edge = await g.get_entity_edge(uuid=args.uuid)
        if edge is None:
            return {"success": False, "error": f"Edge {args.uuid} not found"}
        return {
            "success":          True,
            "uuid":             str(edge.uuid),
            "fact":             edge.fact,
            "group":            group_id,
            "source_node_uuid": str(getattr(edge, "source_node_uuid", "")) or None,
            "target_node_uuid": str(getattr(edge, "target_node_uuid", "")) or None,
            "valid_at":         edge.valid_at.isoformat()   if edge.valid_at   else None,
            "invalid_at":       edge.invalid_at.isoformat() if edge.invalid_at else None,
            "created_at":       edge.created_at.isoformat() if getattr(edge, "created_at", None) else None,
            "episodes":         [str(e) for e in getattr(edge, "episodes", [])],
        }
    except Exception as e:
        return {"success": False, "error": str(e), "uuid": args.uuid}
    finally:
        await g.close()


async def cmd_delete_entity_edge(args) -> dict:
    """Delete a specific entity edge by UUID."""
    group_id = _group(args)
    g = make_graphiti(group_id)
    try:
        await g.delete_entity_edge(uuid=args.uuid)
        return {"success": True, "deleted_uuid": args.uuid, "group": group_id}
    except Exception as e:
        return {"success": False, "error": str(e), "uuid": args.uuid}
    finally:
        await g.close()


async def cmd_clear_graph(args) -> dict:
    """Wipe all data from the graph and rebuild indices."""
    group_id = _group(args)
    g = make_graphiti(group_id)
    try:
        if hasattr(g, "clear_data"):
            await g.clear_data()
        else:
            try:
                await g.driver.delete_graph(group_id)  # type: ignore[attr-defined]
            except Exception:
                pass
        await g.build_indices_and_constraints()
        return {"success": True, "group": group_id, "status": "cleared"}
    except Exception as e:
        return {"success": False, "group": group_id, "error": str(e)}
    finally:
        await g.close()


async def cmd_migrate(args) -> dict:
    """Bulk ingest Holocron markdown files into the graph."""
    from graphiti_core.nodes import EpisodeType

    group_id   = _group(args)
    memory_dir = Path(args.dir)
    if not memory_dir.exists():
        return {"success": False, "error": f"Directory not found: {memory_dir}"}

    md_files = sorted(memory_dir.glob("*.md"))
    if not md_files:
        return {"success": False, "error": f"No .md files found in {memory_dir}"}

    entity_types   = _build_entity_types()
    semaphore      = asyncio.Semaphore(SEMAPHORE_LIMIT)
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

        print(f"  → {md_file.name}", file=sys.stderr, flush=True)

        async with semaphore:
            g = make_graphiti(group_id)
            try:
                add_kwargs: dict = dict(
                    name=f"holocron_{md_file.stem}",
                    episode_body=content,
                    source=EpisodeType.text,
                    source_description=f"Holocron memory file: {md_file.name}",
                    reference_time=datetime.fromtimestamp(
                        md_file.stat().st_mtime, tz=timezone.utc
                    ),
                    group_id=group_id,
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
        "group":    group_id,
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

    def add_group_arg(p, help_suffix=""):
        p.add_argument("--group", default=None,
                       help=f"group_id / graph namespace (default: {DEFAULT_GROUP_ID}){help_suffix}")

    # status
    sub.add_parser("status")

    # build-indices
    p_idx = sub.add_parser("build-indices")
    add_group_arg(p_idx)

    # add
    p_add = sub.add_parser("add")
    p_add.add_argument("--text",               required=True)
    p_add.add_argument("--name",               default=None)
    p_add.add_argument("--source",             default="text",
                       choices=["text", "message", "json"])
    p_add.add_argument("--source-description", default=None)
    p_add.add_argument("--no-entity-types",    action="store_true")
    add_group_arg(p_add)

    # search
    p_search = sub.add_parser("search")
    p_search.add_argument("--query",       required=True)
    p_search.add_argument("--num-results", type=int, default=10)
    add_group_arg(p_search)

    # search-nodes
    p_sn = sub.add_parser("search-nodes")
    p_sn.add_argument("--query",       required=True)
    p_sn.add_argument("--num-results", type=int, default=10)
    add_group_arg(p_sn)

    # get-episodes
    p_gep = sub.add_parser("get-episodes")
    p_gep.add_argument("--limit", type=int, default=10)
    p_gep.add_argument("--full",  action="store_true",
                       help="Return full episode content instead of truncating at 200 chars")
    add_group_arg(p_gep)

    # delete-episode
    p_dep = sub.add_parser("delete-episode")
    p_dep.add_argument("--uuid", required=True)
    add_group_arg(p_dep)

    # get-entity-edge
    p_gee = sub.add_parser("get-entity-edge")
    p_gee.add_argument("--uuid", required=True)
    add_group_arg(p_gee)

    # delete-entity-edge
    p_dee = sub.add_parser("delete-entity-edge")
    p_dee.add_argument("--uuid", required=True)
    add_group_arg(p_dee)

    # clear-graph
    p_clr = sub.add_parser("clear-graph")
    add_group_arg(p_clr, " — defaults to entire personal graph, use with caution")

    # migrate
    p_migrate = sub.add_parser("migrate")
    p_migrate.add_argument("--dir", required=True)
    add_group_arg(p_migrate)

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
