"""Read-through caching engine + durable refresh worker.

Read path (docref_get) is latency-bounded by the connector's cheap probe and
NEVER re-ingests inline. Stale content is served with `stale: true` while a
refresh job sits in the durable SQLite queue, drained by the in-process worker
(and re-drained at next startup if the process dies — stdio MCP servers live
and die with the client session).
"""

import asyncio
import json
import sys
from datetime import datetime, timezone

from . import cache, chunker, config, uris
from .connectors import NotConfigured, get_connector
from .graph import build_entity_types, make_graphiti
from .registry import Registry

_worker_task: asyncio.Task | None = None


def _log(msg: str) -> None:
    print(f"[graphiti-mcp] {msg}", file=sys.stderr, flush=True)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _age_seconds(iso: str | None) -> float | None:
    if not iso:
        return None
    return (_now() - datetime.fromisoformat(iso)).total_seconds()


def _public(row: dict, **extra) -> dict:
    out = {
        "id": row["id"], "uri": row["uri"], "source_type": row["source_type"],
        "version_id": row["version_id"], "last_checked": row["last_checked"],
        "last_synced": row["last_synced"], "ttl_seconds": row["check_ttl_seconds"],
        "group": row["group_id"], "status": row["status"],
    }
    out.update(extra)
    return out


# ── registration ─────────────────────────────────────────────────────────────

def register_docref(uri: str, ttl_seconds: int | None = None,
                    group: str | None = None) -> dict:
    parsed = uris.parse(uri)  # raises UriError on malformed input
    source_type = uris.source_type_of(uri)
    if source_type != "codebase":
        raise NotConfigured(
            f"{source_type} references are recognized but the connector is not "
            f"yet enabled (pending auth setup — see PLAN.md M3/M4)"
        )
    # Validate the source is reachable before persisting.
    version = get_connector(source_type).probe(parsed)

    reg = Registry()
    try:
        row = reg.register(
            id=uris.docref_id(uri), uri=uri, source_type=source_type,
            ttl_seconds=ttl_seconds or config.TTL_DEFAULTS[source_type],
            group_id=group or config.DEFAULT_GROUP_ID,
        )
        queued = reg.enqueue_refresh(row["id"])
        return _public(row, probed_version=version,
                       refresh="queued" if queued else "already-pending")
    finally:
        reg.close()


# ── read-through ─────────────────────────────────────────────────────────────

async def get_docref(id_or_uri: str, start_worker: bool = True) -> dict:
    """start_worker=False for short-lived CLI processes — a worker task spawned
    there dies with the process and orphans its claimed job; queued jobs are
    instead picked up by `drain` or the next server session."""
    reg = Registry()
    try:
        row = reg.get(id_or_uri)
        if row is None or row["status"] == "removed":
            return {"error": f"docref not found: {id_or_uri}"}
        content = cache.read(row["id"])

        age = _age_seconds(row["last_checked"])
        if age is not None and age < row["check_ttl_seconds"] and content is not None:
            return _public(row, fresh=True, content=content)

        # Circuit breaker: stop probing a repeatedly-failing source for a while.
        if row["consecutive_failures"] >= config.CIRCUIT_BREAKER_THRESHOLD:
            err_age = _age_seconds(row["last_error_at"])
            if err_age is not None and err_age < config.CIRCUIT_BREAKER_COOLOFF_SECONDS:
                return _public(row, fresh=False, stale=True, content=content,
                               circuit_breaker="open", last_error=row["last_error"])

        parsed = uris.parse(row["uri"])
        connector = get_connector(row["source_type"])
        try:
            version = await asyncio.to_thread(connector.probe, parsed)
        except Exception as e:
            reg.record_error(row["id"], str(e))
            return _public(row, fresh=False, stale=True, content=content,
                           probe_error=str(e)[:300])

        if version == row["version_id"] and content is not None:
            reg.mark_checked(row["id"])
            return _public(reg.get(row["id"]), fresh=True, revalidated=True,
                           content=content)

        queued = reg.enqueue_refresh(row["id"])
        if start_worker:
            ensure_worker()
        return _public(row, fresh=False, stale=True, content=content,
                       new_version=version,
                       refresh="queued" if queued else "already-pending")
    finally:
        reg.close()


def list_docrefs() -> list[dict]:
    reg = Registry()
    try:
        out = []
        for row in reg.list():
            age = _age_seconds(row["last_checked"])
            out.append(_public(
                row,
                fresh=age is not None and age < row["check_ttl_seconds"],
                cached=cache.read(row["id"]) is not None,
                failures=row["consecutive_failures"],
            ))
        return out
    finally:
        reg.close()


async def remove_docref(id_or_uri: str) -> dict:
    """Hard purge: derived episodes first, then cache, then the registry row."""
    reg = Registry()
    try:
        row = reg.get(id_or_uri)
        if row is None:
            return {"error": f"docref not found: {id_or_uri}"}
        history = json.loads(row["episode_uuids"] or "[]")
        uuids = [u for entry in history for u in entry.get("uuids", [])]
        deleted, errors = 0, []
        if uuids:
            g = make_graphiti(row["group_id"])
            try:
                for u in uuids:
                    try:
                        await g.remove_episode(episode_uuid=u)
                        deleted += 1
                    except Exception as e:
                        errors.append({"uuid": u, "error": str(e)[:200]})
            finally:
                await g.close()
        cache.remove(row["id"])
        reg.remove(row["id"])
        return {"removed": row["id"], "episodes_deleted": deleted, "errors": errors}
    finally:
        reg.close()


# ── refresh worker ───────────────────────────────────────────────────────────

async def refresh_row(row: dict, reg: Registry) -> dict:
    """Fetch, hash-gate, chunk, ingest changed chunks, update registry."""
    parsed = uris.parse(row["uri"])
    connector = get_connector(row["source_type"])
    doc = await asyncio.to_thread(connector.fetch, parsed)

    normalized = chunker.normalize(doc.markdown)
    new_hash = chunker.content_hash(normalized)
    cache.write(row["id"], normalized, doc.version_id)

    if new_hash == row["content_hash"] and row["norm_version"] == chunker.NORM_VERSION:
        _log(f"refresh {row['id']}: content unchanged (hash match), skipping ingest")
        reg.mark_synced(row["id"], doc.version_id, new_hash, chunker.NORM_VERSION,
                        json.loads(row["chunk_hashes"] or "{}"), [])
        return {"id": row["id"], "ingested_chunks": 0, "skipped": "hash-unchanged"}

    chunks = chunker.chunk(normalized)
    old_hashes = (json.loads(row["chunk_hashes"] or "{}")
                  if row["norm_version"] == chunker.NORM_VERSION else {})
    changed = [c for c in chunks if old_hashes.get(c.anchor) != c.hash]
    _log(f"refresh {row['id']}: {len(changed)}/{len(chunks)} chunks changed "
         f"@ {doc.version_id[:12]}")

    new_uuids: list[str] = []
    if changed:
        from graphiti_core.nodes import EpisodeType
        entity_types = build_entity_types()
        g = make_graphiti(row["group_id"])
        try:
            for c in changed:
                kwargs: dict = dict(
                    name=f"docref:{row['id']}:{c.anchor}",
                    episode_body=c.text,
                    source=EpisodeType.text,
                    source_description=(
                        f"live docref {row['uri']} @ {doc.version_id} #{c.anchor}"
                    ),
                    reference_time=_now(),
                    group_id=row["group_id"],
                )
                if entity_types is not None:
                    kwargs["entity_types"] = entity_types
                result = await g.add_episode(**kwargs)
                episode = getattr(result, "episode", result)
                uuid = getattr(episode, "uuid", None)
                if uuid:
                    new_uuids.append(str(uuid))
        finally:
            await g.close()

    reg.mark_synced(row["id"], doc.version_id, new_hash, chunker.NORM_VERSION,
                    {c.anchor: c.hash for c in chunks}, new_uuids)
    return {"id": row["id"], "ingested_chunks": len(changed),
            "total_chunks": len(chunks), "version": doc.version_id}


async def drain_queue() -> list[dict]:
    """Work the pending queue to empty. Claims are transactional — safe to call
    from server worker and admin CLI concurrently; each job runs exactly once."""
    results = []
    reg = Registry()
    try:
        while True:
            job = reg.claim_next_job()
            if job is None:
                break
            row = reg.get(job["docref_id"])
            if row is None or row["status"] == "removed":
                reg.finish_job(job["id"], True)
                continue
            try:
                results.append(await refresh_row(row, reg))
                reg.finish_job(job["id"], True)
            except Exception as e:
                _log(f"refresh {job['docref_id']} failed: {e}")
                reg.record_error(job["docref_id"], str(e))
                reg.finish_job(job["id"], False, str(e))
                results.append({"id": job["docref_id"], "error": str(e)[:300]})
    finally:
        reg.close()
    return results


def ensure_worker() -> None:
    """Start the single in-process drain loop if it isn't already running."""
    global _worker_task
    if _worker_task is not None and not _worker_task.done():
        return
    _worker_task = asyncio.get_running_loop().create_task(_worker())


async def _worker() -> None:
    try:
        results = await drain_queue()
        if results:
            _log(f"worker drained {len(results)} job(s)")
    except Exception as e:
        _log(f"worker crashed: {e}")


def startup_recover() -> int:
    """Requeue jobs orphaned by a previous process death; return pending count."""
    reg = Registry()
    try:
        orphans = reg.requeue_orphans()
        if orphans:
            _log(f"startup: requeued {orphans} orphaned job(s)")
        return reg.pending_count()
    finally:
        reg.close()


# ── prune ────────────────────────────────────────────────────────────────────

async def prune(keep: int | None = None) -> list[dict]:
    """Delete graph episodes beyond the last N synced versions per docref."""
    keep = keep or config.PRUNE_KEEP_VERSIONS
    results = []
    reg = Registry()
    try:
        for row in reg.list():
            history = json.loads(row["episode_uuids"] or "[]")
            if len(history) <= keep:
                continue
            old, kept = history[:-keep], history[-keep:]
            uuids = [u for entry in old for u in entry.get("uuids", [])]
            deleted = 0
            g = make_graphiti(row["group_id"])
            try:
                for u in uuids:
                    try:
                        await g.remove_episode(episode_uuid=u)
                        deleted += 1
                    except Exception as e:
                        _log(f"prune {row['id']}: failed to delete {u}: {e}")
            finally:
                await g.close()
            reg.set_episode_history(row["id"], kept)
            results.append({"id": row["id"], "versions_pruned": len(old),
                            "episodes_deleted": deleted})
    finally:
        reg.close()
    return results
