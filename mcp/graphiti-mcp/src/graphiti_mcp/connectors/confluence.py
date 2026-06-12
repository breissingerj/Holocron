"""Confluence connector — M3, pending auth decision (API token via 1Password).

Probe plan:  GET /pages/{id}?fields=version  (REST v2)
Fetch plan:  page body -> markdown conversion
"""

from .base import NotConfigured


class ConfluenceConnector:
    def probe(self, ref) -> str:
        raise NotConfigured("Confluence connector is planned (M3) but not yet enabled")

    def fetch(self, ref):
        raise NotConfigured("Confluence connector is planned (M3) but not yet enabled")
