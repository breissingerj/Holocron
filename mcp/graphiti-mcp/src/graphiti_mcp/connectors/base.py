"""Connector contract shared by all live-document sources."""

from dataclasses import dataclass
from typing import Protocol


class NotConfigured(Exception):
    """Connector recognized but not yet enabled (pending auth decisions)."""


class ProbeError(Exception):
    """Cheap version check failed (network, auth, missing ref)."""


@dataclass(frozen=True)
class NormalizedDoc:
    markdown: str
    version_id: str
    title: str


class Connector(Protocol):
    def probe(self, ref) -> str:
        """Return the current version identifier. Cheap — never downloads content."""
        ...

    def fetch(self, ref) -> NormalizedDoc:
        """Fetch full content and normalize to markdown."""
        ...
