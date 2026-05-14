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
  holocron_user    — personal preferences, Jack-specific facts, career
  holocron_lahzo   — Lahzo work context, team, repos, architecture
  holocron_system  — Holocron tooling, config, voice, backup

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

# Canonical graph names (underscore required — FalkorDB RediSearch treats
# hyphens as negation operators in field-filter values).
ALL_DATABASES = ["holocron_user", "holocron_lahzo", "holocron_system"]

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
}


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

    g = make_graphiti(database)
    try:
        episode = await g.add_episode(
            name=name,
            episode_body=args.text,
            source=source,
            source_description=source_description,
            reference_time=datetime.now(timezone.utc),
            group_id=args.group,
        )
        return {
            "success":      True,
            "episode_uuid": str(episode.uuid) if episode and hasattr(episode, "uuid") else None,
            "name":         name,
            "group_id":     args.group,
            "database":     database,
            "chars":        len(args.text),
        }
    except Exception as e:
        return {"success": False, "error": str(e)}
    finally:
        await g.close()


async def _search_one(database: str, query: str, num_results: int) -> dict:
    """Search a single graph; returns dict with facts list or error."""
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

    # Run all graph searches concurrently
    db_results = await asyncio.gather(*[
        _search_one(db, args.query, num_results)
        for db in databases
    ])

    all_facts = []
    errors    = []
    for r in db_results:
        all_facts.extend(r["facts"])
        if r["error"]:
            errors.append({"database": r["database"], "error": r["error"]})

    return {
        "success":           len(errors) < len(databases),  # partial ok
        "query":             args.query,
        "databases_searched": databases,
        "facts":             all_facts,
        "total":             len(all_facts),
        "errors":            errors,
    }


async def cmd_migrate(args) -> dict:
    """Bulk ingest Holocron markdown files. Each file routes to its graph."""
    from graphiti_core.nodes import EpisodeType

    memory_dir = Path(args.dir)
    if not memory_dir.exists():
        return {"success": False, "error": f"Directory not found: {memory_dir}"}

    md_files = sorted(memory_dir.glob("*.md"))
    if not md_files:
        return {"success": False, "error": f"No .md files found in {memory_dir}"}

    ingested, skipped = 0, 0
    errors = []

    for md_file in md_files:
        content = md_file.read_text(encoding="utf-8")
        if len(content.strip()) < 50:
            skipped += 1
            print(f"  SKIP {md_file.name} (< 50 chars)", file=sys.stderr)
            continue

        stem     = md_file.stem.lower()
        group    = next((v for k, v in GROUP_MAP.items() if k in stem), "holocron_user")
        database = group   # group IS the database

        print(f"  → {md_file.name} [{database}]", file=sys.stderr, flush=True)
        g = make_graphiti(database)
        try:
            await g.add_episode(
                name=f"holocron_{md_file.stem}",
                episode_body=content,
                source=EpisodeType.text,
                source_description=f"Holocron memory file: {md_file.name}",
                reference_time=datetime.fromtimestamp(md_file.stat().st_mtime, tz=timezone.utc),
                group_id=group,
            )
            ingested += 1
            print(f"    ✓", file=sys.stderr, flush=True)
        except Exception as e:
            errors.append({"file": md_file.name, "error": str(e)})
            print(f"    ✗ {e}", file=sys.stderr, flush=True)
        finally:
            await g.close()

    return {
        "success":  len(errors) == 0,
        "ingested": ingested,
        "skipped":  skipped,
        "total":    len(md_files),
        "errors":   errors,
    }


# ── CLI ───────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Graphiti CLI — FalkorDB temporal knowledge graph"
    )
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("status")

    p_idx = sub.add_parser("build-indices")
    p_idx.add_argument("--databases", default=None,
                       help=f"Comma-separated subset to index (default: all — {ALL_DATABASES})")

    p_add = sub.add_parser("add")
    p_add.add_argument("--text",               required=True)
    p_add.add_argument("--group",              required=True,
                       help=f"Target graph/group. One of: {ALL_DATABASES}")
    p_add.add_argument("--name",               default=None)
    p_add.add_argument("--source",             default="text",
                       choices=["text", "message", "json"])
    p_add.add_argument("--source-description", default=None)

    p_search = sub.add_parser("search")
    p_search.add_argument("--query",       required=True)
    p_search.add_argument("--databases",   default=None,
                          help=f"Comma-separated graphs to search (default: all — {ALL_DATABASES})")
    p_search.add_argument("--num-results", type=int, default=10,
                          help="Results per graph (default 10; total may be up to 10 × number of graphs)")

    p_migrate = sub.add_parser("migrate")
    p_migrate.add_argument("--dir", required=True)

    args = parser.parse_args()

    handlers = {
        "status":        cmd_status,
        "build-indices": cmd_build_indices,
        "add":           cmd_add,
        "search":        cmd_search,
        "migrate":       cmd_migrate,
    }

    result = asyncio.run(handlers[args.command](args))
    print(json.dumps(result, default=str))


if __name__ == "__main__":
    main()
