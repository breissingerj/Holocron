"""graphiti-core client factory + entity types.

Ported from Holocron/pi/extensions/graphiti-memory/graphiti_cli.py so both
access paths share the exact same graph semantics.
"""

from . import config
from . import _patches  # noqa: F401  — applies graphiti-core monkey-patches on import

_ENTITY_TYPE_DEFS = [
    ("Preference",   "User preferences, choices, opinions, or selections"),
    ("Requirement",  "Specific needs, features, or functionality that must be fulfilled"),
    ("Procedure",    "Standard operating procedures and sequential instructions"),
    ("Location",     "Physical or virtual places where activities occur"),
    ("Event",        "Time-bound activities, occurrences, or experiences"),
    ("Organization", "Companies, institutions, groups, or formal entities"),
    ("Document",     "Information content in various forms (books, articles, reports, videos, etc.)"),
    ("Topic",        "Subject of conversation, interest, or knowledge domain (fallback)"),
    ("Object",       "Physical items, tools, devices, or possessions (fallback)"),
]


def build_entity_types():
    """Return the entity_types mapping for Graphiti.add_episode.

    graphiti-core expects ``dict[str, type[BaseModel]]``: each value is a Pydantic
    model whose docstring becomes the extraction guidance surfaced to the LLM.
    We build documentation-only models (no fields) from the definitions above.
    Returns None if pydantic is unavailable so add_episode falls back to default
    extraction behavior.
    """
    try:
        from pydantic import create_model

        result: dict[str, type] = {}
        for name, description in _ENTITY_TYPE_DEFS:
            model = create_model(name)
            model.__doc__ = description
            result[name] = model
        return result
    except Exception:
        return None


# ── Singleton cache (one Graphiti instance per group_id) ─────────────────────
# FalkorDriver fires loop.create_task(build_indices_and_constraints()) in its
# __init__. Creating a new driver per tool call floods FalkorDB with concurrent
# index queries. Cache instances so each group_id initialises exactly once.

_cache: dict[str, "Graphiti"] = {}


def make_graphiti(group_id: str | None = None):
    """Return (or create) a cached Graphiti instance for the given group.

    Call close_all_graphiti() on server shutdown to release connections.
    Do NOT call g.close() after individual tool calls — the instance is shared.
    """
    from graphiti_core import Graphiti
    from graphiti_core.driver.falkordb_driver import FalkorDriver
    from graphiti_core.llm_client.openai_client import OpenAIClient
    from graphiti_core.llm_client.config import LLMConfig
    from graphiti_core.embedder.openai import OpenAIEmbedder, OpenAIEmbedderConfig

    gid = group_id or config.DEFAULT_GROUP_ID
    if gid in _cache:
        return _cache[gid]
    driver = FalkorDriver(host=config.FALKORDB_HOST, port=config.FALKORDB_PORT,
                          password=config.FALKORDB_PASSWORD, database=gid)
    llm = OpenAIClient(config=LLMConfig(model=config.LLM_MODEL))
    embedder = OpenAIEmbedder(config=OpenAIEmbedderConfig(embedding_model=config.EMBED_MODEL))
    instance = Graphiti(graph_driver=driver, llm_client=llm, embedder=embedder)
    _cache[gid] = instance
    return instance


async def close_all_graphiti() -> None:
    """Close all cached Graphiti instances (call from server lifespan shutdown)."""
    for gid, g in list(_cache.items()):
        try:
            await g.close()
        except Exception:
            pass
    _cache.clear()
