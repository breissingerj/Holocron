"""Tests for graphiti_mcp.connectors.codebase pure helpers + local git integration.

No network. Remote-git paths are NOT tested here.
"""

import subprocess
from pathlib import Path

import pytest

from graphiti_mcp.connectors.codebase import (
    CodebaseConnector,
    _glob_has_explicit_extension,
    _glob_matches,
    _is_selected,
)
from graphiti_mcp.uris import RepoRef


# ---------------------------------------------------------------------------
# _glob_matches
# ---------------------------------------------------------------------------

class TestGlobMatches:
    def test_wildcard_md_matches_nested(self):
        assert _glob_matches("docs/guide/intro.md", "**/*.md")

    def test_wildcard_md_matches_top_level(self):
        # top-level .md file — fnmatch("README.md", "**/*.md") is False in stdlib,
        # but _glob_matches handles this via the tail fallback
        assert _glob_matches("README.md", "**/*.md")

    def test_wildcard_py_matches_nested(self):
        assert _glob_matches("src/foo/bar.py", "**/*.py")

    def test_wildcard_py_matches_top_level(self):
        assert _glob_matches("main.py", "**/*.py")

    def test_no_match_wrong_extension(self):
        assert not _glob_matches("script.py", "**/*.md")

    def test_exact_glob_matches(self):
        assert _glob_matches("README.md", "README.md")

    def test_pattern_with_specific_dir(self):
        assert _glob_matches("docs/intro.md", "docs/*.md")


# ---------------------------------------------------------------------------
# _glob_has_explicit_extension
# ---------------------------------------------------------------------------

class TestGlobHasExplicitExtension:
    def test_explicit_md(self):
        assert _glob_has_explicit_extension("**/*.md")

    def test_explicit_py(self):
        assert _glob_has_explicit_extension("**/*.py")

    def test_no_extension_generic(self):
        assert not _glob_has_explicit_extension("**/*")

    def test_wildcard_extension_not_explicit(self):
        # The suffix of "**/*" is "" — no extension
        assert not _glob_has_explicit_extension("**/*")

    def test_explicit_txt(self):
        assert _glob_has_explicit_extension("docs/**/*.txt")


# ---------------------------------------------------------------------------
# _is_selected — blocked segments
# ---------------------------------------------------------------------------

class TestIsSelectedBlockedSegments:
    def test_node_modules_blocked(self):
        assert not _is_selected("node_modules/some-pkg/README.md", "**/*.md")

    def test_dist_blocked(self):
        assert not _is_selected("dist/bundle.md", "**/*.md")

    def test_build_blocked(self):
        assert not _is_selected("build/output.md", "**/*.md")

    def test_git_blocked(self):
        assert not _is_selected(".git/COMMIT_EDITMSG", "**/*")

    def test_pycache_blocked(self):
        assert not _is_selected("src/__pycache__/mod.md", "**/*.md")

    def test_venv_blocked(self):
        assert not _is_selected(".venv/lib/README.md", "**/*.md")

    def test_nested_node_modules_blocked(self):
        assert not _is_selected("packages/foo/node_modules/x.md", "**/*.md")


# ---------------------------------------------------------------------------
# _is_selected — blocked file patterns
# ---------------------------------------------------------------------------

class TestIsSelectedBlockedFilePatterns:
    def test_lock_file_blocked(self):
        assert not _is_selected("package.lock", "**/*")

    def test_min_js_blocked(self):
        assert not _is_selected("dist/app.min.js", "**/*.js")

    def test_min_css_blocked(self):
        assert not _is_selected("styles/app.min.css", "**/*.css")

    def test_map_file_blocked(self):
        assert not _is_selected("app.js.map", "**/*")


# ---------------------------------------------------------------------------
# _is_selected — allowlist (generic glob enforces doc extensions)
# ---------------------------------------------------------------------------

class TestIsSelectedAllowlist:
    def test_md_allowed_with_generic_glob(self):
        assert _is_selected("docs/guide.md", "**/*")

    def test_txt_allowed_with_generic_glob(self):
        assert _is_selected("notes.txt", "**/*")

    def test_rst_allowed_with_generic_glob(self):
        assert _is_selected("docs/README.rst", "**/*")

    def test_py_blocked_with_generic_glob(self):
        assert not _is_selected("src/main.py", "**/*")

    def test_js_blocked_with_generic_glob(self):
        assert not _is_selected("app.js", "**/*")


# ---------------------------------------------------------------------------
# _is_selected — explicit extension bypasses allowlist
# ---------------------------------------------------------------------------

class TestIsSelectedExplicitExtension:
    def test_py_allowed_with_explicit_py_glob(self):
        assert _is_selected("src/module.py", "**/*.py")

    def test_js_allowed_with_explicit_js_glob(self):
        assert _is_selected("src/app.js", "**/*.js")

    def test_wrong_extension_still_filtered(self):
        # .ts file not matched by **/*.py glob
        assert not _is_selected("src/module.ts", "**/*.py")


# ---------------------------------------------------------------------------
# Helpers for building a local git repo in tmp_path
# ---------------------------------------------------------------------------

def _git(args: list[str], cwd: Path) -> str:
    res = subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True, timeout=30)
    if res.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)}: {res.stderr.strip()}")
    return res.stdout.strip()


def make_local_repo(tmp_path: Path) -> Path:
    """Create a minimal git repo with a .md file and a node_modules .md file."""
    repo = tmp_path / "testrepo"
    repo.mkdir()

    _git(["init"], cwd=repo)
    _git(["config", "user.email", "test@example.com"], cwd=repo)
    _git(["config", "user.name", "Test User"], cwd=repo)

    # Committed .md file at root
    (repo / "README.md").write_text("# Test Repo\n\nHello from README.\n", encoding="utf-8")

    # A nested .md file in docs/
    (repo / "docs").mkdir()
    (repo / "docs" / "guide.md").write_text("# Guide\n\nThis is the guide.\n", encoding="utf-8")

    # node_modules .md — should be blocked
    (repo / "node_modules").mkdir()
    (repo / "node_modules" / "x.md").write_text("# Should be blocked\n", encoding="utf-8")

    _git(["add", "."], cwd=repo)
    _git(["commit", "-m", "initial"], cwd=repo)

    # Rename default branch to 'main' explicitly
    _git(["branch", "-M", "main"], cwd=repo)

    return repo


# ---------------------------------------------------------------------------
# CodebaseConnector — local probe
# ---------------------------------------------------------------------------

class TestCodebaseConnectorProbe:
    def test_probe_returns_sha(self, tmp_path):
        repo = make_local_repo(tmp_path)
        ref = RepoRef(
            uri=f"repo://local{repo}@main",
            host="local",
            repo_path=str(repo),
            branch="main",
            glob="**/*.md",
        )
        connector = CodebaseConnector()
        sha = connector.probe(ref)
        assert isinstance(sha, str)
        assert len(sha) == 40  # full SHA-1

    def test_probe_missing_repo_raises(self, tmp_path):
        from graphiti_mcp.connectors.base import ProbeError
        ref = RepoRef(
            uri="repo://local/nonexistent/path@main",
            host="local",
            repo_path="/nonexistent/path",
            branch="main",
            glob="**/*.md",
        )
        connector = CodebaseConnector()
        with pytest.raises(ProbeError):
            connector.probe(ref)


# ---------------------------------------------------------------------------
# CodebaseConnector — local fetch
# ---------------------------------------------------------------------------

class TestCodebaseConnectorFetch:
    def test_fetch_returns_normalized_doc(self, tmp_path):
        repo = make_local_repo(tmp_path)
        ref = RepoRef(
            uri=f"repo://local{repo}@main",
            host="local",
            repo_path=str(repo),
            branch="main",
            glob="**/*.md",
        )
        connector = CodebaseConnector()
        doc = connector.fetch(ref)
        assert doc.markdown  # non-empty
        assert doc.version_id  # sha present
        assert len(doc.version_id) == 40

    def test_fetch_contains_readme_content(self, tmp_path):
        repo = make_local_repo(tmp_path)
        ref = RepoRef(
            uri=f"repo://local{repo}@main",
            host="local",
            repo_path=str(repo),
            branch="main",
            glob="**/*.md",
        )
        connector = CodebaseConnector()
        doc = connector.fetch(ref)
        assert "Hello from README" in doc.markdown

    def test_fetch_excludes_node_modules(self, tmp_path):
        repo = make_local_repo(tmp_path)
        ref = RepoRef(
            uri=f"repo://local{repo}@main",
            host="local",
            repo_path=str(repo),
            branch="main",
            glob="**/*.md",
        )
        connector = CodebaseConnector()
        doc = connector.fetch(ref)
        assert "Should be blocked" not in doc.markdown

    def test_fetch_version_id_matches_probe(self, tmp_path):
        repo = make_local_repo(tmp_path)
        ref = RepoRef(
            uri=f"repo://local{repo}@main",
            host="local",
            repo_path=str(repo),
            branch="main",
            glob="**/*.md",
        )
        connector = CodebaseConnector()
        sha_probe = connector.probe(ref)
        doc = connector.fetch(ref)
        assert doc.version_id == sha_probe


# ---------------------------------------------------------------------------
# config.TTL_DEFAULTS
# ---------------------------------------------------------------------------

class TestTTLDefaults:
    def test_has_codebase_key(self):
        from graphiti_mcp import config
        assert "codebase" in config.TTL_DEFAULTS

    def test_has_confluence_key(self):
        from graphiti_mcp import config
        assert "confluence" in config.TTL_DEFAULTS

    def test_has_gdrive_key(self):
        from graphiti_mcp import config
        assert "gdrive" in config.TTL_DEFAULTS

    def test_values_are_positive_ints(self):
        from graphiti_mcp import config
        for key, val in config.TTL_DEFAULTS.items():
            assert isinstance(val, int), f"{key} TTL should be int"
            assert val > 0, f"{key} TTL should be positive"
