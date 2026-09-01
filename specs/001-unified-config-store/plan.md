# Implementation Plan: Unified Config Store — Single-Source AGENTS.md, Skills, and Agents (Claude Code + pi)

**Branch**: `001-unified-config-store` | **Date**: 2026-08-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-unified-config-store/spec.md`

## Summary

Eliminate all duplication of instructions, skills, agents, and settings between the Holocron repo and the live machine, for exactly two harnesses: **Claude Code** (canonical file structure) and **pi** (extended to read the shared store). Technical approach: one canonical `instructions/AGENTS.md` (self-contained — pi does not expand `@`-imports), a thin `claude/CLAUDE.md` shim (`@AGENTS.md` + Claude-only tail), a pi overlay in `APPEND_SYSTEM.md`, one `algorithm.md` (merge + labeled per-harness tool tables), 20 public skills renamed to lowercase Agent-Skills slugs, 16 shared agents consolidated into a top-level `agents/` dir (Claude frontmatter), a new pi `resources_discover` extension for skill discovery, and an `install.sh` that converges the live machine (repair-on-rerun + `--check` drift reporting). OpenCode is fully retired (repo + installer + machine). No new dependencies; no install-time content generation.

## Technical Context

**Language/Version**: Bash (`#!/usr/bin/env bash`, already requires bash ≥ 4 via `declare -A` in `install.sh`) + Markdown + JSON. No compiled code except one new pi extension (plain TypeScript, Bun runtime, matching existing `pi/extensions/*.ts` pattern).

**Primary Dependencies**: None added. Existing: pi extension API (`resources_discover` event — verified in installed pi source, see `research.md` R4), macOS symlink semantics (case-insensitive APFS — collision detection must be case-insensitive).

**Storage**: Filesystem symlinks (live machine pointers) + JSON settings files. No database.

**Testing**: No test framework in this repo. Verification is machine-level and harness-level: `install.sh --check` (drift detection with exit codes), per-harness verification prompts (SC-002), and grep assertions (SC-001/SC-007/SC-008). All scenarios are scripted in `quickstart.md`.

**Target Platform**: macOS (this machine — the only machine that runs this config). Linux best-effort via the same `install.sh`.

**Project Type**: Configuration repository + installer CLI (config-as-code).

**Performance Goals**: Installer completes in < 5s; zero network calls; `--check` adds < 1s.

**Constraints**:
- No install-time generation of shared content (spec design constraint; DECISIONS 2026-08-28).
- Installer must never modify non-Holocron files (user-local real files, `~/.agents/`, OpenCode's own config) — FR-016, US6 AS2/AS3.
- Canonical file must contain zero `@`-import lines (FR-002; pi reads context files raw).
- All shared content references repo files via `$HOLOCRON_DIR` with documented fallback (FR-005).
- Installer edits to `install.sh` are serialized (single file, many stories touch it).

**Scale/Scope**: 20 public skills (+1 private), 16 shared agents (+2 private), 3 top instruction files → 1 canonical + 2 adapters, ~15 live pointers per harness, 608-line `install.sh` rework.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle / Constraint | Status | Notes |
|---|---|---|
| I. Harness-Agnostic Core | ✅ PASS | This feature is the enforcement mechanism: per-harness dirs become thin adapters; Claude is the canonical *file structure*, behavior stays harness-agnostic. |
| II. Algorithm, ISC, and PRD Discipline | ✅ PASS | Canonical paths `instructions/AGENTS.md` + `instructions/algorithm.md` are preserved exactly; this feature itself went through spec-kit. |
| III. Capability Invocation Is a Commitment | ✅ PASS | No capabilities selected here that execution must perform beyond the task list. |
| IV. Surgical Changes, Verified Claims | ✅ PASS | Every count/path claim in spec + plan re-verified against live repo/machine on 2026-08-28 (validation pass); stale counts corrected in spec (16 agents, 13 wrappers, 4 unported reflections). |
| V. Memory Lives in One Place, Split by Sensitivity | ✅ PASS | Personal overrides (settings, private skills/agents) remain in `$HOLOCRON_MEMORY_DIR`; public config stays in this repo. |
| VI. One Source of Truth, Distributed by Symlink | ✅ PASS | Target architecture is exactly this principle: canonical repo files, symlinked/shimmed live pointers. |
| Constraint: Skill structure (TitleCase MANDATORY) | ❌ **VIOLATION** | FR-006 mandates lowercase-hyphen Agent-Skills naming (name == dir). Justified below; remediated by Constitution Amendment 1.1.0 (task T003, requires Jack's approval per governance). |
| Constraint: Supported harnesses (lists OpenCode) | ❌ **VIOLATION** | US6/FR-018 retire OpenCode per user direction 2026-08-28 (DECISIONS.md). Constraint text is stale; same amendment remediates. |
| Constraint: Just-in-time adoption | ✅ PASS | No new dependencies; reuses existing installer helpers (`link_file`, `link_dir`, `merge_link_skills`, `merge_link_agents`). |
| Constraint: Empirical verification over documentation assumptions | ✅ PASS | pi capabilities verified against installed source (spec + memory 2026-08-28); live machine state verified this session (settings drift, agent counts, private-agent paths, hand-added external symlinks). |

**Post-design re-check (after Phase 1)**: Same result. The two violations are carried explicitly as justified complexity with a tracked remediation task (T003) rather than silently proceeding — per governance, work that conflicts with a Core Principle/Constraint is flagged to the user, and the constitution is amended out-of-band with a DECISIONS.md entry.

## Project Structure

### Documentation (this feature)

```text
specs/001-unified-config-store/
├── spec.md              # Feature specification (validated 2026-08-28, counts corrected)
├── plan.md              # This file
├── research.md          # Phase 0 output — open items resolved (R1–R8)
├── data-model.md        # Phase 1 output — resource/pointer model
├── contracts/
│   └── install-cli.md   # Phase 1 output — installer CLI + drift contract
├── quickstart.md        # Phase 1 output — end-to-end validation guide
├── migration-snapshot.md# Created by T002 — pre-migration live pointer inventory
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root, post-migration)

```text
Holocron/
├── instructions/
│   ├── AGENTS.md              # CANONICAL global instructions — self-contained, zero @imports,
│   │                          #   zero harness-specific tool names/paths, $HOLOCRON_DIR refs
│   ├── algorithm.md           # SINGLE algorithm doc — labeled "Claude Code" / "pi" tool
│   │                          #   subsections; opencode table deleted; all reflect learnings
│   ├── steering-rules.md      # unchanged (shared)
│   ├── PRDFORMAT.md           # unchanged (shared)
│   ├── SKILLSYSTEM.md         # rewritten naming section (lowercase-hyphen, per amended constitution)
│   ├── MEMORYSYSTEM.md        # unchanged (shared)
│   └── THEDELEGATIONSYSTEM.md # unchanged (shared)
├── skills/                    # 20 public skills — ALL lowercase slugs, frontmatter name == dir
│   └── <lowercase-slug>/SKILL.md
├── agents/                    # 16 shared agents — Claude Code frontmatter (moved from claude/agents/)
│   └── <Name>.md
├── commands/                  # shared prompts (algorithm, compound, process-meetings, reflect)
├── claude/                    # thin Claude adapter (disposable per Constitution I)
│   ├── CLAUDE.md              # THIN SHIM: @<AGENTS.md import> + @MEMORY.md + Claude-only tail
│   ├── settings.json          # repo template — lowest settings precedence
│   ├── CLAUDE_CLI_COMPATIBILITY.md  # updated to two-harness model
│   ├── scripts/               # unchanged
│   └── validate-claude-cli.sh / ValidateClaudeCLI.md  # unchanged
├── pi/                        # thin pi adapter
│   ├── APPEND_SYSTEM.md       # NEW — pi-only always-on overlay (TillDone, graphiti_*, backend toggle)
│   ├── agents/                # pi-native roster + chains — UNTOUCHED (FR-010)
│   ├── extensions/
│   │   └── skill-roots.ts     # NEW — resources_discover → shared skill root
│   ├── settings.json          # repo template for pi (precedence: memory pi-settings.json > template)
│   └── EXTENSIONS.md          # updated (new extension + two harnesses)
├── install.sh                 # converge-on-rerun + --check drift mode (contract: contracts/install-cli.md)
├── install.ps1                # OpenCode section removed + "not yet updated" guard (FR-018)
└── # DELETED: opencode/ (agents, plugins, PLUGINS.md), pi/skills/ (13 wrappers),
    #           claude/instructions/, claude/agents/, pi/AGENTS.md

Live machine (managed by install.sh):
~/.claude/CLAUDE.md      → repo claude/CLAUDE.md            (shim)
~/.claude/settings.json  → $HOLOCRON_MEMORY_DIR/settings.json  (if exists) else repo claude/settings.json
~/.claude/agents/        real dir; per-file symlinks: 16 public (agents/) + 2 private ($HOLOCRON_MEMORY_DIR/agents/)
~/.claude/skills/        real dir; whole-dir symlinks: 20 public + private merge; external hand-symlinks preserved
~/.claude/instructions   → repo instructions/               (repointed from retired claude/instructions/)
~/.pi/agent/AGENTS.md    → repo instructions/AGENTS.md      (canonical)
~/.pi/agent/APPEND_SYSTEM.md → repo pi/APPEND_SYSTEM.md
~/.pi/agent/instructions → repo instructions/               (existing)
~/.pi/agent/prompts      → repo commands/                   (existing)
~/.pi/agent/settings.json — user-local real file: NEVER touched (skipped + reported)
~/.pi/agent/skills       REMOVED (skills arrive via skill-roots extension)
~/.config/opencode/      Holocron-created pointers REMOVED; real user files + OpenCode's own config untouched
```

**Structure Decision**: Single-project config repo (no src/tests split). The "source code" is the file layout itself plus `install.sh`; the pi extension is the only code artifact and lives where all other pi extensions live (`pi/extensions/`). The post-migration tree above is the target state; `data-model.md` maps every canonical resource to its live pointer(s).

## Complexity Tracking

> Violations from Constitution Check that must be justified.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| Constitution "Skill structure" constraint mandates TitleCase; FR-006 mandates lowercase-hyphen Agent-Skills names | User direction (Agent-Skills standard removes pi name warnings, keeps the store usable by any strict future harness); pi leniency is documented as "suboptimal" | Keeping TitleCase would fail FR-006/SC-006, perpetuate 13 wrapper files, and block the standard the ecosystem is converging on. Amendment 1.1.0 (task T003) updates the constraint with Jack's approval rather than silently overriding it. |
| Constitution "Supported harnesses" constraint lists OpenCode as supported | User direction 2026-08-28: OpenCode retired (DECISIONS.md 2026-08-28 "Retire OpenCode harness support") | Keeping OpenCode listed would make the spec's own US6/FR-018 a standing constitution violation and preserve a dead consumer in the constraint text. |

Both violations are *stale constraint text vs. newer user direction*, not new architectural complexity. The amendment is MINOR (1.0.0 → 1.1.0): materially changed guidance on two existing constraints; no principles added/removed.
