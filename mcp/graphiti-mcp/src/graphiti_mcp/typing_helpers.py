"""Pure helpers translating MCP tool args into graphiti-core arguments.

No I/O or global state — unit-testable without a live DB or LLM. Ported from
the official Zep graphiti MCP server (mcp_server/src/utils/type_config.py) so
the custom server shares the exact same temporal/filter semantics.
"""

from datetime import datetime, timezone


def parse_reference_time(value: str | None) -> datetime | None:
    """Parse an ISO-8601 string into a timezone-aware UTC datetime.

    Accepts a trailing ``Z`` suffix. Timezone-naive values are assumed UTC.
    Returns None when value is None. Raises ValueError on an unparseable string.
    """
    if value is None:
        return None
    normalized = value.strip()
    if normalized[-1:] in ("Z", "z"):
        normalized = normalized[:-1] + "+00:00"
    parsed = datetime.fromisoformat(normalized)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    else:
        parsed = parsed.astimezone(timezone.utc)
    return parsed


def coerce_group_ids(group_ids):
    """Normalize a group_ids arg that may be a scalar string or list.

    A non-empty string becomes a one-element list; a blank string becomes None
    (so it falls back to the default group rather than operating on group '').
    Lists and None pass through unchanged.
    """
    if isinstance(group_ids, str):
        return [group_ids] if group_ids else None
    return group_ids


def _date_range_or_group(after: datetime | None, before: datetime | None):
    """Build a SearchFilters date filter for an optional [after, before] range.

    graphiti-core expresses date filters as ``list[list[DateFilter]]`` — the
    outer list is OR-ed, each inner list AND-ed. A single range becomes one AND
    group with ``>=`` and/or ``<=``. Returns None when neither bound is given.
    """
    from graphiti_core.search.search_filters import ComparisonOperator, DateFilter

    conditions = []
    if after is not None:
        conditions.append(
            DateFilter(date=after, comparison_operator=ComparisonOperator.greater_than_equal)
        )
    if before is not None:
        conditions.append(
            DateFilter(date=before, comparison_operator=ComparisonOperator.less_than_equal)
        )
    if not conditions:
        return None
    return [conditions]


def build_fact_search_filters(
    edge_types: list[str] | None = None,
    valid_at_after: str | None = None,
    valid_at_before: str | None = None,
    invalid_at_after: str | None = None,
    invalid_at_before: str | None = None,
):
    """Build a SearchFilters for fact (edge) search, or None if no criteria.

    The ``*_after`` / ``*_before`` args are ISO-8601 strings (UTC-coerced via
    parse_reference_time). Raises ValueError on a bad timestamp.
    """
    from graphiti_core.search.search_filters import SearchFilters

    valid_at = _date_range_or_group(
        parse_reference_time(valid_at_after), parse_reference_time(valid_at_before)
    )
    invalid_at = _date_range_or_group(
        parse_reference_time(invalid_at_after), parse_reference_time(invalid_at_before)
    )
    if not edge_types and valid_at is None and invalid_at is None:
        return None
    return SearchFilters(
        edge_types=edge_types or None,
        valid_at=valid_at,
        invalid_at=invalid_at,
    )
