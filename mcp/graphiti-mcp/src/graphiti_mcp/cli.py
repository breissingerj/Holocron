"""Admin CLI for graphiti-mcp.

Expensive operations (refresh, drain, prune) live here rather than as MCP
tools so agents can't trigger re-ingestion autonomously — the read path only
ever queues.

Usage:
  graphiti-mcp serve                       run the MCP server (stdio)
  graphiti-mcp status                      connectivity + registry summary
  graphiti-mcp register <uri> [--ttl S] [--group G]
  graphiti-mcp get <id-or-uri>             read-through get (may queue refresh)
  graphiti-mcp list                        list docrefs with freshness
  graphiti-mcp remove <id-or-uri>          purge docref + derived episodes
  graphiti-mcp refresh (<id> | --all)      force re-fetch/ingest now
  graphiti-mcp drain                       work the pending refresh queue
  graphiti-mcp prune [--keep N]            drop episodes beyond last N versions
"""

import argparse
import asyncio
import json
import sys

from . import config, engine
from .registry import Registry


def _print(obj) -> None:
    print(json.dumps(obj, indent=2, default=str))


async def _status() -> dict:
    out: dict = {"host": config.FALKORDB_HOST, "port": config.FALKORDB_PORT,
                 "default_group": config.DEFAULT_GROUP_ID,
                 "registry": str(config.REGISTRY_PATH)}
    try:
        from falkordb.asyncio import FalkorDB as FalkorDBClient  # type: ignore
        client = FalkorDBClient(host=config.FALKORDB_HOST, port=config.FALKORDB_PORT,
                                password=config.FALKORDB_PASSWORD)
        graphs = await client.list_graphs()
        out.update(connected=True, graphs=sorted(graphs) if graphs else [])
    except Exception as e:
        out.update(connected=False, error=str(e))
    reg = Registry()
    try:
        out.update(docrefs=len(reg.list()), pending_refreshes=reg.pending_count())
    finally:
        reg.close()
    return out


def main() -> None:
    parser = argparse.ArgumentParser(prog="graphiti-mcp",
                                     description="Graphiti MCP server + docref admin")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("serve")
    sub.add_parser("status")
    sub.add_parser("list")
    sub.add_parser("drain")

    p = sub.add_parser("register")
    p.add_argument("uri")
    p.add_argument("--ttl", type=int, default=None, help="staleness TTL in seconds")
    p.add_argument("--group", default=None)

    p = sub.add_parser("get")
    p.add_argument("id_or_uri")

    p = sub.add_parser("remove")
    p.add_argument("id_or_uri")

    p = sub.add_parser("refresh")
    p.add_argument("id", nargs="?")
    p.add_argument("--all", action="store_true")

    p = sub.add_parser("prune")
    p.add_argument("--keep", type=int, default=config.PRUNE_KEEP_VERSIONS)

    args = parser.parse_args()
    config.ensure_dirs()

    if args.command == "serve":
        from .server import run
        run()
        return

    if args.command == "status":
        _print(asyncio.run(_status()))
    elif args.command == "register":
        _print(engine.register_docref(args.uri, ttl_seconds=args.ttl, group=args.group))
    elif args.command == "get":
        _print(asyncio.run(engine.get_docref(args.id_or_uri, start_worker=False)))
    elif args.command == "list":
        _print(engine.list_docrefs())
    elif args.command == "remove":
        _print(asyncio.run(engine.remove_docref(args.id_or_uri)))
    elif args.command == "refresh":
        if not args.all and not args.id:
            parser.error("refresh requires an id or --all")
        reg = Registry()
        try:
            rows = reg.list() if args.all else [r for r in [reg.get(args.id)] if r]
            if not rows:
                _print({"error": f"docref not found: {args.id}"})
                sys.exit(1)
            for row in rows:
                reg.enqueue_refresh(row["id"])
        finally:
            reg.close()
        engine.startup_recover()  # admin context: reclaim orphaned jobs too
        _print(asyncio.run(engine.drain_queue()))
    elif args.command == "drain":
        engine.startup_recover()  # admin context: reclaim orphaned jobs too
        _print(asyncio.run(engine.drain_queue()))
    elif args.command == "prune":
        _print(asyncio.run(engine.prune(keep=args.keep)))


if __name__ == "__main__":
    main()
