"""Google Drive connector — M4, pending auth decision (service account vs OAuth).

Probe plan:  files.get(fields=modifiedTime,headRevisionId,md5Checksum)
Fetch plan:  Docs export as text/markdown; other types download + convert
"""

from .base import NotConfigured


class GDriveConnector:
    def probe(self, ref) -> str:
        raise NotConfigured("Google Drive connector is planned (M4) but not yet enabled")

    def fetch(self, ref):
        raise NotConfigured("Google Drive connector is planned (M4) but not yet enabled")
