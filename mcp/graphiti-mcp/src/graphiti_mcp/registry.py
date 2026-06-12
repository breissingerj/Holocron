"""SQLite DocRef registry + durable refresh queue.

WAL mode + busy_timeout so the MCP server process and the admin CLI can
operate concurrently. Queue claims use BEGIN IMMEDIATE transactions so only
one worker can claim a given job (single-writer rule).
"""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from . import config

SCHEMA = """
CREATE TABLE IF NOT EXISTS docrefs (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,
  uri TEXT NOT NULL UNIQUE,
  version_id TEXT,
  content_hash TEXT,
  norm_version INTEGER,
  chunk_hashes TEXT,              -- JSON {anchor: sha256} for chunk-level skip
  last_checked TEXT,
  last_synced TEXT,
  check_ttl_seconds INTEGER NOT NULL,
  episode_uuids TEXT NOT NULL DEFAULT '[]',  -- JSON [{version_id, synced_at, uuids:[]}]
  group_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',     -- active | error | removed
  last_error TEXT,
  last_error_at TEXT,
  consecutive_failures INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS refresh_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  docref_id TEXT NOT NULL,
  enqueued_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  state TEXT NOT NULL DEFAULT 'pending',     -- pending | running | done | failed
  attempt INTEGER NOT NULL DEFAULT 0,
  error TEXT
);
CREATE INDEX IF NOT EXISTS idx_queue_state ON refresh_queue(state);
"""


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class Registry:
    def __init__(self, path: Path | None = None):
        self.path = Path(path or config.REGISTRY_PATH)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(self.path, timeout=10)
        self.db.row_factory = sqlite3.Row
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.execute("PRAGMA busy_timeout=5000")
        self.db.executescript(SCHEMA)
        self.db.commit()

    def close(self) -> None:
        self.db.close()

    # ── docrefs ───────────────────────────────────────────────────────────

    def register(self, id: str, uri: str, source_type: str,
                 ttl_seconds: int, group_id: str) -> dict:
        self.db.execute(
            """INSERT INTO docrefs (id, source_type, uri, check_ttl_seconds, group_id)
               VALUES (?, ?, ?, ?, ?)
               ON CONFLICT(uri) DO UPDATE SET
                 check_ttl_seconds = excluded.check_ttl_seconds,
                 group_id = excluded.group_id,
                 status = 'active'""",
            (id, source_type, uri, ttl_seconds, group_id),
        )
        self.db.commit()
        return self.get(uri)  # type: ignore[return-value]

    def get(self, id_or_uri: str) -> dict | None:
        row = self.db.execute(
            "SELECT * FROM docrefs WHERE id = ? OR uri = ?", (id_or_uri, id_or_uri)
        ).fetchone()
        return dict(row) if row else None

    def list(self) -> list[dict]:
        rows = self.db.execute(
            "SELECT * FROM docrefs WHERE status != 'removed' ORDER BY id"
        ).fetchall()
        return [dict(r) for r in rows]

    def remove(self, id: str) -> None:
        self.db.execute("DELETE FROM docrefs WHERE id = ?", (id,))
        self.db.execute("DELETE FROM refresh_queue WHERE docref_id = ?", (id,))
        self.db.commit()

    def mark_checked(self, id: str) -> None:
        self.db.execute(
            "UPDATE docrefs SET last_checked = ?, consecutive_failures = 0,"
            " status = 'active', last_error = NULL WHERE id = ?",
            (_now(), id),
        )
        self.db.commit()

    def mark_synced(self, id: str, version_id: str, content_hash: str,
                    norm_version: int, chunk_hashes: dict[str, str],
                    new_uuids: list[str]) -> None:
        row = self.get(id)
        history = json.loads(row["episode_uuids"]) if row else []
        if new_uuids:
            history.append({"version_id": version_id, "synced_at": _now(), "uuids": new_uuids})
        self.db.execute(
            """UPDATE docrefs SET version_id = ?, content_hash = ?, norm_version = ?,
               chunk_hashes = ?, last_synced = ?, last_checked = ?,
               episode_uuids = ?, consecutive_failures = 0, status = 'active',
               last_error = NULL WHERE id = ?""",
            (version_id, content_hash, norm_version, json.dumps(chunk_hashes),
             _now(), _now(), json.dumps(history), id),
        )
        self.db.commit()

    def set_episode_history(self, id: str, history: list[dict]) -> None:
        self.db.execute(
            "UPDATE docrefs SET episode_uuids = ? WHERE id = ?",
            (json.dumps(history), id),
        )
        self.db.commit()

    def record_error(self, id: str, error: str) -> None:
        self.db.execute(
            """UPDATE docrefs SET last_error = ?, last_error_at = ?,
               consecutive_failures = consecutive_failures + 1,
               status = 'error' WHERE id = ?""",
            (error[:2000], _now(), id),
        )
        self.db.commit()

    # ── refresh queue ─────────────────────────────────────────────────────

    def enqueue_refresh(self, docref_id: str) -> bool:
        """Enqueue once; no-op if a pending/running job already exists."""
        cur = self.db.execute(
            "SELECT 1 FROM refresh_queue WHERE docref_id = ? AND state IN ('pending','running')",
            (docref_id,),
        )
        if cur.fetchone():
            return False
        self.db.execute(
            "INSERT INTO refresh_queue (docref_id, enqueued_at) VALUES (?, ?)",
            (docref_id, _now()),
        )
        self.db.commit()
        return True

    def claim_next_job(self) -> dict | None:
        """Atomically claim the oldest pending job (single-writer rule)."""
        self.db.execute("BEGIN IMMEDIATE")
        try:
            row = self.db.execute(
                "SELECT * FROM refresh_queue WHERE state = 'pending'"
                " ORDER BY enqueued_at LIMIT 1"
            ).fetchone()
            if row is None:
                self.db.execute("COMMIT")
                return None
            self.db.execute(
                "UPDATE refresh_queue SET state = 'running', started_at = ?,"
                " attempt = attempt + 1 WHERE id = ? AND state = 'pending'",
                (_now(), row["id"]),
            )
            self.db.execute("COMMIT")
            return dict(row)
        except Exception:
            self.db.execute("ROLLBACK")
            raise

    def finish_job(self, job_id: int, ok: bool, error: str | None = None) -> None:
        self.db.execute(
            "UPDATE refresh_queue SET state = ?, finished_at = ?, error = ? WHERE id = ?",
            ("done" if ok else "failed", _now(), (error or "")[:2000] or None, job_id),
        )
        self.db.commit()

    def requeue_orphans(self) -> int:
        """Startup recovery: jobs left 'running' by a dead process go back to pending."""
        cur = self.db.execute(
            "UPDATE refresh_queue SET state = 'pending' WHERE state = 'running'"
        )
        self.db.commit()
        return cur.rowcount

    def pending_count(self) -> int:
        return self.db.execute(
            "SELECT COUNT(*) FROM refresh_queue WHERE state = 'pending'"
        ).fetchone()[0]
