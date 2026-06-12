"""graphiti-core client factory + entity types.

Ported from Holocron/pi/extensions/graphiti-memory/graphiti_cli.py so both
access paths share the exact same graph semantics.
"""

from . import config

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


def make_graphiti(group_id: str | None = None):
    """Create a Graphiti instance connected to the given group's FalkorDB graph."""
    from graphiti_core import Graphiti
    from graphiti_core.driver.falkordb_driver import FalkorDriver
    from graphiti_core.llm_client.openai_client import OpenAIClient
    from graphiti_core.llm_client.config import LLMConfig
    from graphiti_core.embedder.openai import OpenAIEmbedder, OpenAIEmbedderConfig

    group_id = group_id or config.DEFAULT_GROUP_ID
    driver = FalkorDriver(host=config.FALKORDB_HOST, port=config.FALKORDB_PORT,
                          password=config.FALKORDB_PASSWORD, database=group_id)
    llm = OpenAIClient(config=LLMConfig(model=config.LLM_MODEL))
    embedder = OpenAIEmbedder(config=OpenAIEmbedderConfig(embedding_model=config.EMBED_MODEL))
    return Graphiti(graph_driver=driver, llm_client=llm, embedder=embedder)
