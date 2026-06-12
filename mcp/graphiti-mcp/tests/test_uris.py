"""Tests for graphiti_mcp.uris — pure unit, no network."""

import pytest

from graphiti_mcp.uris import (
    ExternalRef,
    RepoRef,
    UriError,
    docref_id,
    parse,
    source_type_of,
)


# ---------------------------------------------------------------------------
# source_type_of
# ---------------------------------------------------------------------------

class TestSourceTypeOf:
    def test_repo_scheme(self):
        assert source_type_of("repo://github.com/org/repo@main/docs/**/*.md") == "codebase"

    def test_confluence_scheme(self):
        assert source_type_of("confluence://mysite/SPACE/12345") == "confluence"

    def test_gdrive_scheme(self):
        assert source_type_of("gdrive://some-file-id") == "gdrive"

    def test_unsupported_scheme_raises(self):
        with pytest.raises(UriError):
            source_type_of("s3://bucket/key")

    def test_no_scheme_raises(self):
        with pytest.raises(UriError):
            source_type_of("github.com/org/repo")


# ---------------------------------------------------------------------------
# parse — remote repo URIs
# ---------------------------------------------------------------------------

class TestParseRemoteRepo:
    def test_full_remote_uri(self):
        uri = "repo://github.com/org/repo@main/docs/**/*.md"
        ref = parse(uri)
        assert isinstance(ref, RepoRef)
        assert ref.host == "github.com"
        assert ref.repo_path == "org/repo"
        assert ref.branch == "main"
        assert ref.glob == "docs/**/*.md"
        assert ref.uri == uri

    def test_remote_branch_only_defaults_glob(self):
        uri = "repo://github.com/org/repo@main"
        ref = parse(uri)
        assert isinstance(ref, RepoRef)
        assert ref.branch == "main"
        assert ref.glob == "**/*.md"

    def test_clone_url_constructed(self):
        ref = parse("repo://github.com/org/repo@main/docs/**/*.md")
        assert isinstance(ref, RepoRef)
        assert ref.clone_url == "https://github.com/org/repo.git"

    def test_not_local(self):
        ref = parse("repo://github.com/org/repo@main")
        assert isinstance(ref, RepoRef)
        assert not ref.is_local

    def test_remote_missing_at_raises(self):
        with pytest.raises(UriError):
            parse("repo://github.com/org/repo/main")

    def test_remote_too_few_path_parts_raises(self):
        # Only host/repo — no owner segment
        with pytest.raises(UriError):
            parse("repo://github.com/repo@main")


# ---------------------------------------------------------------------------
# parse — local repo URIs
# ---------------------------------------------------------------------------

class TestParseLocalRepo:
    def test_local_abs_path(self):
        uri = "repo://local/abs/path@main/*.md"
        ref = parse(uri)
        assert isinstance(ref, RepoRef)
        assert ref.host == "local"
        assert ref.repo_path == "/abs/path"
        assert ref.branch == "main"
        assert ref.glob == "*.md"

    def test_local_is_local(self):
        ref = parse("repo://local/abs/path@main/*.md")
        assert isinstance(ref, RepoRef)
        assert ref.is_local

    def test_local_clone_url_raises(self):
        ref = parse("repo://local/abs/path@main/*.md")
        assert isinstance(ref, RepoRef)
        with pytest.raises(UriError):
            _ = ref.clone_url

    def test_local_branch_only_defaults_glob(self):
        uri = "repo://local/some/dir@develop"
        ref = parse(uri)
        assert isinstance(ref, RepoRef)
        assert ref.glob == "**/*.md"
        assert ref.branch == "develop"


# ---------------------------------------------------------------------------
# parse — external refs (confluence / gdrive)
# ---------------------------------------------------------------------------

class TestParseExternal:
    def test_confluence(self):
        uri = "confluence://mysite/SPACE/12345"
        ref = parse(uri)
        assert isinstance(ref, ExternalRef)
        assert ref.source_type == "confluence"
        assert ref.uri == uri

    def test_gdrive(self):
        uri = "gdrive://1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
        ref = parse(uri)
        assert isinstance(ref, ExternalRef)
        assert ref.source_type == "gdrive"
        assert ref.uri == uri


# ---------------------------------------------------------------------------
# parse — error cases
# ---------------------------------------------------------------------------

class TestParseErrors:
    def test_missing_at_raises(self):
        with pytest.raises(UriError, match="@"):
            parse("repo://github.com/org/repo/main/docs/**/*.md")

    def test_unsupported_scheme_raises(self):
        with pytest.raises(UriError):
            parse("s3://bucket/key")

    def test_empty_confluence_raises(self):
        # confluence:// with nothing after is caught
        with pytest.raises(UriError):
            parse("confluence://")


# ---------------------------------------------------------------------------
# docref_id
# ---------------------------------------------------------------------------

class TestDocrefId:
    def test_same_uri_same_id(self):
        uri = "repo://github.com/org/repo@main/docs/**/*.md"
        assert docref_id(uri) == docref_id(uri)

    def test_different_uri_different_id(self):
        uri_a = "repo://github.com/org/repo@main/docs/**/*.md"
        uri_b = "repo://github.com/org/other@main/docs/**/*.md"
        assert docref_id(uri_a) != docref_id(uri_b)

    def test_id_contains_sha8(self):
        import hashlib
        uri = "repo://github.com/org/repo@main"
        expected_suffix = hashlib.sha256(uri.encode()).hexdigest()[:8]
        assert docref_id(uri).endswith(expected_suffix)

    def test_id_is_string(self):
        assert isinstance(docref_id("repo://github.com/org/repo@main"), str)
