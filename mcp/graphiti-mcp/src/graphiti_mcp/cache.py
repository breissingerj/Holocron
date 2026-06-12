"""Disk cache: latest normalized markdown per docref, plus fetch metadata."""

import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

from . import config


def _dir(docref_id: str, base: Path | None = None) -> Path:
    return Path(base or config.CACHE_DIR) / docref_id


def write(docref_id: str, markdown: str, version_id: str, base: Path | None = None) -> Path:
    d = _dir(docref_id, base)
    d.mkdir(parents=True, exist_ok=True)
    path = d / "content.md"
    path.write_text(markdown, encoding="utf-8")
    (d / "meta.json").write_text(json.dumps({
        "version_id": version_id,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "chars": len(markdown),
    }), encoding="utf-8")
    return path


def read(docref_id: str, base: Path | None = None) -> str | None:
    path = _dir(docref_id, base) / "content.md"
    return path.read_text(encoding="utf-8") if path.exists() else None


def meta(docref_id: str, base: Path | None = None) -> dict | None:
    path = _dir(docref_id, base) / "meta.json"
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None


def remove(docref_id: str, base: Path | None = None) -> None:
    shutil.rmtree(_dir(docref_id, base), ignore_errors=True)
