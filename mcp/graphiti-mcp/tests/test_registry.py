"""Tests for graphiti_mcp.registry — pure unit, SQLite only, no network."""

import json
import time

import pytest

from graphiti_mcp.registry import Registry


@pytest.fixture()
def reg(tmp_path):
    r = Registry(path=tmp_path / "r.db")
    yield r
    r.close()


def _register(reg, id="doc-1", uri="repo://github.com/org/repo@main",
               source_type="codebase", ttl=3600, group_id="test"):
    return reg.register(id=id, uri=uri, source_type=source_type,
                        ttl_seconds=ttl, group_id=group_id)


# ---------------------------------------------------------------------------
# Schema / WAL mode
# ---------------------------------------------------------------------------

class TestSchema:
    def test_schema_creates_tables(self, tmp_path):
        reg = Registry(path=tmp_path / "fresh.db")
        tables = {row[0] for row in reg.db.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).fetchall()}
        assert "docrefs" in tables
        assert "refresh_queue" in tables
        reg.close()

    def test_wal_mode_active(self, tmp_path):
        reg = Registry(path=tmp_path / "wal.db")
        mode = reg.db.execute("PRAGMA journal_mode").fetchone()[0]
        assert mode == "wal"
        reg.close()


# ---------------------------------------------------------------------------
# register + get
# ---------------------------------------------------------------------------

class TestRegisterGet:
    def test_register_returns_dict(self, reg):
        row = _register(reg)
        assert isinstance(row, dict)

    def test_get_by_id(self, reg):
        _register(reg, id="doc-1", uri="repo://github.com/org/repo@main")
        row = reg.get("doc-1")
        assert row is not None
        assert row["id"] == "doc-1"

    def test_get_by_uri(self, reg):
        _register(reg, id="doc-1", uri="repo://github.com/org/repo@main")
        row = reg.get("repo://github.com/org/repo@main")
        assert row is not None
        assert row["uri"] == "repo://github.com/org/repo@main"

    def test_get_unknown_returns_none(self, reg):
        assert reg.get("nonexistent") is None

    def test_register_same_uri_updates_ttl(self, reg):
        _register(reg, id="doc-1", uri="repo://github.com/org/repo@main", ttl=3600)
        _register(reg, id="doc-1", uri="repo://github.com/org/repo@main", ttl=7200)
        row = reg.get("doc-1")
        assert row["check_ttl_seconds"] == 7200

    def test_register_same_uri_no_duplicate(self, reg):
        _register(reg, id="doc-1", uri="repo://github.com/org/repo@main")
        _register(reg, id="doc-1", uri="repo://github.com/org/repo@main")
        count = reg.db.execute(
            "SELECT COUNT(*) FROM docrefs WHERE uri = 'repo://github.com/org/repo@main'"
        ).fetchone()[0]
        assert count == 1

    def test_register_sets_active_status(self, reg):
        row = _register(reg)
        assert row["status"] == "active"

    def test_source_type_stored(self, reg):
        row = _register(reg, source_type="codebase")
        assert row["source_type"] == "codebase"


# ---------------------------------------------------------------------------
# enqueue_refresh — idempotent
# ---------------------------------------------------------------------------

class TestEnqueueRefresh:
    def test_enqueue_returns_true_first_time(self, reg):
        _register(reg)
        assert reg.enqueue_refresh("doc-1") is True

    def test_enqueue_idempotent_while_pending(self, reg):
        _register(reg)
        reg.enqueue_refresh("doc-1")
        result = reg.enqueue_refresh("doc-1")
        assert result is False

    def test_pending_count_increments(self, reg):
        _register(reg)
        reg.enqueue_refresh("doc-1")
        assert reg.pending_count() == 1


# ---------------------------------------------------------------------------
# claim_next_job
# ---------------------------------------------------------------------------

class TestClaimNextJob:
    def test_claim_oldest_first(self, reg):
        _register(reg, id="doc-1", uri="repo://github.com/org/repo@main")
        _register(reg, id="doc-2", uri="repo://github.com/org/other@main")
        reg.enqueue_refresh("doc-1")
        time.sleep(0.01)
        reg.enqueue_refresh("doc-2")
        job = reg.claim_next_job()
        assert job is not None
        assert job["docref_id"] == "doc-1"

    def test_second_claim_returns_none_when_one_job(self, reg):
        _register(reg)
        reg.enqueue_refresh("doc-1")
        reg.claim_next_job()
        result = reg.claim_next_job()
        assert result is None

    def test_claim_transitions_to_running(self, reg):
        _register(reg)
        reg.enqueue_refresh("doc-1")
        job = reg.claim_next_job()
        assert job is not None
        row = reg.db.execute(
            "SELECT state FROM refresh_queue WHERE id = ?", (job["id"],)
        ).fetchone()
        assert row["state"] == "running"

    def test_claim_empty_queue_returns_none(self, reg):
        assert reg.claim_next_job() is None


# ---------------------------------------------------------------------------
# finish_job
# ---------------------------------------------------------------------------

class TestFinishJob:
    def test_finish_done(self, reg):
        _register(reg)
        reg.enqueue_refresh("doc-1")
        job = reg.claim_next_job()
        reg.finish_job(job["id"], ok=True)
        row = reg.db.execute(
            "SELECT state FROM refresh_queue WHERE id = ?", (job["id"],)
        ).fetchone()
        assert row["state"] == "done"

    def test_finish_failed(self, reg):
        _register(reg)
        reg.enqueue_refresh("doc-1")
        job = reg.claim_next_job()
        reg.finish_job(job["id"], ok=False, error="boom")
        row = reg.db.execute(
            "SELECT state, error FROM refresh_queue WHERE id = ?", (job["id"],)
        ).fetchone()
        assert row["state"] == "failed"
        assert row["error"] == "boom"


# ---------------------------------------------------------------------------
# requeue_orphans
# ---------------------------------------------------------------------------

class TestRequeueOrphans:
    def test_requeue_moves_running_to_pending(self, reg):
        _register(reg)
        reg.enqueue_refresh("doc-1")
        reg.claim_next_job()  # transitions to running
        count = reg.requeue_orphans()
        assert count == 1
        row = reg.db.execute(
            "SELECT state FROM refresh_queue"
        ).fetchone()
        assert row["state"] == "pending"

    def test_requeue_only_affects_running(self, reg):
        _register(reg, id="doc-1", uri="repo://github.com/org/repo@main")
        _register(reg, id="doc-2", uri="repo://github.com/org/other@main")
        reg.enqueue_refresh("doc-1")
        reg.enqueue_refresh("doc-2")
        reg.claim_next_job()  # doc-1 → running, doc-2 still pending
        count = reg.requeue_orphans()
        assert count == 1


# ---------------------------------------------------------------------------
# record_error + mark_checked
# ---------------------------------------------------------------------------

class TestErrorTracking:
    def test_record_error_increments_failures(self, reg):
        _register(reg)
        reg.record_error("doc-1", "something bad")
        row = reg.get("doc-1")
        assert row["consecutive_failures"] == 1
        reg.record_error("doc-1", "again")
        row = reg.get("doc-1")
        assert row["consecutive_failures"] == 2

    def test_record_error_sets_status_error(self, reg):
        _register(reg)
        reg.record_error("doc-1", "oops")
        row = reg.get("doc-1")
        assert row["status"] == "error"

    def test_mark_checked_resets_failures(self, reg):
        _register(reg)
        reg.record_error("doc-1", "fail")
        reg.record_error("doc-1", "fail2")
        reg.mark_checked("doc-1")
        row = reg.get("doc-1")
        assert row["consecutive_failures"] == 0

    def test_mark_checked_restores_active_status(self, reg):
        _register(reg)
        reg.record_error("doc-1", "fail")
        reg.mark_checked("doc-1")
        row = reg.get("doc-1")
        assert row["status"] == "active"

    def test_mark_checked_clears_last_error(self, reg):
        _register(reg)
        reg.record_error("doc-1", "fail")
        reg.mark_checked("doc-1")
        row = reg.get("doc-1")
        assert row["last_error"] is None


# ---------------------------------------------------------------------------
# mark_synced
# ---------------------------------------------------------------------------

class TestMarkSynced:
    def test_mark_synced_stores_version_and_hash(self, reg):
        _register(reg)
        reg.mark_synced("doc-1", "abc123", "deadbeef", 1, {"intro": "aaa"}, [])
        row = reg.get("doc-1")
        assert row["version_id"] == "abc123"
        assert row["content_hash"] == "deadbeef"

    def test_mark_synced_stores_chunk_hashes(self, reg):
        _register(reg)
        reg.mark_synced("doc-1", "v1", "hash1", 1, {"intro": "aaa", "body": "bbb"}, [])
        row = reg.get("doc-1")
        hashes = json.loads(row["chunk_hashes"])
        assert hashes == {"intro": "aaa", "body": "bbb"}

    def test_mark_synced_appends_episode_history_when_uuids_nonempty(self, reg):
        _register(reg)
        reg.mark_synced("doc-1", "v1", "h1", 1, {}, ["uuid-a", "uuid-b"])
        row = reg.get("doc-1")
        history = json.loads(row["episode_uuids"])
        assert len(history) == 1
        assert history[0]["uuids"] == ["uuid-a", "uuid-b"]
        assert history[0]["version_id"] == "v1"

    def test_mark_synced_does_not_append_history_when_uuids_empty(self, reg):
        _register(reg)
        reg.mark_synced("doc-1", "v1", "h1", 1, {}, [])
        row = reg.get("doc-1")
        history = json.loads(row["episode_uuids"])
        assert history == []

    def test_mark_synced_accumulates_episode_history(self, reg):
        _register(reg)
        reg.mark_synced("doc-1", "v1", "h1", 1, {}, ["uuid-1"])
        reg.mark_synced("doc-1", "v2", "h2", 1, {}, ["uuid-2"])
        row = reg.get("doc-1")
        history = json.loads(row["episode_uuids"])
        assert len(history) == 2

    def test_mark_synced_resets_failures(self, reg):
        _register(reg)
        reg.record_error("doc-1", "fail")
        reg.mark_synced("doc-1", "v1", "h1", 1, {}, [])
        row = reg.get("doc-1")
        assert row["consecutive_failures"] == 0

    def test_mark_synced_norm_version_stored(self, reg):
        _register(reg)
        reg.mark_synced("doc-1", "v1", "h1", 42, {}, [])
        row = reg.get("doc-1")
        assert row["norm_version"] == 42
