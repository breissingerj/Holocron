from .base import Connector, NormalizedDoc, NotConfigured, ProbeError
from .codebase import CodebaseConnector
from .confluence import ConfluenceConnector
from .gdrive import GDriveConnector

_CONNECTORS = {
    "codebase": CodebaseConnector(),
    "confluence": ConfluenceConnector(),
    "gdrive": GDriveConnector(),
}


def get_connector(source_type: str) -> Connector:
    try:
        return _CONNECTORS[source_type]
    except KeyError:
        raise NotConfigured(f"no connector for source type {source_type!r}")


__all__ = ["Connector", "NormalizedDoc", "NotConfigured", "ProbeError", "get_connector"]
