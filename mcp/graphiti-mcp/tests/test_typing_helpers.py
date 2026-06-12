"""Tests for graphiti_mcp.typing_helpers — pure unit, no network/LLM."""

from datetime import timezone

import pytest

from graphiti_mcp.typing_helpers import (
    build_fact_search_filters,
    coerce_group_ids,
    parse_reference_time,
)


class TestParseReferenceTime:
    def test_none_passthrough(self):
        assert parse_reference_time(None) is None

    def test_zulu_suffix_is_utc(self):
        dt = parse_reference_time("2025-01-15T10:30:00Z")
        assert dt.tzinfo is not None
        assert dt.utcoffset().total_seconds() == 0
        assert (dt.year, dt.month, dt.day, dt.hour, dt.minute) == (2025, 1, 15, 10, 30)

    def test_lowercase_z_suffix(self):
        dt = parse_reference_time("2025-01-15T10:30:00z")
        assert dt.utcoffset().total_seconds() == 0

    def test_naive_assumed_utc(self):
        dt = parse_reference_time("2025-01-15T10:30:00")
        assert dt.tzinfo == timezone.utc

    def test_offset_converted_to_utc(self):
        # 10:30 at +02:00 == 08:30 UTC
        dt = parse_reference_time("2025-01-15T10:30:00+02:00")
        assert dt.hour == 8 and dt.minute == 30
        assert dt.utcoffset().total_seconds() == 0

    def test_bad_string_raises(self):
        with pytest.raises(ValueError):
            parse_reference_time("not-a-date")


class TestCoerceGroupIds:
    def test_scalar_string_to_list(self):
        assert coerce_group_ids("foo") == ["foo"]

    def test_blank_string_to_none(self):
        assert coerce_group_ids("") is None

    def test_list_passthrough(self):
        assert coerce_group_ids(["a", "b"]) == ["a", "b"]

    def test_none_passthrough(self):
        assert coerce_group_ids(None) is None


class TestBuildFactSearchFilters:
    def test_no_criteria_returns_none(self):
        assert build_fact_search_filters() is None

    def test_edge_types_only(self):
        f = build_fact_search_filters(edge_types=["WORKS_FOR"])
        assert f is not None
        assert f.edge_types == ["WORKS_FOR"]
        assert f.valid_at is None and f.invalid_at is None

    def test_valid_at_range_builds_and_group(self):
        f = build_fact_search_filters(
            valid_at_after="2025-01-01T00:00:00Z",
            valid_at_before="2025-12-31T00:00:00Z",
        )
        assert f is not None
        # outer list OR-ed, single inner AND group with two conditions
        assert len(f.valid_at) == 1
        assert len(f.valid_at[0]) == 2

    def test_single_bound_one_condition(self):
        f = build_fact_search_filters(invalid_at_after="2025-01-01T00:00:00Z")
        assert len(f.invalid_at[0]) == 1

    def test_bad_date_raises(self):
        with pytest.raises(ValueError):
            build_fact_search_filters(valid_at_after="garbage")
