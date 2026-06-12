"""Codebase connector — git-backed, allowlist-scoped.

Probe: branch head SHA only (rev-parse locally, ls-remote for remotes).
Fetch: reads committed content at that SHA via `git show`, never the working
tree, so content always matches version_id. Remote repos are kept as shallow
bare mirrors under ~/.graphiti-mcp/repos/.
"""

import fnmatch
import hashlib
import subprocess
from pathlib import Path

from .. import config
from ..uris import RepoRef, UriError
from .base import NormalizedDoc, ProbeError

BLOCKED_SEGMENTS = {
    "node_modules", "dist", "build", ".git", "__pycache__", ".next",
    "vendor", "target", "coverage", ".venv", "venv",
}
BLOCKED_FILE_PATTERNS = [
    "*.lock", "package-lock.json", "yarn.lock", "*.min.js", "*.min.css", "*.map",
]
ALLOWED_EXTENSIONS = {".md", ".mdx", ".txt", ".rst"}


def _git(args: list[str], cwd: Path | None = None, timeout: int = 120) -> str:
    res = subprocess.run(["git", *args], cwd=cwd, capture_output=True,
                         text=True, timeout=timeout)
    if res.returncode != 0:
        raise ProbeError(f"git {' '.join(args[:3])}: {res.stderr.strip()[:300]}")
    return res.stdout


def _mirror_dir(ref: RepoRef) -> Path:
    digest = hashlib.sha256(ref.clone_url.encode()).hexdigest()[:12]
    return config.REPOS_DIR / f"{ref.repo_path.replace('/', '-')}-{digest}"


def _glob_matches(path: str, glob: str) -> bool:
    if fnmatch.fnmatch(path, glob):
        return True
    # fnmatch's "*" crosses "/" but "**/x" still demands a slash — also match
    # top-level files against the tail pattern.
    if glob.startswith("**/"):
        return fnmatch.fnmatch(path, glob[3:])
    return False


def _glob_has_explicit_extension(glob: str) -> bool:
    suffix = Path(glob).suffix
    return bool(suffix) and not any(ch in suffix for ch in "*?[")


def _is_selected(path: str, glob: str) -> bool:
    if not _glob_matches(path, glob):
        return False
    parts = Path(path).parts
    if any(seg in BLOCKED_SEGMENTS for seg in parts):
        return False
    name = parts[-1]
    if any(fnmatch.fnmatch(name, pat) for pat in BLOCKED_FILE_PATTERNS):
        return False
    # Explicitly-named extensions in the glob bypass the doc allowlist
    # (lets a docref opt into source files, e.g. **/*.py).
    if not _glob_has_explicit_extension(glob):
        if Path(name).suffix.lower() not in ALLOWED_EXTENSIONS:
            return False
    return True


def _safe_fence(content: str) -> str:
    fence = "```"
    while fence in content:
        fence += "`"
    return fence


class CodebaseConnector:
    def probe(self, ref: RepoRef) -> str:
        if ref.is_local:
            repo = Path(ref.repo_path)
            if not repo.exists():
                raise ProbeError(f"local repo not found: {repo}")
            return _git(["rev-parse", ref.branch], cwd=repo, timeout=15).strip()
        out = _git(["ls-remote", ref.clone_url, f"refs/heads/{ref.branch}"], timeout=30)
        if not out.strip():
            raise ProbeError(f"branch {ref.branch!r} not found at {ref.clone_url}")
        return out.split()[0]

    def _repo_and_sha(self, ref: RepoRef) -> tuple[Path, str]:
        if ref.is_local:
            repo = Path(ref.repo_path)
            return repo, _git(["rev-parse", ref.branch], cwd=repo, timeout=15).strip()
        mirror = _mirror_dir(ref)
        if not mirror.exists():
            mirror.parent.mkdir(parents=True, exist_ok=True)
            _git(["clone", "--bare", "--depth", "1", "--branch", ref.branch,
                  ref.clone_url, str(mirror)], timeout=300)
        else:
            _git(["fetch", "--depth", "1", "origin", ref.branch], cwd=mirror, timeout=300)
            return mirror, _git(["rev-parse", "FETCH_HEAD"], cwd=mirror, timeout=15).strip()
        return mirror, _git(["rev-parse", ref.branch], cwd=mirror, timeout=15).strip()

    def fetch(self, ref: RepoRef) -> NormalizedDoc:
        repo, sha = self._repo_and_sha(ref)
        listing = _git(["ls-tree", "-r", "--name-only", sha], cwd=repo, timeout=60)
        selected = [p for p in listing.splitlines() if p and _is_selected(p, ref.glob)]
        if not selected:
            raise UriError(
                f"no files match glob {ref.glob!r} at {ref.uri} "
                f"(after allowlist/blocklist filtering)"
            )

        parts = [f"# repo: {ref.uri}", ""]
        skipped_size = 0
        for path in sorted(selected):
            size = int(_git(["cat-file", "-s", f"{sha}:{path}"], cwd=repo, timeout=15).strip())
            if size > config.MAX_FILE_BYTES:
                skipped_size += 1
                continue
            raw = subprocess.run(["git", "show", f"{sha}:{path}"], cwd=repo,
                                 capture_output=True, timeout=60)
            if raw.returncode != 0 or b"\x00" in raw.stdout:
                continue  # unreadable or binary
            content = raw.stdout.decode("utf-8", errors="replace").strip("\n")
            parts.append(f"## file: {path}")
            parts.append("")
            if Path(path).suffix.lower() in {".md", ".mdx"}:
                parts.append(content)
            else:
                fence = _safe_fence(content)
                parts.append(f"{fence}\n{content}\n{fence}")
            parts.append("")
        if skipped_size:
            parts.append(f"_({skipped_size} file(s) skipped: over "
                         f"{config.MAX_FILE_BYTES // 1000}KB cap)_")

        return NormalizedDoc(markdown="\n".join(parts), version_id=sha,
                             title=f"{ref.repo_path}@{ref.branch}/{ref.glob}")
