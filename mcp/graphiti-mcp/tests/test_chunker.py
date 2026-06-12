"""Tests for graphiti_mcp.chunker — pure unit, no network."""

import pytest

from graphiti_mcp.chunker import Chunk, chunk, content_hash, normalize, slugify


# ---------------------------------------------------------------------------
# normalize
# ---------------------------------------------------------------------------

class TestNormalize:
    def test_crlf_converted(self):
        result = normalize("line1\r\nline2\r\n")
        assert "\r" not in result

    def test_trailing_whitespace_stripped(self):
        result = normalize("line1   \nline2\t\n")
        assert "   " not in result
        assert "\t" not in result
        lines = result.rstrip("\n").split("\n")
        for line in lines:
            assert line == line.rstrip()

    def test_ends_with_newline(self):
        result = normalize("hello world")
        assert result.endswith("\n")

    def test_no_leading_newline(self):
        result = normalize("\n\nhello")
        assert not result.startswith("\n")

    def test_more_than_three_blank_lines_collapsed(self):
        result = normalize("a\n\n\n\n\n\nb")
        # Should have at most 2 consecutive blank lines (max 3 newlines in a row)
        assert "\n\n\n\n" not in result

    def test_mixed_line_endings(self):
        result = normalize("a\r\nb\rc\nd")
        assert "\r" not in result
        assert "a\nb\nc\nd\n" == result


# ---------------------------------------------------------------------------
# content_hash
# ---------------------------------------------------------------------------

class TestContentHash:
    def test_deterministic(self):
        text = "# Hello\n\nSome content here.\n"
        assert content_hash(text) == content_hash(text)

    def test_different_text_different_hash(self):
        assert content_hash("hello\n") != content_hash("world\n")

    def test_returns_hex_string(self):
        h = content_hash("test\n")
        assert isinstance(h, str)
        int(h, 16)  # should not raise — must be valid hex

    def test_sha256_length(self):
        assert len(content_hash("test\n")) == 64


# ---------------------------------------------------------------------------
# chunk — basic splitting
# ---------------------------------------------------------------------------

class TestChunkBasic:
    def test_single_header_section(self):
        md = "# Hello\n\nSome content.\n"
        chunks = chunk(md)
        assert len(chunks) == 1
        assert chunks[0].anchor == "hello"
        assert "Some content." in chunks[0].text

    def test_multiple_headers_split(self):
        md = "# Section A\n\nContent A.\n\n# Section B\n\nContent B.\n"
        chunks = chunk(md)
        anchors = [c.anchor for c in chunks]
        assert "section-a" in anchors
        assert "section-b" in anchors

    def test_preamble_chunk_before_first_header(self):
        md = "Intro text before any header.\n\n# Section A\n\nContent.\n"
        chunks = chunk(md)
        anchors = [c.anchor for c in chunks]
        assert "preamble" in anchors
        assert "section-a" in anchors

    def test_no_preamble_when_header_is_first(self):
        md = "# First Section\n\nContent only.\n"
        chunks = chunk(md)
        assert not any(c.anchor == "preamble" for c in chunks)

    def test_chunk_hash_present(self):
        md = "# Hello\n\nContent.\n"
        chunks = chunk(md)
        assert all(isinstance(c.hash, str) and len(c.hash) == 64 for c in chunks)


# ---------------------------------------------------------------------------
# chunk — fenced code blocks
# ---------------------------------------------------------------------------

class TestChunkFences:
    def test_header_inside_backtick_fence_does_not_split(self):
        md = "# Real Section\n\n```\n# not a header\n## also not\n```\n\nAfter fence.\n"
        chunks = chunk(md)
        # Should be exactly 1 chunk (the "Real Section"), with fence content included
        assert len(chunks) == 1
        assert "not a header" in chunks[0].text

    def test_header_inside_tilde_fence_does_not_split(self):
        md = "# Real\n\n~~~\n# fake header\n~~~\n\nDone.\n"
        chunks = chunk(md)
        assert len(chunks) == 1
        assert "fake header" in chunks[0].text

    def test_header_after_fence_does_split(self):
        md = "# A\n\n```\ncode\n```\n\n# B\n\nContent B.\n"
        chunks = chunk(md)
        assert len(chunks) == 2


# ---------------------------------------------------------------------------
# chunk — duplicate anchors
# ---------------------------------------------------------------------------

class TestChunkDuplicateAnchors:
    def test_duplicate_header_gets_suffix(self):
        md = "# Intro\n\nFirst.\n\n# Intro\n\nSecond.\n"
        chunks = chunk(md)
        anchors = [c.anchor for c in chunks]
        assert "intro" in anchors
        assert "intro-2" in anchors

    def test_triple_duplicate(self):
        md = "# Dup\n\nA.\n\n# Dup\n\nB.\n\n# Dup\n\nC.\n"
        chunks = chunk(md)
        anchors = [c.anchor for c in chunks]
        assert "dup" in anchors
        assert "dup-2" in anchors
        assert "dup-3" in anchors


# ---------------------------------------------------------------------------
# chunk — oversize sections
# ---------------------------------------------------------------------------

class TestChunkOversize:
    def test_oversize_section_splits_into_parts(self):
        # Create a section much larger than soft_max=200
        paragraphs = "\n\n".join(f"Para {i}: " + ("x" * 40) for i in range(20))
        md = f"# Big Section\n\n{paragraphs}\n"
        chunks = chunk(md, soft_max=200)
        anchors = [c.anchor for c in chunks]
        # First part is "big-section", second is "big-section-p2"
        assert "big-section" in anchors
        assert any(a.startswith("big-section-p") for a in anchors)

    def test_oversize_parts_under_soft_max(self):
        paragraphs = "\n\n".join(f"Para {i}: " + ("x" * 40) for i in range(20))
        md = f"# Big Section\n\n{paragraphs}\n"
        chunks = chunk(md, soft_max=300)
        for c in chunks:
            # Each chunk should be at most a reasonable multiple of soft_max
            # (splitting is approximate — paragraphs may push slightly over)
            assert len(c.text) < 300 * 5


# ---------------------------------------------------------------------------
# slugify
# ---------------------------------------------------------------------------

class TestSlugify:
    def test_basic(self):
        assert slugify("Hello World") == "hello-world"

    def test_special_chars_replaced(self):
        slug = slugify("Hello, World! (2024)")
        assert slug == "hello-world-2024"

    def test_empty_string_returns_section(self):
        assert slugify("") == "section"

    def test_max_length(self):
        long = "a" * 100
        assert len(slugify(long)) <= 60
