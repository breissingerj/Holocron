"""Environment-driven configuration for graphiti-mcp.

Secrets (OPENAI_API_KEY, FALKORDB_PASSWORD) are read from the environment;
inject via 1Password: `op run --env-file=...` or harness env config.
"""

import os
from pathlib import Path

# ── Graph backend (same env contract as the pi extension's graphiti_cli.py) ──
FALKORDB_HOST = os.environ.get("FALKORDB_HOST", "graphiti.breissinger.dev")
FALKORDB_PORT = int(os.environ.get("FALKORDB_PORT", "6379"))
FALKORDB_PASSWORD = os.environ.get("FALKORDB_PASSWORD") or None
DEFAULT_GROUP_ID = os.environ.get("GRAPHITI_GROUP_ID", "jbreissinger")
LLM_MODEL = os.environ.get("GRAPHITI_LLM_MODEL", "gpt-4.1-mini")
EMBED_MODEL = os.environ.get("GRAPHITI_EMBED_MODEL", "text-embedding-3-small")

# ── Local state ──────────────────────────────────────────────────────────────
HOME = Path(os.environ.get("GRAPHITI_MCP_HOME", str(Path.home() / ".graphiti-mcp")))
REGISTRY_PATH = Path(os.environ.get("GRAPHITI_MCP_REGISTRY", str(HOME / "registry.db")))
CACHE_DIR = Path(os.environ.get("GRAPHITI_MCP_CACHE", str(HOME / "cache")))
REPOS_DIR = HOME / "repos"  # bare mirrors of remote repos

# ── DocRef behavior ──────────────────────────────────────────────────────────
TTL_DEFAULTS = {  # seconds; overridable per docref at registration
    "codebase": 6 * 3600,
    "confluence": 24 * 3600,
    "gdrive": 24 * 3600,
}
CIRCUIT_BREAKER_THRESHOLD = int(os.environ.get("GRAPHITI_MCP_CB_THRESHOLD", "5"))
CIRCUIT_BREAKER_COOLOFF_SECONDS = int(os.environ.get("GRAPHITI_MCP_CB_COOLOFF", str(30 * 60)))
MAX_FILE_BYTES = int(os.environ.get("GRAPHITI_MCP_MAX_FILE_BYTES", "100000"))
CHUNK_SOFT_MAX = int(os.environ.get("GRAPHITI_MCP_CHUNK_SOFT_MAX", "6000"))
PRUNE_KEEP_VERSIONS = int(os.environ.get("GRAPHITI_MCP_PRUNE_KEEP", "3"))


def ensure_dirs() -> None:
    HOME.mkdir(parents=True, exist_ok=True)
    REGISTRY_PATH.parent.mkdir(parents=True, exist_ok=True)
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    REPOS_DIR.mkdir(parents=True, exist_ok=True)
