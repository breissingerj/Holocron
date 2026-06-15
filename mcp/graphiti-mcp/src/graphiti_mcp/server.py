"""graphiti-mcp — FastMCP stdio server.

Parity tools mirror the pi extension's graphiti-memory toolset; docref tools
add live-document references with read-through caching. Refresh is queued and
drained by the in-process worker — never inline on the read path.
"""

import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from mcp.server.fastmcp import FastMCP

from . import config, engine
from .connectors import NotConfigured
from .graph import build_entity_types, close_all_graphiti, make_graphiti
from .uris import UriError


# ── Async background task infrastructure ─────────────────────────────────────
#
# Long-running tools (add_episode, add_triplet, build_communities) return
# immediately with a job token and run in background asyncio tasks so the MCP
# client never times out.
#
# Per-group serialisation: graphiti_core's entity deduplication is NOT
# concurrency-safe within a single group — if two add_episode calls for the
# same group run simultaneously they can both see "entity does not exist" and
# create duplicates. One Semaphore per group-id enforces sequential processing.

_logger = logging.getLogger(__name__)
_group_semaphores: dict[str, asyncio.Semaphore] = {}

# Task registry: running + last 20 completed tasks, newest-last.
# Entries: {label, started_at, status, error, finished_at}
_bg_task_registry: list[dict] = []
_BG_REGISTRY_KEEP = 20


def _group_sem(group_id: str) -> asyncio.Semaphore:
    """Return (or create) the per-group sequential-add semaphore."""
    if group_id not in _group_semaphores:
        _group_semaphores[group_id] = asyncio.Semaphore(1)
    return _group_semaphores[group_id]


def _bg(coro, label: str) -> None:
    """Fire a coroutine as a tracked background asyncio task.

    Registers the task in _bg_task_registry so graphiti_status can report it.
    Keeps the last _BG_REGISTRY_KEEP completed entries; running tasks are always
    visible regardless of that cap.
    """
    entry: dict = {
        "label": label,
        "started_at": datetime.now(timezone.utc).isoformat(),
        "status": "running",
        "error": None,
        "finished_at": None,
    }
    _bg_task_registry.append(entry)

    async def _guarded():
        try:
            await coro
            entry["status"] = "done"
        except Exception as exc:  # noqa: BLE001
            entry["status"] = "failed"
            entry["error"] = str(exc)
            _logger.error("background task %s failed: %s", label, exc)
        finally:
            entry["finished_at"] = datetime.now(timezone.utc).isoformat()
            # Prune completed entries beyond the cap (keep running ones always).
            completed = [e for e in _bg_task_registry if e["status"] != "running"]
            if len(completed) > _BG_REGISTRY_KEEP:
                to_remove = set(id(e) for e in completed[:-_BG_REGISTRY_KEEP])
                _bg_task_registry[:] = [e for e in _bg_task_registry
                                         if id(e) not in to_remove]

    asyncio.create_task(_guarded(), name=label)


class _IndexExistsFilter(logging.Filter):
    """Suppress the 'Index already exists' INFO lines from FalkorDriver.

    FalkorDriver.__init__ fires build_indices_and_constraints() as a background
    task on every instantiation. When indices already exist it logs INFO for
    each one — harmless but noisy. Suppress to WARNING so only real errors
    surface.
    """
    def filter(self, record: logging.LogRecord) -> bool:
        return "already" not in record.getMessage().lower()


@asynccontextmanager
async def _lifespan(_server):
    # Silence 'Index already exists' INFO noise from FalkorDriver.
    _falkor_log = logging.getLogger("graphiti_core.driver.falkordb_driver")
    _falkor_log.addFilter(_IndexExistsFilter())

    config.ensure_dirs()
    pending = engine.startup_recover()
    if pending:
        engine.ensure_worker()
    yield {}
    await close_all_graphiti()


mcp = FastMCP("graphiti-mcp", lifespan=_lifespan)


# ── Parity tools (mirror pi extension) ───────────────────────────────────────

@mcp.tool()
async def graphiti_add(text: str, name: str | None = None,
                       source_description: str | None = None,
                       source: str = "text", group: str | None = None,
                       uuid: str | None = None,
                       reference_time: str | None = None,
                       excluded_entity_types: list[str] | None = None,
                       custom_extraction_instructions: str | None = None,
                       previous_episode_uuids: list[str] | None = None,
                       update_communities: bool = False,
                       saga: str | None = None,
                       saga_previous_episode_uuid: str | None = None) -> dict:
    """Persist a fact, preference, or context into the Graphiti temporal
    knowledge graph. Entities and relationships are extracted automatically;
    contradictions resolve over time. source: text | message | json.

    Bi-temporal: pass reference_time (ISO-8601, e.g. "2025-01-15T10:30:00Z") to
    set when the events *occurred*; omitted = now. uuid supplies a caller-chosen
    episode UUID (idempotent re-ingest). excluded_entity_types suppresses types
    for this episode; custom_extraction_instructions steers the extractor;
    previous_episode_uuids overrides auto-retrieved context; update_communities
    refreshes community summaries; saga / saga_previous_episode_uuid associate
    and order the episode within a named saga."""
    from uuid import uuid4
    from graphiti_core.nodes import EpisodeType
    from .typing_helpers import parse_reference_time

    group_id = group or config.DEFAULT_GROUP_ID
    source_map = {"text": EpisodeType.text, "message": EpisodeType.message,
                  "json": EpisodeType.json}
    try:
        ref_time = parse_reference_time(reference_time) or datetime.now(timezone.utc)
    except ValueError as e:
        return {"success": False, "error": f"invalid reference_time: {e}"}
    # Pre-generate the episode UUID so the caller has it immediately.
    episode_uuid_str = uuid or str(uuid4())
    entity_types = build_entity_types()

    async def _do_add():
        kwargs: dict = dict(
            name=name or f"episode_{uuid4().hex[:8]}",
            episode_body=text,
            source=source_map.get(source, EpisodeType.text),
            source_description=source_description or "mcp session",
            reference_time=ref_time,
            group_id=group_id,
            update_communities=update_communities,
            uuid=episode_uuid_str,
        )
        if entity_types is not None:
            kwargs["entity_types"] = entity_types
        if excluded_entity_types is not None:
            kwargs["excluded_entity_types"] = excluded_entity_types
        if custom_extraction_instructions is not None:
            kwargs["custom_extraction_instructions"] = custom_extraction_instructions
        if previous_episode_uuids is not None:
            kwargs["previous_episode_uuids"] = previous_episode_uuids
        if saga is not None:
            kwargs["saga"] = saga
        if saga_previous_episode_uuid is not None:
            kwargs["saga_previous_episode_uuid"] = saga_previous_episode_uuid
        # Acquire per-group semaphore: graphiti-core entity deduplication is
        # not concurrency-safe within a group — serialise adds to avoid duplicates.
        async with _group_sem(group_id):
            g = make_graphiti(group_id)
            await g.add_episode(**kwargs)

    _bg(_do_add(), label=f"add_episode:{episode_uuid_str[:8]}")
    return {"success": True, "group": group_id, "chars": len(text),
            "episode_uuid": episode_uuid_str, "queued": True}


@mcp.tool()
async def graphiti_search(query: str, num_results: int = 10,
                          group: str | None = None,
                          center_node_uuid: str | None = None,
                          edge_types: list[str] | None = None,
                          valid_at_after: str | None = None,
                          valid_at_before: str | None = None,
                          invalid_at_after: str | None = None,
                          invalid_at_before: str | None = None) -> dict:
    """Hybrid search for facts (entity edges) in the knowledge graph. Facts
    carry valid_at/invalid_at — null invalid_at means currently true.

    center_node_uuid re-ranks results by graph distance to that node.
    edge_types filters to specific relationship type names. The valid_at_* /
    invalid_at_* args are ISO-8601 bounds (UTC) on a fact's temporal window."""
    from .typing_helpers import build_fact_search_filters

    group_id = group or config.DEFAULT_GROUP_ID
    try:
        search_filter = build_fact_search_filters(
            edge_types=edge_types, valid_at_after=valid_at_after,
            valid_at_before=valid_at_before, invalid_at_after=invalid_at_after,
            invalid_at_before=invalid_at_before)
    except ValueError as e:
        return {"success": False, "error": f"invalid date filter: {e}",
                "facts": [], "total": 0}
    g = make_graphiti(group_id)
    try:
        results = await g.search(query=query, num_results=num_results,
                                 group_ids=[group_id],
                                 center_node_uuid=center_node_uuid,
                                 search_filter=search_filter)
        edges = results if isinstance(results, list) else getattr(results, "edges", [])
        facts = [{"fact": e.fact,
                  "valid_at": e.valid_at.isoformat() if e.valid_at else None,
                  "invalid_at": e.invalid_at.isoformat() if e.invalid_at else None,
                  "uuid": str(e.uuid)} for e in edges]
        return {"success": True, "group": group_id, "facts": facts, "total": len(facts)}
    except Exception as e:
        return {"success": False, "error": str(e), "facts": [], "total": 0}


@mcp.tool()
async def graphiti_search_nodes(query: str, num_results: int = 10,
                                group: str | None = None,
                                entity_types: list[str] | None = None,
                                center_node_uuid: str | None = None) -> dict:
    """Search for entity node summaries — what an entity IS, rather than the
    facts between entities. Use graphiti_search for specific facts/events.

    entity_types filters to specific entity type labels (e.g. Preference,
    Organization). center_node_uuid re-ranks by graph distance to that node."""
    from copy import deepcopy
    from graphiti_core.search.search_config_recipes import (
        NODE_HYBRID_SEARCH_NODE_DISTANCE, NODE_HYBRID_SEARCH_RRF)
    from graphiti_core.search.search_filters import SearchFilters

    group_id = group or config.DEFAULT_GROUP_ID
    g = make_graphiti(group_id)
    try:
        # node_distance reranker is only honored when a center node is given.
        base = (NODE_HYBRID_SEARCH_NODE_DISTANCE if center_node_uuid
                else NODE_HYBRID_SEARCH_RRF)
        node_config = deepcopy(base)
        node_config.limit = num_results
        search_filter = SearchFilters(node_labels=entity_types) if entity_types else None
        results = await g.search_(query=query, config=node_config,
                                  group_ids=[group_id],
                                  center_node_uuid=center_node_uuid,
                                  search_filter=search_filter)
        nodes = [{"name": getattr(n, "name", None),
                  "summary": getattr(n, "summary", None),
                  "entity_type": getattr(n, "entity_type", getattr(n, "labels", None)),
                  "uuid": str(n.uuid) if hasattr(n, "uuid") else None}
                 for n in results.nodes]
        return {"success": True, "group": group_id, "nodes": nodes, "total": len(nodes)}
    except Exception as e:
        return {"success": False, "error": str(e), "nodes": [], "total": 0}


@mcp.tool()
async def graphiti_get_episodes(limit: int = 10, full: bool = False,
                                group: str | None = None) -> dict:
    """List the most recent episodes ingested into the graph. Content is
    truncated to 200 chars unless full=true."""
    group_id = group or config.DEFAULT_GROUP_ID
    g = make_graphiti(group_id)
    try:
        ref_time = datetime.now(timezone.utc).replace(year=2099)
        episodes_raw = await g.retrieve_episodes(reference_time=ref_time,
                                                 last_n=limit, group_ids=[group_id])
        episodes = []
        for ep in episodes_raw:
            content = getattr(ep, "content", None) or ""
            episodes.append({
                "uuid": str(ep.uuid) if hasattr(ep, "uuid") else None,
                "name": getattr(ep, "name", None),
                "source": str(getattr(ep, "source", None)),
                "source_description": getattr(ep, "source_description", None),
                "content": content if full else content[:200],
                "created_at": (ep.created_at.isoformat()
                               if getattr(ep, "created_at", None) else None),
            })
        return {"success": True, "group": group_id, "episodes": episodes,
                "total": len(episodes)}
    except Exception as e:
        return {"success": False, "error": str(e)}


@mcp.tool()
async def graphiti_delete_episode(uuid: str, group: str | None = None) -> dict:
    """Delete an episode by UUID. Cascades to entities/edges derived only from
    this episode. Confirm the UUID with graphiti_get_episodes first."""
    group_id = group or config.DEFAULT_GROUP_ID
    g = make_graphiti(group_id)
    try:
        await g.remove_episode(episode_uuid=uuid)
        return {"success": True, "deleted_uuid": uuid, "group": group_id}
    except Exception as e:
        return {"success": False, "error": str(e), "uuid": uuid}


@mcp.tool()
async def graphiti_get_entity_edge(uuid: str, group: str | None = None) -> dict:
    """Retrieve a specific entity edge (fact) by UUID with temporal bounds and
    originating episodes."""
    from graphiti_core.edges import EntityEdge

    group_id = group or config.DEFAULT_GROUP_ID
    g = make_graphiti(group_id)
    try:
        edge = await EntityEdge.get_by_uuid(g.driver, uuid)
        if edge is None:
            return {"success": False, "error": f"Edge {uuid} not found"}
        return {"success": True, "uuid": str(edge.uuid), "fact": edge.fact,
                "valid_at": edge.valid_at.isoformat() if edge.valid_at else None,
                "invalid_at": edge.invalid_at.isoformat() if edge.invalid_at else None,
                "episodes": [str(e) for e in getattr(edge, "episodes", [])]}
    except Exception as e:
        return {"success": False, "error": str(e), "uuid": uuid}


@mcp.tool()
async def graphiti_delete_entity_edge(uuid: str, group: str | None = None) -> dict:
    """Delete a specific entity edge (fact) by UUID — surgical correction of a
    single wrong fact without removing whole episodes."""
    from graphiti_core.edges import EntityEdge

    group_id = group or config.DEFAULT_GROUP_ID
    g = make_graphiti(group_id)
    try:
        edge = await EntityEdge.get_by_uuid(g.driver, uuid)
        await edge.delete(g.driver)
        return {"success": True, "deleted_uuid": uuid, "group": group_id}
    except Exception as e:
        return {"success": False, "error": str(e), "uuid": uuid}


@mcp.tool()
async def graphiti_build_indices(group: str | None = None) -> dict:
    """Build/rebuild vector and full-text indices for a graph group. Required
    once after the first write to a new group; idempotent."""
    group_id = group or config.DEFAULT_GROUP_ID
    g = make_graphiti(group_id)
    try:
        await g.build_indices_and_constraints()
        return {"success": True, "group": group_id}
    except Exception as e:
        return {"success": False, "group": group_id, "error": str(e)}


@mcp.tool()
async def graphiti_add_triplet(source_node_name: str, edge_name: str, fact: str,
                               target_node_name: str, group: str | None = None,
                               source_node_uuid: str | None = None,
                               target_node_uuid: str | None = None) -> dict:
    """Write a single fact triplet (source entity -> fact -> target entity)
    directly, bypassing LLM extraction. graphiti-core resolves/deduplicates the
    endpoint entities by name and generates embeddings. Use when you have an
    explicit, structured fact you don't want reinterpreted by the extractor.

    Queued: returns immediately; embedding + entity resolution runs in the
    background. Use graphiti_search to verify the fact once processing completes."""
    from uuid import uuid4
    from graphiti_core.nodes import EntityNode
    from graphiti_core.edges import EntityEdge

    group_id = group or config.DEFAULT_GROUP_ID
    now = datetime.now(timezone.utc)
    src_uuid = source_node_uuid or str(uuid4())
    tgt_uuid = target_node_uuid or str(uuid4())
    edge_uuid = str(uuid4())

    async def _do_triplet():
        source_node = EntityNode(uuid=src_uuid, name=source_node_name,
                                 group_id=group_id, created_at=now)
        target_node = EntityNode(uuid=tgt_uuid, name=target_node_name,
                                 group_id=group_id, created_at=now)
        edge = EntityEdge(name=edge_name, fact=fact, group_id=group_id,
                          source_node_uuid=src_uuid, target_node_uuid=tgt_uuid,
                          created_at=now)
        async with _group_sem(group_id):
            g = make_graphiti(group_id)
            await g.add_triplet(source_node, edge, target_node)

    _bg(_do_triplet(), label=f"add_triplet:{edge_uuid[:8]}")
    return {"success": True, "group": group_id, "queued": True,
            "source_node_uuid": src_uuid, "target_node_uuid": tgt_uuid}


@mcp.tool()
async def graphiti_get_episode_entities(episode_uuids: list[str],
                                        group: str | None = None) -> dict:
    """Provenance tracer: given episode UUIDs, return the nodes (entities) and
    edges (facts) those episodes produced. Use to debug what extraction created
    from a given add_episode call."""
    if not episode_uuids:
        return {"success": False, "error": "episode_uuids must be non-empty"}
    group_id = group or config.DEFAULT_GROUP_ID
    g = make_graphiti(group_id)
    try:
        results = await g.get_nodes_and_edges_by_episode(episode_uuids)
        nodes = [{"uuid": str(n.uuid), "name": getattr(n, "name", None),
                  "summary": getattr(n, "summary", None),
                  "labels": getattr(n, "labels", None)} for n in results.nodes]
        edges = [{"uuid": str(e.uuid), "name": getattr(e, "name", None),
                  "fact": getattr(e, "fact", None),
                  "source_node_uuid": getattr(e, "source_node_uuid", None),
                  "target_node_uuid": getattr(e, "target_node_uuid", None)}
                 for e in results.edges]
        return {"success": True, "group": group_id, "nodes": nodes, "edges": edges}
    except Exception as e:
        return {"success": False, "error": str(e)}


@mcp.tool()
async def graphiti_clear_graph(group: str | None = None) -> dict:
    """Destructive: clear ALL data for a group's graph. Removes every episode,
    entity, and fact in the group. Confirm the group before calling."""
    from graphiti_core.utils.maintenance.graph_data_operations import clear_data

    group_id = group or config.DEFAULT_GROUP_ID
    g = make_graphiti(group_id)
    try:
        await clear_data(g.driver, group_ids=[group_id])
        return {"success": True, "cleared_group": group_id}
    except Exception as e:
        return {"success": False, "error": str(e), "group": group_id}


@mcp.tool()
async def graphiti_build_communities(group: str | None = None) -> dict:
    """Detect entity communities and generate higher-level cluster summaries for
    a group. Expensive — processes the full entity set with Louvain detection
    then calls the LLM for each cluster summary (may take several minutes).

    Queued: returns immediately with status='running'; check server logs or
    re-run later to see results. Use graphiti_search_nodes to query communities
    once processing completes."""
    group_id = group or config.DEFAULT_GROUP_ID

    async def _do_communities():
        g = make_graphiti(group_id)
        communities, edges = await g.build_communities(group_ids=[group_id])
        _logger.info("build_communities complete: group=%s communities=%d edges=%d",
                     group_id, len(communities), len(edges))

    _bg(_do_communities(), label=f"build_communities:{group_id}")
    return {"success": True, "group": group_id, "status": "running",
            "message": "Community detection started in background. "
                        "This may take several minutes on large graphs."}


@mcp.tool()
async def graphiti_summarize_saga(saga_name: str, group: str | None = None) -> dict:
    """Generate/refresh the running narrative summary of a saga (an ordered set
    of related episodes tagged via graphiti_add's saga param). Resolves the saga
    name to its UUID within the group, then summarizes."""
    from graphiti_core.nodes import SagaNode

    group_id = group or config.DEFAULT_GROUP_ID
    g = make_graphiti(group_id)
    try:
        sagas = await SagaNode.get_by_group_ids(g.driver, [group_id])
        match = next((s for s in sagas if s.name == saga_name), None)
        if match is None:
            return {"success": False,
                    "error": f"no saga named '{saga_name}' in group '{group_id}'"}
        saga_node = await g.summarize_saga(match.uuid)
        return {"success": True, "group": group_id, "uuid": str(saga_node.uuid),
                "name": saga_node.name, "summary": saga_node.summary}
    except Exception as e:
        return {"success": False, "error": str(e), "group": group_id}


@mcp.tool()
async def graphiti_status() -> dict:
    """Check FalkorDB connectivity, list graphs, report docref/queue state,
    and show the status of all background tasks (running + last 20 completed)."""
    out: dict = {"host": config.FALKORDB_HOST, "port": config.FALKORDB_PORT,
                 "default_group": config.DEFAULT_GROUP_ID}
    try:
        from falkordb.asyncio import FalkorDB as FalkorDBClient  # type: ignore
        client = FalkorDBClient(host=config.FALKORDB_HOST, port=config.FALKORDB_PORT,
                                password=config.FALKORDB_PASSWORD)
        graphs = await client.list_graphs()
        out.update(connected=True, graphs=sorted(graphs) if graphs else [])
    except Exception as e:
        out.update(connected=False, error=str(e))
    try:
        from .registry import Registry
        reg = Registry()
        out.update(docrefs=len(reg.list()), pending_refreshes=reg.pending_count())
        reg.close()
    except Exception as e:
        out.update(registry_error=str(e))
    # Background task report: snapshot of registry at call time.
    running = [e for e in _bg_task_registry if e["status"] == "running"]
    recent  = [e for e in _bg_task_registry if e["status"] != "running"][-10:]
    out["background_tasks"] = {
        "running_count": len(running),
        "running": running,
        "recent": recent,
    }
    return out


# ── DocRef tools (live document references) ──────────────────────────────────

@mcp.tool()
async def docref_register(uri: str, ttl_seconds: int | None = None,
                          group: str | None = None) -> dict:
    """Register a live document reference for tracking + read-through caching.
    URI forms: repo://<host>/<owner>/<repo>@<branch>/<glob> or
    repo://local/<abs-path>@<branch>/<glob>. Initial ingestion is queued
    asynchronously. TTL defaults: codebase 6h. (confluence:// and gdrive://
    are recognized but not yet enabled.)"""
    try:
        result = engine.register_docref(uri, ttl_seconds=ttl_seconds, group=group)
        engine.ensure_worker()
        return {"success": True, **result}
    except (UriError, NotConfigured) as e:
        return {"success": False, "error": str(e)}
    except Exception as e:
        return {"success": False, "error": f"registration failed: {e}"}


@mcp.tool()
async def docref_get(id_or_uri: str) -> dict:
    """Read a registered live document through the cache. Fresh content returns
    immediately; if the source changed, cached content returns with stale:true
    and a background refresh is queued (never blocks on re-ingestion)."""
    try:
        return await engine.get_docref(id_or_uri)
    except Exception as e:
        return {"error": str(e)}


@mcp.tool()
async def docref_list() -> dict:
    """List all registered live document references with freshness state."""
    try:
        refs = engine.list_docrefs()
        return {"success": True, "docrefs": refs, "total": len(refs)}
    except Exception as e:
        return {"success": False, "error": str(e)}


@mcp.tool()
async def docref_remove(id_or_uri: str) -> dict:
    """Remove a docref and hard-purge its derived episodes from the graph and
    its disk cache. This is destructive purge semantics — confirm first."""
    try:
        return await engine.remove_docref(id_or_uri)
    except Exception as e:
        return {"error": str(e)}


@mcp.custom_route("/health", methods=["GET"])
async def _health(_request):
    """Liveness probe for Docker/traefik (only used under HTTP transport)."""
    from starlette.responses import JSONResponse
    return JSONResponse({"status": "healthy", "service": "graphiti-mcp"})


def run(transport: str = "stdio", host: str | None = None,
        port: int | None = None) -> None:
    """Run the MCP server.

    transport: 'stdio' (default, for local agent harnesses) | 'streamable-http'
    | 'sse'. host/port apply to the HTTP transports (defaults 127.0.0.1:8000);
    use host=0.0.0.0 in a container so traefik/the host can reach it.

    When host is not a loopback address the FastMCP DNS-rebinding protection is
    reconfigured to either use the hosts supplied in GRAPHITI_MCP_ALLOWED_HOSTS
    (comma-separated) or disabled entirely — appropriate for a container running
    behind a trusted reverse proxy (traefik/nginx) that handles external TLS.
    """
    import os
    from mcp.server.transport_security import TransportSecuritySettings

    _LOOPBACK = {"127.0.0.1", "localhost", "::1"}
    effective_host = host or mcp.settings.host

    if host is not None:
        mcp.settings.host = host
    if port is not None:
        mcp.settings.port = port

    if effective_host not in _LOOPBACK and transport != "stdio":
        raw = os.environ.get("GRAPHITI_MCP_ALLOWED_HOSTS", "").strip()
        if raw:
            # Explicit allowlist supplied — use it.
            allowed = [h.strip() for h in raw.split(",") if h.strip()]
            mcp.settings.transport_security = TransportSecuritySettings(
                enable_dns_rebinding_protection=True,
                allowed_hosts=allowed,
            )
        else:
            # No allowlist — disable DNS-rebinding protection entirely.
            # Safe when the server runs behind a trusted reverse proxy.
            mcp.settings.transport_security = TransportSecuritySettings(
                enable_dns_rebinding_protection=False,
            )

    mcp.run(transport=transport)


if __name__ == "__main__":
    run()
