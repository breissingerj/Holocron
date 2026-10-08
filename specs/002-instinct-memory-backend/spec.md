# Feature Specification: Instinct-Style Memory Backend

**Feature Branch**: `instinct-memory-backend`
**Created**: 2026-10-08
**Status**: Draft
**Input**: "Develop a plan where we could recreate an Instinct-like memory as one of our options for context management." Design source: `$HOLOCRON_MEMORY_DIR/WORK/20261008-170919_instinct-style-memory-plan/PRD.md` (inspired by the supermemory teardown of Instinct — inferred, not official).

## User Scenarios & Testing

### User Story 1 - Deterministic context assembly (Priority: P1)
With `HOLOCRON_MEMORY_BACKEND=instinct`, every session starts with a budgeted block (profile, one-pager, recap, board) injected by a hook — the model never calls a tool to get it.
**Why**: The core of the Instinct design; delivers value alone.
**Independent Test**: `instinct assemble` prints the block within token budgets; pi extension and Claude hook inject it; backend unset → nothing changes.
1. **Given** backend=instinct and seeded files, **When** a session starts, **Then** the block is injected once, within budget.
2. **Given** backend≠instinct, **When** a session starts, **Then** the instinct adapters inject nothing and the legacy loader behaves as before.

### User Story 2 - Session continuity via recap (Priority: P1)
At Stop/PreCompact/SessionEnd a recap of open loops, exact identifiers, and completed work is written; the next session (either harness) resumes from it.
**Independent Test**: end a session mid-task; start a new one; recap with identifiers is injected.
1. **Given** a finished session, **When** the hook runs, **Then** `recap.md` is rewritten ≤ 8K tokens including open loops.

### User Story 3 - Capture, consolidate, recall (Priority: P2)
Candidate facts are appended to `inbox/` (explicit tool, Haiku extraction hook, backstop sweep). A consolidator merges them into `store/` (dedupe by alias, supersede with date), regenerates the one-pager, with a dry-run diff. A `recall` command/tool and a per-prompt hook retrieve by alias/keyword with typo tolerance.
**Independent Test**: append candidate → `consolidate --dry-run` shows diff, no writes → `consolidate` writes + commits → `recall "pazta"` finds the dining file.

### Edge Cases
- Hook-spawned extraction recursion (Haiku call triggering Stop hook) MUST be guarded.
- Missing `HOLOCRON_MEMORY_DIR`, empty inbox, malformed store files, oversized recap → degrade silently, never block a session.
- Sensitive sessions: extraction skipped when `INSTINCT_CAPTURE=off`.

## Requirements
- **FR-001**: `HOLOCRON_MEMORY_BACKEND=instinct` selects the mode; other values leave behavior unchanged. (Constitution I: core harness-agnostic, adapters thin.)
- **FR-002**: Layout under `$HOLOCRON_MEMORY_DIR/instinct/`: `profile.md`, `onepager.md`, `recap.md`, `board.md`, `store/{entities,knowledge,timeline}/`, `inbox/*.jsonl`, `store/_archive/`, `.state/` (checkpoints). The alias index is computed live (no cache file).
- **FR-003**: Budgets (tokens ≈ chars/4): profile 500, onepager 4000, recap 8000, board 2000, retrieved 2000.
- **FR-004**: Agent never writes `store/`; only the consolidator does.
- **FR-005**: Extraction uses Haiku (latest) via `tools/Inference.ts` fast level; `INSTINCT_EXTRACT_MODEL` override.
- **FR-006**: Consolidator supports `--dry-run` (no filesystem writes) and git commit only on real runs.
- **FR-007**: Retrieval uses alias/filename/grep match with edit-distance fuzzy fallback; no vector DB or server.
- **FR-008**: Seed command derives profile/onepager/board from existing `memory/` + active PRDs without modifying `memory/`.
- **FR-009**: Claude Code and pi adapters share one core CLI (`tools/instinct/instinct.ts`).
- **FR-011 (timestamps)**: Every store bullet carries `asserted:` date, `conf:` (0-1), `src:`, optional `expires:`, optional `pinned` (file-level); files carry `updated`.
- **FR-012 (supersession)**: Consolidator runs a Haiku judge on candidates matching an existing entity: `add | duplicate | supersede(bullet ids)`. Superseded bullets get `superseded_by:` and move to `store/_archive/`; deterministic Jaccard dedupe is the no-LLM fallback.
- **FR-013 (soft forgetting)**: Expired and superseded bullets are archived (never deleted, git keeps history) and excluded from recall, one-pager, and assembly.
- **FR-014 (decay)**: Recall score is weighted by recency (`0.5 + 0.5*exp(-age/180d)`); pinned files exempt.
- **FR-015 (explicit forget)**: `instinct forget <query> [--dry-run]` archives matching bullets/entity files; "forget X" in conversation routes to it.
- **FR-016 (staleness report)**: Consolidate reports bullets older than 180d (not pinned) and bullets with conf < 0.5 as FLAGGED for review; never auto-archived.
- **FR-010**: Explicit "remember" requests route to `inbox/` in instinct mode (DECISIONS.md entry).

## Success Criteria
- **SC-001**: Injection ≤ 16.5K tokens total, one copy per session.
- **SC-002**: With backend unset, assembled output of legacy path is byte-identical to before.
- **SC-003**: Recap resume test passes (open loop + identifier present in next session's injection).
- **SC-004**: Recall eval ≥ 90% hit-rate on the 20-query fixture incl. typos/synonyms.
- **SC-006**: Contradicting-fact fixture: older bullet archived with `superseded_by`, absent from recall; expired bullet archived on consolidate; `forget --dry-run` writes nothing.
- **SC-005**: `consolidate --dry-run` leaves `git status` clean.
