# Algorithm Changelog

`algorithm.md` holds ONLY doctrine — what the Algorithm does, this run. All change history, migration steps, and rollback recipes live here. New versions add a section at the top. (Pattern adapted from upstream LifeOS v6.28.0, which split its doctrine file the same way.)

## v3.8.0 (2026-09-25) — Verification hardening, learning router, delegate liveness, nudge layer

Adapted from upstream LifeOS Algorithm v8.x (https://github.com/danielmiessler/LifeOS). Features:

- **Per-ISC falsifier probes** — every criterion names the tool check that would falsify it, with an evidence-modality table and a span rule (a container passing is never evidence for its members). (upstream claim 8)
- **Class-sweep close** — a defect that is an instance of a class cannot close until every sibling is enumerated, fixed or tombstoned; sweep-shaped asks enumerate at PLAN time. (upstream claim 9)
- **Learning Router** — learnings land as diffs in typed homes (rule/gotcha/incident/knowledge/state); identity, doctrine, hook and permission learnings surface to Jack instead of self-applying. (upstream claim 12)
- **Evidence collapse** — a closed criterion keeps one line of provenance; the proof lives in git and CI. (upstream claim 12)
- **Delegate liveness + blast-radius brief sizing** — one nudge, then FAILED; no ISC closes on a report that never arrived; briefs sized so one silent death loses little. (upstream v8.18.0)
- **Events layer** — deterministic nudge hook `claude/scripts/hooks/algorithm-nudge.ts` replaces standing prose for moment-of-need questions. (upstream AlgorithmNudge)
- **One home per rule** — the Fabric-pattern rule now lives only in steering-rules.md; algorithm.md points at it. (upstream v8.11.0)
- **Doctrine/changelog split** — inline `<!-- reflect -->` history comments removed from algorithm.md; this file carries history going forward.
- **New skill**: `skills/thinking/RootCauseAnalysis` (adapted from upstream; LifeOS-specific machinery stripped).

NOT changed (separate decision): effort tiers, ISC count floors, time budgets, mode classifier.

Migration: none — content-only changes; hooks activate on next session start.
Rollback: revert the merge commit, or `git checkout main -- instructions/ claude/ skills/thinking/RootCauseAnalysis skills/utilities/Delegation/SKILL.md`.

## Pre-changelog history (3.0.0–3.7.0)

Learnings applied 2026-03 through 2026-09 were recorded as inline `<!-- reflect -->` comments inside algorithm.md. That record was removed in v3.8.0; the full history is in the git log of `instructions/algorithm.md` (`git log -p --follow instructions/algorithm.md`).
