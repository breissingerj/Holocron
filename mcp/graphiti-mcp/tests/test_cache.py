"""Tests for graphiti_mcp.cache — pure unit, uses tmp_path, no network."""

import json

import pytest

from graphiti_mcp import cache


class TestCacheWriteRead:
    def test_write_returns_path(self, tmp_path):
        p = cache.write("doc-1", "# Hello\n", "v1", base=tmp_path)
        assert p.exists()
        assert p.name == "content.md"

    def test_read_roundtrip(self, tmp_path):
        markdown = "# Hello\n\nSome content here.\n"
        cache.write("doc-1", markdown, "v1", base=tmp_path)
        result = cache.read("doc-1", base=tmp_path)
        assert result == markdown

    def test_read_unknown_returns_none(self, tmp_path):
        result = cache.read("does-not-exist", base=tmp_path)
        assert result is None

    def test_meta_roundtrip(self, tmp_path):
        cache.write("doc-1", "# Hello\n", "sha-abc123", base=tmp_path)
        m = cache.meta("doc-1", base=tmp_path)
        assert m is not None
        assert m["version_id"] == "sha-abc123"
        assert "fetched_at" in m
        assert m["chars"] == len("# Hello\n")

    def test_meta_unknown_returns_none(self, tmp_path):
        assert cache.meta("no-such-doc", base=tmp_path) is None


class TestCacheRemove:
    def test_remove_deletes_directory(self, tmp_path):
        cache.write("doc-1", "content", "v1", base=tmp_path)
        cache.remove("doc-1", base=tmp_path)
        assert not (tmp_path / "doc-1").exists()

    def test_read_after_remove_returns_none(self, tmp_path):
        cache.write("doc-1", "content", "v1", base=tmp_path)
        cache.remove("doc-1", base=tmp_path)
        assert cache.read("doc-1", base=tmp_path) is None

    def test_remove_nonexistent_is_noop(self, tmp_path):
        # Should not raise
        cache.remove("nonexistent", base=tmp_path)


class TestCacheIsolation:
    def test_multiple_docs_isolated(self, tmp_path):
        cache.write("doc-a", "content A", "v1", base=tmp_path)
        cache.write("doc-b", "content B", "v2", base=tmp_path)
        assert cache.read("doc-a", base=tmp_path) == "content A"
        assert cache.read("doc-b", base=tmp_path) == "content B"

    def test_overwrite_updates_content(self, tmp_path):
        cache.write("doc-1", "first", "v1", base=tmp_path)
        cache.write("doc-1", "second", "v2", base=tmp_path)
        assert cache.read("doc-1", base=tmp_path) == "second"

    def test_overwrite_updates_meta_version(self, tmp_path):
        cache.write("doc-1", "first", "v1", base=tmp_path)
        cache.write("doc-1", "second", "v2", base=tmp_path)
        m = cache.meta("doc-1", base=tmp_path)
        assert m["version_id"] == "v2"
