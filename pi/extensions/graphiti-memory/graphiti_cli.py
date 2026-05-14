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

Environment variables:
  FALKORDB_HOST          (default: graphiti.breissinger.dev)
  FALKORDB_PORT          (default: 6379)
  FALKORDB_PASSWORD      (default: none)
  FALKORDB_DATABASE      (default: holocron)
  ANTHROPIC_API_KEY      (required for add/migrate)
  OPENAI_API_KEY         (required for add/search/migrate — embeddings)
  GRAPHITI_LLM_MODEL     (default: claude-3-5-haiku-20241022)
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

# ── Config from env ───────────────────────────────────────────────────────────

FALKORDB_HOST     = os.environ.get("FALKORDB_HOST",     "graphiti.breissinger.dev")
FALKORDB_PORT     = int(os.environ.get("FALKORDB_PORT", "6379"))
FALKORDB_PASSWORD = os.environ.get("FALKORDB_PASSWORD") or None
FALKORDB_DATABASE = os.environ.get("FALKORDB_DATABASE", "holocron")
LLM_MODEL         = os.environ.get("GRAPHITI_LLM_MODEL",   "claude-3-5-haiku-20241022")
EMBED_MODEL       = os.environ.get("GRAPHITI_EMBED_MODEL",  "text-embedding-3-small")

# Group ID → filename keyword map for migration
GROUP_MAP = {
    "lahzo":       "holocron-lahzo",
    "promeniq":    "holocron-lahzo",
    "multiverse":  "holocron-lahzo",
    "wilkins":     "holocron-lahzo",
    "analytics":   "holocron-lahzo",
    "monorepo":    "holocron-lahzo",
    "prompting":   "holocron-lahzo",
    "holocron":    "holocron-system",
    "pai":         "holocron-system",
    "opencode":    "holocron-system",
    "notifications": "holocron-system",
    "user-career": "holocron-user",
    "reviews":     "holocron-user",
}


# ── Client factory ────────────────────────────────────────────────────────────

def make_graphiti():
    from graphiti_core import Graphiti
    from graphiti_core.driver.falkordb_driver import FalkorDriver
    from graphiti_core.llm_client.anthropic_client import AnthropicClient
    from graphiti_core.llm_client.config import LLMConfig
    from graphiti_core.embedder.openai import OpenAIEmbedder, OpenAIEmbedderConfig

    driver = FalkorDriver(
        host=FALKORDB_HOST,
        port=FALKORDB_PORT,
        password=FALKORDB_PASSWORD,
        database=FALKORDB_DATABASE,
    )
    llm = AnthropicClient(config=LLMConfig(model=LLM_MODEL))
    embedder = OpenAIEmbedder(config=OpenAIEmbedderConfig(embedding_model=EMBED_MODEL))
    return Graphiti(graph_driver=driver, llm_client=llm, embedder=embedder)


# ── Commands ──────────────────────────────────────────────────────────────────

async def cmd_status(_args) -> dict:
    """Ping FalkorDB directly — no LLM calls needed."""
    try:
        from falkordb.asyncio import FalkorDB as FalkorDBClient  # type: ignore
        client = FalkorDBClient(
            host=FALKORDB_HOST,
            port=FALKORDB_PORT,
            password=FALKORDB_PASSWORD,
        )
        # List graphs as a lightweight connection test
        graphs = await client.list_graphs()
        return {
            "connected": True,
            "host": FALKORDB_HOST,
            "port": FALKORDB_PORT,
            "database": FALKORDB_DATABASE,
            "graphs": list(graphs) if graphs else [],
        }
    except Exception as e:
        return {
            "connected": False,
            "host": FALKORDB_HOST,
            "port": FALKORDB_PORT,
            "error": str(e),
        }


async def cmd_build_indices(_args) -> dict:
    """One-time setup: build vector/full-text indices and uniqueness constraints."""
    g = make_graphiti()
    try:
        await g.build_indices_and_constraints()
        return {"success": True, "message": "Indices and constraints built on database '%s'" % FALKORDB_DATABASE}
    except Exception as e:
        return {"success": False, "error": str(e)}
    finally:
        await g.close()


async def cmd_add(args) -> dict:
    """Ingest one episode into the knowledge graph."""
    from graphiti_core.nodes import EpisodeType

    source_map = {"text": EpisodeType.text, "message": EpisodeType.message, "json": EpisodeType.json}
    source = source_map.get(getattr(args, "source", "text"), EpisodeType.text)
    name = getattr(args, "name", None) or f"episode_{uuid4().hex[:8]}"
    source_description = getattr(args, "source_description", None) or "pi session"

    g = make_graphiti()
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
            "success": True,
            "episode_uuid": str(episode.uuid) if episode and hasattr(episode, "uuid") else None,
            "name": name,
            "group_id": args.group,
            "chars": len(args.text),
        }
    except Exception as e:
        return {"success": False, "error": str(e)}
    finally:
        await g.close()


async def cmd_search(args) -> dict:
    """Hybrid BM25 + vector search over facts and entity nodes."""
    g = make_graphiti()
    try:
        group_ids = [g.strip() for g in args.groups.split(",")] if getattr(args, "groups", None) else None
        num_results = getattr(args, "num_results", 10) or 10

        results = await g.search(
            query=args.query,
            group_ids=group_ids,
            num_results=num_results,
        )

        facts = []
        for edge in (results.edges or []):
            facts.append({
                "fact": edge.fact,
                "valid_at":   edge.valid_at.isoformat()   if edge.valid_at   else None,
                "invalid_at": edge.invalid_at.isoformat() if edge.invalid_at else None,
                "uuid": str(edge.uuid),
            })

        nodes = []
        for node in (results.nodes or []):
            nodes.append({
                "name":    node.name,
                "summary": getattr(node, "summary", None),
                "uuid":    str(node.uuid),
            })

        return {
            "success":     True,
            "query":       args.query,
            "facts":       facts,
            "nodes":       nodes,
            "total":       len(facts) + len(nodes),
        }
    except Exception as e:
        return {"success": False, "error": str(e)}
    finally:
        await g.close()


async def cmd_migrate(args) -> dict:
    """Bulk ingest Holocron markdown memory files into the knowledge graph."""
    from graphiti_core.nodes import EpisodeType

    memory_dir = Path(args.dir)
    if not memory_dir.exists():
        return {"success": False, "error": f"Directory not found: {memory_dir}"}

    md_files = sorted(memory_dir.glob("*.md"))
    if not md_files:
        return {"success": False, "error": f"No .md files found in {memory_dir}"}

    g = make_graphiti()
    ingested, skipped = 0, 0
    errors = []

    try:
        for md_file in md_files:
            content = md_file.read_text(encoding="utf-8")
            if len(content.strip()) < 50:
                skipped += 1
                print(f"  SKIP {md_file.name} (< 50 chars)", file=sys.stderr)
                continue

            stem = md_file.stem.lower()
            group = next((v for k, v in GROUP_MAP.items() if k in stem), "holocron-user")
            episode_name = f"holocron_{md_file.stem}"

            print(f"  → {md_file.name} [{group}]", file=sys.stderr, flush=True)
            try:
                await g.add_episode(
                    name=episode_name,
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


# ── CLI entrypoint ────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Graphiti CLI — FalkorDB temporal knowledge graph"
    )
    sub = parser.add_subparsers(dest="command", required=True)

    # status
    sub.add_parser("status", help="Ping FalkorDB and report connection info")

    # build-indices
    sub.add_parser("build-indices", help="Build vector/full-text indices (run once per new instance)")

    # add
    p_add = sub.add_parser("add", help="Ingest an episode into the knowledge graph")
    p_add.add_argument("--text",               required=True,  help="Episode content to ingest")
    p_add.add_argument("--group",              required=True,  help="group_id namespace (e.g. holocron-user, holocron-lahzo)")
    p_add.add_argument("--name",               default=None,   help="Human-readable episode label (auto-generated if omitted)")
    p_add.add_argument("--source",             default="text", choices=["text", "message", "json"])
    p_add.add_argument("--source-description", default=None,   help="Provenance description for LLM context")

    # search
    p_search = sub.add_parser("search", help="Hybrid search over facts and entity nodes")
    p_search.add_argument("--query",       required=True,       help="Natural language query")
    p_search.add_argument("--groups",      default=None,        help="Comma-separated group IDs to scope search")
    p_search.add_argument("--num-results", type=int, default=10)

    # migrate
    p_migrate = sub.add_parser("migrate", help="Bulk ingest markdown files from a directory")
    p_migrate.add_argument("--dir", required=True, help="Path to directory containing .md files")

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
