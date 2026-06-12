"""Canonical DocRef URI parsing.

Supported schemes:
  repo://<host>/<owner>/<repo>@<branch>/<path-glob>     remote git repo
  repo://local/<absolute-path>@<branch>/<path-glob>     local git checkout
  confluence://<site>/<space>/<pageId>                  recognized, not yet enabled
  gdrive://<fileId>                                     recognized, not yet enabled

The path-glob is matched (fnmatch) against committed file paths at the branch
head. Omitting the glob defaults to "**/*.md".
"""

import hashlib
import re
from dataclasses import dataclass


class UriError(ValueError):
    pass


@dataclass(frozen=True)
class RepoRef:
    uri: str
    host: str          # "local" or a git host like "github.com"
    repo_path: str     # "owner/repo" for remote, absolute path for local
    branch: str
    glob: str

    @property
    def is_local(self) -> bool:
        return self.host == "local"

    @property
    def clone_url(self) -> str:
        if self.is_local:
            raise UriError(f"local repo has no clone url: {self.uri}")
        return f"https://{self.host}/{self.repo_path}.git"


@dataclass(frozen=True)
class ExternalRef:
    uri: str
    source_type: str  # confluence | gdrive


def source_type_of(uri: str) -> str:
    scheme = uri.split("://", 1)[0] if "://" in uri else ""
    if scheme == "repo":
        return "codebase"
    if scheme in ("confluence", "gdrive"):
        return scheme
    raise UriError(f"unsupported URI scheme: {uri!r} (expected repo://, confluence://, gdrive://)")


def parse(uri: str) -> RepoRef | ExternalRef:
    stype = source_type_of(uri)
    if stype in ("confluence", "gdrive"):
        rest = uri.split("://", 1)[1]
        if not rest:
            raise UriError(f"empty {stype} URI: {uri!r}")
        return ExternalRef(uri=uri, source_type=stype)

    body = uri[len("repo://"):]
    if "@" not in body:
        raise UriError(f"repo URI must contain @<branch>: {uri!r}")
    left, right = body.rsplit("@", 1)
    if "/" in right:
        branch, glob = right.split("/", 1)
    else:
        branch, glob = right, "**/*.md"
    if not branch:
        raise UriError(f"missing branch in repo URI: {uri!r}")

    if left.startswith("local/"):
        local_path = "/" + left[len("local/"):]
        if local_path == "/":
            raise UriError(f"missing local path in repo URI: {uri!r}")
        return RepoRef(uri=uri, host="local", repo_path=local_path, branch=branch, glob=glob)

    parts = left.split("/")
    if len(parts) < 3:
        raise UriError(f"remote repo URI needs <host>/<owner>/<repo>: {uri!r}")
    host, repo_path = parts[0], "/".join(parts[1:])
    return RepoRef(uri=uri, host=host, repo_path=repo_path, branch=branch, glob=glob)


def docref_id(uri: str) -> str:
    """Stable, human-scannable slug: <tail>-<sha8>."""
    digest = hashlib.sha256(uri.encode()).hexdigest()[:8]
    tail = re.sub(r"[^a-zA-Z0-9]+", "-", uri.split("://", 1)[-1]).strip("-").lower()
    tail = tail[-40:].lstrip("-")
    return f"{tail}-{digest}"
