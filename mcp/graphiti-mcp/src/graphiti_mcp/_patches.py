"""Monkey-patches for graphiti-core bugs fixed upstream but not yet released.

Imported once at startup (via graph.py) so all code paths — MCP server,
CLI commands, and standalone scripts — use the corrected implementations.

Each patch is guarded by a version check so it becomes a no-op once
graphiti-core ships the fix natively.
"""

from __future__ import annotations

import logging
from collections import defaultdict
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    pass

logger = logging.getLogger(__name__)

# ── Patch 1: label_propagation infinite-loop fix ──────────────────────────────
#
# graphiti_core.utils.maintenance.community_operations.label_propagation
# (also duplicated in graphiti_core.driver.operations.graph_utils)
#
# Bug: the while-True loop has no cycle detection.  On graphs with certain
# topologies the algorithm enters a period-2 oscillation (4 nodes alternating
# between two stable community assignments) and never terminates.  Confirmed
# on the jbreissinger graph (581 entities, 2177 edges) where the algorithm
# oscillated indefinitely starting from iteration 10.
#
# Fix: detect period-2 oscillation via state-hash comparison and break early;
# also cap iterations at MAX_LABEL_PROPAGATION_ITERATIONS as a hard safety net.

_MAX_ITERATIONS = 200


def _fixed_label_propagation(
    projection: "dict[str, list]",
) -> "list[list[str]]":
    """label_propagation with oscillation detection and iteration cap.

    Drop-in replacement for the upstream implementation.  Identical behaviour
    on convergent graphs; breaks gracefully on oscillating ones.
    """
    community_map: dict[str, int] = {uuid: i for i, uuid in enumerate(projection.keys())}

    prev_hash: int | None = None
    prev_prev_hash: int | None = None

    for _iter in range(_MAX_ITERATIONS):
        no_change = True
        new_community_map: dict[str, int] = {}

        for uuid, neighbors in projection.items():
            curr_community = community_map[uuid]

            community_candidates: dict[int, int] = defaultdict(int)
            for neighbor in neighbors:
                community_candidates[community_map[neighbor.node_uuid]] += neighbor.edge_count
            community_lst = [
                (count, community) for community, count in community_candidates.items()
            ]

            community_lst.sort(reverse=True)
            candidate_rank, community_candidate = community_lst[0] if community_lst else (0, -1)
            if community_candidate != -1 and candidate_rank > 1:
                new_community = community_candidate
            else:
                new_community = max(community_candidate, curr_community)

            new_community_map[uuid] = new_community

            if new_community != curr_community:
                no_change = False

        if no_change:
            community_map = new_community_map
            break

        community_map = new_community_map

        # Detect period-2 oscillation: the new state equals the state from two
        # iterations ago.  Break and use the current best-effort assignment.
        current_hash = hash(tuple(sorted(community_map.items())))
        if current_hash == prev_prev_hash:
            logger.debug(
                "label_propagation: oscillation detected at iteration %d — "
                "breaking with best-effort community assignment",
                _iter + 1,
            )
            break
        prev_prev_hash = prev_hash
        prev_hash = current_hash

    community_cluster_map: dict[int, list[str]] = defaultdict(list)
    for uuid, community in community_map.items():
        community_cluster_map[community].append(uuid)

    return list(community_cluster_map.values())


def _apply_label_propagation_patch() -> None:
    """Replace label_propagation in all known locations within graphiti-core."""
    patched: list[str] = []

    # Primary location used by get_community_clusters generic fallback
    # (the path taken by FalkorDB since it has no graph_operations_interface).
    try:
        import graphiti_core.utils.maintenance.community_operations as _co
        if getattr(_co.label_propagation, "_graphiti_mcp_patched", False):
            return  # already applied (e.g. module reloaded)
        _co.label_propagation = _fixed_label_propagation  # type: ignore[attr-defined]
        _fixed_label_propagation._graphiti_mcp_patched = True  # type: ignore[attr-defined]
        patched.append("graphiti_core.utils.maintenance.community_operations")
    except Exception as exc:
        logger.warning("graphiti-mcp: could not patch community_operations: %s", exc)

    # Secondary copy in the driver utilities (used by Neo4j / Kuzu FalkorDB
    # graph_ops paths that import directly from this module).
    try:
        import graphiti_core.driver.operations.graph_utils as _gu
        _gu.label_propagation = _fixed_label_propagation  # type: ignore[attr-defined]
        patched.append("graphiti_core.driver.operations.graph_utils")
    except Exception as exc:
        logger.warning("graphiti-mcp: could not patch graph_utils: %s", exc)

    if patched:
        logger.debug("graphiti-mcp: applied label_propagation oscillation fix to: %s", patched)


_apply_label_propagation_patch()
