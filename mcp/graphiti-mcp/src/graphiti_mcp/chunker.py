"""Normalization + section-anchored chunking.

Chunks split on markdown header boundaries (fence-aware) so a one-paragraph
edit doesn't shift every chunk boundary. NORM_VERSION is stored per docref:
bumping it forces re-hash rather than misreading a normalizer change as a
content change.
"""

import hashlib
import re
from dataclasses import dataclass

from . import config

NORM_VERSION = 1

_HEADER_RE = re.compile(r"^#{1,6}\s+(.*)$")
_FENCE_RE = re.compile(r"^(```|~~~)")


@dataclass(frozen=True)
class Chunk:
    anchor: str
    text: str
    hash: str


def normalize(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    lines = [line.rstrip() for line in text.split("\n")]
    out = "\n".join(lines)
    out = re.sub(r"\n{4,}", "\n\n\n", out)
    return out.strip("\n") + "\n"


def content_hash(normalized: str) -> str:
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def slugify(s: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", s).strip("-").lower()
    return slug[:60] or "section"


def _split_sections(markdown: str) -> list[tuple[str, list[str]]]:
    """Split on header lines, ignoring headers inside code fences."""
    sections: list[tuple[str, list[str]]] = []
    title, buf = "preamble", []
    in_fence = False
    for line in markdown.split("\n"):
        if _FENCE_RE.match(line):
            in_fence = not in_fence
        m = None if in_fence else _HEADER_RE.match(line)
        if m:
            if buf and any(l.strip() for l in buf):
                sections.append((title, buf))
            title, buf = m.group(1).strip(), [line]
        else:
            buf.append(line)
    if buf and any(l.strip() for l in buf):
        sections.append((title, buf))
    return sections


def _split_oversize(text: str, soft_max: int) -> list[str]:
    """Split an oversized section on blank lines, packing up to soft_max."""
    parts, current, size = [], [], 0
    for para in text.split("\n\n"):
        plen = len(para) + 2
        if current and size + plen > soft_max:
            parts.append("\n\n".join(current))
            current, size = [], 0
        current.append(para)
        size += plen
    if current:
        parts.append("\n\n".join(current))
    return parts


def chunk(markdown: str, soft_max: int | None = None) -> list[Chunk]:
    soft_max = soft_max or config.CHUNK_SOFT_MAX
    chunks: list[Chunk] = []
    seen: dict[str, int] = {}

    def add(anchor: str, text: str) -> None:
        n = seen.get(anchor, 0) + 1
        seen[anchor] = n
        final = anchor if n == 1 else f"{anchor}-{n}"
        chunks.append(Chunk(anchor=final, text=text, hash=content_hash(text)))

    for title, lines in _split_sections(markdown):
        text = "\n".join(lines).strip("\n")
        anchor = slugify(title)
        if len(text) <= soft_max:
            add(anchor, text)
        else:
            for i, part in enumerate(_split_oversize(text, soft_max), 1):
                add(f"{anchor}-p{i}" if i > 1 else anchor, part)
    return chunks
