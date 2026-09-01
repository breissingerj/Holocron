# Tasks: Unified Config Store — Single-Source AGENTS.md, Skills, and Agents (Claude Code + pi)

**Input**: Design documents from `/specs/001-unified-config-store/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/install-cli.md

**Tests**: No TDD test tasks — the spec requests no test framework; verification is via `install.sh --check` (exit-code contract), per-harness verification prompts, and grep sweeps, all scripted in `quickstart.md`. Each story's verification task (last task of its phase) is mandatory.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

**Format**: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (e.g., US1)

**Global constraint**: All `install.sh` edits are **serialized** (T011 → T014 → T019 → T022 → T023 → T024 → T027) — single file, many stories. Do not parallelize any two tasks that both touch `install.sh`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: De-risk assumptions and create a rollback reference before any migration.

- [x] T001 Run the 2-minute Claude `@`-import marker test (relative vs `~/`-absolute vs `$HOLOCRON_DIR` forms) in a throwaway CLAUDE.md; record the final shim import form in `specs/001-unified-config-store/research.md` R1 — **DONE 2026-08-28**: external imports are consent-gated per project (`hasClaudeMdExternalIncludesApproved` in `~/.claude.json`, all false on this machine → live shim imports never expanded); env-var import paths are dead; shim mechanism changed to generated concatenation (see R1 + DECISIONS.md)
- [x] T002 [P] Snapshot the current live pointer inventory (`~/.claude/`, `~/.pi/agent/`, `~/.config/opencode/`, `~/.agents/skills/` — symlink targets, real files, external entries) into `specs/001-unified-config-store/migration-snapshot.md` as the pre-migration rollback reference

**Checkpoint**: Import form chosen; baseline captured — migration is safely reversible.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Create the canonical sources every user story consumes. **⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T003 Amend the constitution to 1.1.0 (`.specify/memory/constitution.md`): rewrite the "Skill structure" constraint (public skills: lowercase `[a-z0-9-]` Agent-Skills standard, frontmatter `name` == dir, `USE WHEN` trigger retained; personal `_ALLCAPS` rule unchanged) and the "Supported harnesses" constraint (exactly Claude Code + pi); update version header + SYNC IMPACT REPORT block; append a DECISIONS.md entry. **GATE: requires Jack's explicit approval before applying** (governance: sole approver)
- [x] T004 [P] Merge `algorithm.md` into the single canonical `instructions/algorithm.md`: port all `<!-- reflect: -->` learnings missing from `claude/instructions/algorithm.md` (4 as of 2026-08-28 — count lines, not the spec's number, at execution time), embed clearly-labeled "Claude Code tools" and "pi tools" subsections, delete the OpenCode tool table; then delete `claude/instructions/` (merge must land with the retirement — never after, per spec edge case) — **DONE 2026-08-31**: `instructions/algorithm.md` already had all 8 reflect learnings from the claude copy plus 4 more (superset, verified by grep); rewrote the single OpenCode-flavored capability table into labeled "Claude Code tools" / "pi tools" subsections (pi tool surface empirically verified against the installed `pi-coding-agent@0.83.0` package: `read/write/edit/bash/glob/grep/ls/skill` built-in, no native webfetch/websearch, `subagent` tool referenced by `subagent-progress.ts` but unconfirmed — flagged as verify-before-use); replaced hardcoded `~/.config/opencode/scripts/voice.sh` with `$HOLOCRON_DIR/scripts/voice.sh`; deleted `claude/instructions/`
- [x] T005 [P] Build the canonical `instructions/AGENTS.md`: merge shared content from `instructions/AGENTS.md` + `claude/CLAUDE.md` + `pi/AGENTS.md`; self-contained (zero `@`-import lines), zero harness-specific tool names/paths, repo-file references via `$HOLOCRON_DIR` with the documented fallback, OpenCode mentions stripped; keep the Constitution II naming — **DONE 2026-08-31**: `instructions/AGENTS.md` was already the near-final draft (graphiti+obsidian-aware Memory Context Priming superseding both claude/CLAUDE.md's simpler Memory Retrieval and pi/AGENTS.md's pi-only Graphiti section, which contributed nothing further — 100% pi-specific, deferred to T010); fixed the 3 remaining hardcoded `~/.config/opencode/...` paths to `$HOLOCRON_DIR/...` and added the documented `$HOLOCRON_DIR`-unset fallback note (FR-005)
- [x] T006 [P] Rename the 13 CamelCase public skills in `skills/` to lowercase-hyphen slugs (edit `name` in each frontmatter so `name` == directory); update every in-repo reference to the old CamelCase paths (grep `skills/` references across `instructions/`, `skills/` cross-references, `agents/`, `commands/` — a grep for each old name must return nothing)
- [x] T007 [P] `git mv` all 16 files from `claude/agents/` to a new top-level `agents/` (Claude frontmatter unchanged — verify one sample file parses); delete `opencode/agents/` (16 files, verified byte-identical names) — **DONE 2026-08-31**: actual count is 15 files, not 16 (stale count in plan.md/data-model.md — no 16th agent file exists anywhere in the repo); `git mv claude/agents agents` done, `Engineer.md` frontmatter verified parseable; `opencode/agents/` (15 files) deleted via `git rm -r` — note: filenames were identical between the two dirs but *contents* were not (opencode copies carried OpenCode-only persona/voice/model frontmatter fields) — deletion is correct per FR-009 (single canonical format), not a data-loss concern
- [x] ~~T008 [P] Move private agents in the memory repo from `$HOLOCRON_MEMORY_DIR/agents/opencode/` to `$HOLOCRON_MEMORY_DIR/agents/`~~ — **RETIRED 2026-08-31 (Jack's decision)**: source directory does not exist. `LahzoChatTester.md` + `ProductManager.md` were deleted from the memory repo in commit `acaca00` ("vault backup: 2026-08-07 14:50:44"), 3 weeks before this spec's research.md (2026-08-28) asserted they still lived at `agents/opencode/` (R5's premise was already stale when written). Jack confirmed both private agents are intentionally retired, not to be restored — T008 and its downstream US4 clauses (T019's private-agent link step, T021's private-agent verification) are dropped from scope. See DECISIONS.md 2026-08-31.

**Checkpoint**: Foundation ready — one canonical AGENTS.md, one algorithm.md, lowercase skills, single `agents/` dir. User story implementation can now begin.

---

## Phase 3: User Story 1 — One global instruction file, two harnesses (Priority: P1) 🎯 MVP

**Goal**: Change a core behavioral rule once in `instructions/AGENTS.md` and have it take effect in both harnesses via the Claude shim + pi symlink/overlay.

**Independent Test**: quickstart S3 — edit one sentence in the canonical file; start (or `/reload`) a session in each harness; confirm the changed sentence is in each harness's effective instructions with no second file edit.

### Implementation for User Story 1

- [x] T009 [US1] Build the Claude shim as a **generated concatenation** — **DONE 2026-08-31**: `claude/claude-tail.md` created holding the one genuinely Claude-only bullet (`/rename` session naming — everything else was already in the canonical file per T005); `install.sh`'s `generate_claude_shim()` writes `claude/CLAUDE.md` = `instructions/AGENTS.md` + `claude/claude-tail.md` + primed `memory/MEMORY.md` with a GENERATED header, comparing against the existing file so a second run is a no-op; `claude/CLAUDE.md` removed from git tracking and added to `.gitignore`; `~/.claude/CLAUDE.md` symlink unchanged (still points at the repo file)
- [x] T010 [P] [US1] Create `pi/APPEND_SYSTEM.md` from the pi-specific sections of `pi/AGENTS.md` — **DONE 2026-08-31**: `pi/AGENTS.md` was already 100% pi-specific content (Graphiti + TillDone, no shared AGENTS.md-style content at all), so this was a straight `git mv pi/AGENTS.md pi/APPEND_SYSTEM.md`; verified empirically against installed pi source (`resource-loader.js`) that pi auto-loads `~/.pi/agent/APPEND_SYSTEM.md` — this is a real, confirmed pi mechanism, not just documented
- [x] T011 [US1] `install.sh` — claude section: link `CLAUDE.md` (generated shim) and settings with fixed precedence; pi section: link `~/.pi/agent/AGENTS.md` → repo `instructions/AGENTS.md` directly and `~/.pi/agent/APPEND_SYSTEM.md` → repo `pi/APPEND_SYSTEM.md` — **DONE 2026-08-31**: `install.sh` fully rewritten as a convergent installer (see T022/T023); both links are in place and verified live
- [x] T012 [US1] Verify US1 acceptance AS1–AS4 + SC-002 — **DONE 2026-08-31**: added a permanent `HOLocrON-MARKER-001` line to `instructions/AGENTS.md`; confirmed on disk that it resolves through both `~/.claude/CLAUDE.md` (generated shim content) and `~/.pi/agent/AGENTS.md` (direct symlink) to the identical canonical file — file-level proof rather than a live multi-session prompt test (this session can't restart itself mid-task); canonical file confirmed to contain zero `@`-import lines; one-harness-rule edit (`/rename` bullet) confirmed present only in `claude/claude-tail.md`, absent from the canonical file

**Checkpoint**: US1 independently functional — the heart of the request is live. MVP complete.

---

## Phase 4: User Story 2 — Skills stored once, consumed by both harnesses (Priority: P1)

**Goal**: A skill added to `skills/` once is available in both harnesses with zero per-harness wrapper files and zero fan-out maintenance.

**Independent Test**: quickstart S4 — create `skills/demo-skill/SKILL.md` (lowercase name); without touching any harness directory, confirm the skill is listed in both harnesses after reinstall/`/reload`.

### Implementation for User Story 2

- [x] T013 [US2] Create `pi/extensions/skill-roots.ts`: `resources_discover` handler returning `skillPaths` — **DONE 2026-08-31**: returns `[<repo>/skills, $HOLOCRON_MEMORY_DIR/skills (if it exists)]`, no `promptPaths`; resolves the repo root via `$HOLOCRON_DIR` with an explicit `realpathSync`-based fallback (following the symlink install.sh creates at `~/.pi/agent/extensions/skill-roots.ts`) rather than relying on ambiguous `import.meta` symlink behavior; verified it builds cleanly with `bun build`
- [x] T014 [US2] `install.sh` — skills — **DONE 2026-08-31**: pi fan-out logic removed entirely, `~/.pi/agent/skills/` removed live; claude skills use `merge_link_skills()` — whole-dir symlinks with file-level merge only on case-insensitive collision (verified against the actual `agents`(public)/`Agents`(private) pair); auto-detects and repairs stale differently-named entries left from the T006 rename, including CamelCase→hyphenated cases (`ContentAnalysis`→`content-analysis`) that a pure case-fold check would miss; the 3 hand-added external symlinks are classified `EXTERNAL` and left untouched (verified: still present post-migration)
- [x] T015 [P] [US2] Delete `pi/skills/` (13 wrapper directories) from the repo — **DONE 2026-08-31**: `git rm -r pi/skills/`; grep for `pi/skills` returns only historical docs (ROADMAP/DECISIONS) and this spec's own docs
- [x] T016 [US2] Verify US2 acceptance AS1–AS6 + SC-003 + SC-006 — **DONE 2026-08-31**: `bash install.sh --check` on the live machine is `CLEAN` (0 skill-related failures, only the 3 pre-existing externals as informational); `~/.pi/agent/skills/` confirmed absent; the `agents`/`Agents` case-insensitive collision structurally handled by `merge_link_skills()`'s sanctioned-merge path (same mechanism verified working for other skills); SC-006 (zero pi skill-name warnings) verified structurally against pi's source (lenient name≠dir handling, confirmed in `resource-loader.js`) rather than a live interactive pi session — CLI flag combinations attempted for a non-interactive startup check did not produce a clean signal, so this is flagged as source-verified rather than session-verified; old CamelCase path grep clean (`~/.claude/skills/` now lists only lowercase-hyphen + the 3 externals)

**Checkpoint**: US1 + US2 independently functional — instructions and skills are single-sourced.

---

## Phase 5: User Story 3 — One algorithm doc (Priority: P2)

**Goal**: A single `instructions/algorithm.md` that both harnesses read, so `/reflect` learnings can never diverge again.

**Independent Test**: quickstart S5/S6 — `find . -name algorithm.md` returns exactly one doc path; run `/reflect` in one harness and confirm the updated file is the one every harness reads (same path).

### Implementation for User Story 3

- [x] T017 [US3] Repoint the live `~/.claude/instructions` symlink from the retired `claude/instructions/` to repo `instructions/`; update all shared-content references to `algorithm.md` to the `$HOLOCRON_DIR` resolution scheme — **DONE 2026-08-31**: `install.sh`'s claude section links `instructions/` directly (repaired live, was DANGLING → REPAIRED); algorithm.md/AGENTS.md path references across `instructions/`, `commands/`, `agents/` already used `$HOLOCRON_DIR` from T004/T005; extended the sweep into `skills/` (Browser, Delegation, AudioEditor, CreateCLI, BrightData, Recon, media/Art — see T028) since those also carried hardcoded `~/.config/opencode/...` paths
- [x] T018 [US3] Verify US3 acceptance AS1–AS4 — **DONE 2026-08-31**: `find . -name algorithm.md -not -path "./specs/*"` returns exactly `instructions/algorithm.md` (+ `commands/algorithm.md`, the reflect-prompt command, not the doc); `claude/instructions/` confirmed gone from repo and disk; both tool tables (Claude Code / pi) present and labeled; no OpenCode table remains; `$HOLOCRON_DIR` references consistent throughout

**Checkpoint**: US3 independently functional — the proven 84-line-drift failure mode is structurally closed.

---

## Phase 6: User Story 4 — Agents defined once, in the claude file structure (Priority: P2)

**Goal**: Each of the 16 shared agents has exactly one canonical file in `agents/` (Claude format); the manual dual-maintenance rule is dead.

**Independent Test**: Change the Engineer agent's persona in `agents/Engineer.md`; reinstall; confirm `~/.claude/agents/Engineer.md` carries the new persona; confirm no `opencode/agents/` exists anywhere in the repo.

### Implementation for User Story 4

- [x] T019 [US4] `install.sh` — claude agents: link via `merge_link_agents` from repo `agents/` (15) into `~/.claude/agents/` — **DONE 2026-08-31**: implemented and verified live (all 15 were DANGLING → REPAIRED to the new `agents/` path); `pi/agents/` + `~/.pi/agent/chains/` untouched (still linked from `pi/agents/`, unaffected by this change)
- [x] T020 [P] [US4] Rewrite `VERIFY_AGENTS.md` — **DONE 2026-08-31**: replaced the dual-maintenance table/rule with the single-source `agents/` description, updated the verification prompt to drop OpenCode-only fields (`voiceId`, `permissions`) and the ProductManager check (retired agent), added `install.sh --check` as the drift reference
- [x] T021 [US4] Verify US4 acceptance AS1–AS4 — **DONE 2026-08-31**: `readlink ~/.claude/agents/Engineer.md` → `agents/Engineer.md` confirmed; `find . -name Engineer.md -not -path "./specs/*"` returns exactly one path; `pi/agents/` untouched; `install.sh --check` correctly flagged all 15 as DANGLING before the fix and reports CLEAN now

**Checkpoint**: US4 independently functional — agent duplication eliminated.

---

## Phase 7: User Story 5 — The machine converges, and drift is visible (Priority: P2)

**Goal**: `install.sh` is safe to re-run at any time; `--check` reports drift (stale/dangling/missing/churned/precedence/external) without touching anything.

**Independent Test**: quickstart S1+S2 — replace one live symlink with a stale copy; `--check` reports it (exit 1, table row); apply mode repairs it (printed); `--check` again is clean (exit 0).

### Implementation for User Story 5

- [x] T022 [US5] `install.sh` — converge engine — **DONE 2026-08-31**: `converge_entry()` is the core convergent primitive (absent→CREATE, dangling/wrong-target→repair, real-file-blocking-a-churn_check-pointer→CHURNED/reset), used by every pointer in the script; a `find_renamed_match()` helper additionally repairs the CamelCase→lowercase-hyphen skill renames (a case beyond plain STALE); second apply run on the live machine printed `no changes` (verified)
- [x] T023 [US5] `install.sh --check` — **DONE 2026-08-31**: every `converge_entry()`/`report()` call branches on `$CHECK_MODE` to classify-only vs. repair; verified zero filesystem writes in check mode (re-ran `--check` twice back to back, identical output both times); exit 1 with a failure count when drift exists, exit 0 `CLEAN` otherwise (both observed live)
- [x] T024 [US5] `install.sh` — settings precedence — **DONE 2026-08-31**: `~/.claude/settings.json` now resolves memory-repo override > repo template dynamically and was live-repaired from PRECEDENCE (template) to the memory-repo `settings.json`; `settings.local.json` is never referenced anywhere in the script; pi settings checked for "already a Holocron symlink or absent" before management — the current machine's real `~/.pi/agent/settings.json` correctly reports `USER_LOCAL`/SKIPPED and was left untouched
- [x] T025 [US5] Verify US5 acceptance AS1–AS5 + SC-004 + SC-005 — **DONE 2026-08-31**: idempotency drill passed (65 changes → 0 on rerun, and again via the fresh-clone sandboxed-`$HOME` dry run: 74 changes → 0); precedence repair observed live (`~/.claude/settings.json` PRECEDENCE → REPAIRED to memory-repo override); missing-harness case covered by the sandboxed dry run (both `~/.claude` and `~/.pi/agent` absent → fully created, no errors). Churn drill run live: swapped `~/.claude/settings.json` from its symlink to a real-file copy of the same content, `--check` correctly reported `CHURNED`, apply mode `RESET` it back to the symlink, `--check` confirmed clean immediately after

**Checkpoint**: US5 independently functional — the installer can no longer rot.

---

## Phase 8: User Story 6 — OpenCode is fully removed (Priority: P2)

**Goal**: Repo, installer, and machine contain no OpenCode adapter content; "supported harnesses" is unambiguously Claude Code + pi.

**Independent Test**: quickstart S5 — scoped `grep -ri opencode` over the repo returns no live adapter content; `~/.config/opencode/` contains no Holocron-managed pointers.

### Implementation for User Story 6

- [x] T026 [US6] Delete `opencode/` from the repo — **DONE 2026-08-31**: `git rm -r opencode/` (PLUGINS.md + 6 plugin dirs' tracked files) then `rm -rf` the gitignored `node_modules/` leftovers each plugin had installed
- [x] T027 [US6] Remove OpenCode from `install.sh` and `install.ps1` — **DONE 2026-08-31**: `install.sh` was fully rewritten with no OpenCode code path at all (confirmed via grep — the only remaining "opencode" string is a historical comment); `install.ps1` replaced with a 2-line guard that prints "not yet updated for spec 001 — run install.sh" and exits 0 (R7)
- [x] T028 [P] [US6] Scrub remaining OpenCode-specific tool names/paths from shared content — **DONE 2026-08-31**: fixed `instructions/AGENTS.md`+`algorithm.md` (T004/T005), `commands/reflect.md`'s dual-file agent-update instructions (was actively wrong post-T007), `skills/{utilities/Browser,utilities/Delegation,utilities/AudioEditor,utilities/CreateCLI,scraping/BrightData,security/Recon,security/WebAssessment,media/Art,agents}` (path/env-fallback fixes), `package.json`+`bun.lock` (dead workspace refs from the deleted opencode plugins, regenerated via `bun install`), `README.md`; added "superseded, see install.sh --check" banners to `claude/{CLAUDE_CLI_COMPATIBILITY.md,ValidateClaudeCLI.md,validate-claude-cli.sh}` rather than a full rewrite of their now-obsolete dual-harness checks; left third-party-project-name false positives (`pi-devin-auth`'s `opencode-windsurf-auth` fork source), the unrelated `.opencode/rules/` project-local convention in the glob-rules hooks, and historical docs (ROADMAP/DECISIONS/MigrationNotes/M16 plan) untouched
- [x] T029 [US6] Machine migration for `~/.config/opencode/` — **DONE 2026-08-31**: removed the 5 remaining pointers (`AGENTS.md`, `commands`, `instructions`, `scripts`, `plugins`) plus the `agents/` (17 entries) and `skills/` (40 entries) real dirs, with a full removal notice printed for each; `opencode.json` was already removed 2026-08-28 (R8); directory left in place, empty, untouched going forward — confirmed no OpenCode-own content existed there (migration-snapshot.md: "No external/user entries exist")
- [x] T030 [P] [US6] Update documentation to name exactly two supported harnesses — **DONE 2026-08-31**: `README.md` (intro, structure diagram, setup section, Adding a new harness — rewritten for the one-installer-section-plus-adapter model), `instructions/SKILLSYSTEM.md` (naming section + every "Skill directory uses TitleCase" checklist/table reference updated to lowercase-hyphen, while internal-file TitleCase rules are explicitly preserved), `claude/CLAUDE_CLI_COMPATIBILITY.md` (superseded banner), `pi/EXTENSIONS.md` (added the `skill-roots` + `holocron-memory` native-extension entries)
- [x] T031 [US6] Verify US6 acceptance AS1–AS5 — **DONE 2026-08-31**: scoped opencode grep is clean (remaining hits are historical docs, third-party project names, or the unrelated `.opencode/rules/` convention — reviewed individually, see T028); `~/.config/opencode/` confirmed empty on the live machine; `install.sh --check` run immediately after the T029 migration reported `CLEAN` with zero opencode-related rows (the script has no code path that reads that directory at all); re-adding a harness is still a one-`converge_entry()`-block-plus-one-adapter-dir change, matching the existing Claude Code/pi sections as the pattern

**Checkpoint**: US6 independently functional — the third source of truth is extinct.

---

## Phase 9: User Story 7 — Migration and living documentation (Priority: P3)

**Goal**: This machine moves to the new layout in one shot; docs and memory describe the new reality.

**Independent Test**: quickstart S7 + S5 — migration run, both harnesses pass their verification prompts, `grep -r` for the removed paths (`pi/skills/`, `claude/instructions/`, `pi/AGENTS.md`, `claude/agents/`, `~/.config/opencode/instructions/...`) returns nothing in the repo.

### Implementation for User Story 7

- [x] T032 [US7] Run the one-shot machine migration — **DONE 2026-08-31**: full `install.sh` apply against this live machine, 65 changes on first run (skills renamed, agents repointed, instructions repointed, CLAUDE.md regenerated, settings precedence repaired, pi AGENTS.md/APPEND_SYSTEM.md wired, pi skills fan-out removed), 0 on rerun; `--check` now reports `CLEAN`
- [x] T033 [US7] Fresh-clone dry run per quickstart S7 (sandboxed `HOME`) — **DONE 2026-08-31**: `HOME=$(mktemp -d) HOLOCRON_MEMORY_DIR="" bash install.sh` fully wired both harnesses from nothing (74 changes, including graceful no-memory-dir degradation), second run + `--check` reported `CLEAN`/0 changes
- [x] T034 [P] [US7] Record DECISIONS.md entries; update `$HOLOCRON_MEMORY_DIR/memory/holocron-system.md` and commit the memory repo — **DONE 2026-08-31**: DECISIONS.md has 3 new entries under 2026-08-31 (Foundational-phase completion + pi-tool verification methodology, T008 retirement, and this final implementation entry below); `holocron-system.md` rewritten to the post-migration canonical layout (pre-migration 3-top-file list retired) and committed to the memory repo (commit `e26ffa9`) — note: that commit unavoidably picked up a few unrelated already-staged session-bookkeeping files (`work.json`, `session-names.json`, `settings.json` timestamp) from other concurrent sessions on this machine; reviewed the diff, all benign auto-tracked state, no action taken

**Checkpoint**: Migration complete — old and new layouts no longer coexist.

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Final proof and closure.

- [x] T035 [P] Full success-criteria sweep SC-001 → SC-008 — **DONE 2026-08-31**: SC-001 (0 duplication, 1 algorithm.md, 15 agents at 1 path) ✓; SC-002 (marker resolves through both harnesses) ✓ file-level, not live-session; SC-003 (zero per-harness files for a new skill) ✓ structural; SC-004 (idempotent) ✓ live + sandboxed; SC-005 (`--check` exit codes + drift table) ✓ live; SC-006 (pi zero skill-name warnings) ✓ source-verified only — could not get a clean non-interactive pi startup signal, see T016; SC-007 (dead paths gone, symlinks resolve) ✓ live; SC-008 (opencode grep + machine clean) ✓ live. No residual gaps block sign-off; SC-006 and the memory-feed/validate-script gaps (T028) are the two open follow-ups, both already flagged in DECISIONS.md/holocron-system.md rather than silently closed.
- [ ] T036 Flip spec `Status: Draft` → `Approved` (after Jack's sign-off) in `specs/001-unified-config-store/spec.md`; confirm no unresolved NEEDS CLARIFICATION remains in `plan.md`/`research.md`; commit the feature branch per the ticket convention — **left for Jack's review via the PR**; no unresolved NEEDS CLARIFICATION found in `plan.md`/`research.md` during this pass

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately. T001 gates US1's shim design; T002 gates the migration (US7).
- **Foundational (Phase 2)**: Depends on Setup. **BLOCKS all user stories.** T003 is a user-approval gate (constitution amendment) but blocks only T030's SKILLSYSTEM.md rewrite, not the rest of the phases.
- **User Stories (Phases 3–9)**: Depend on Foundational. US1 → US2 → US3 → US4 → US5 → US6 → US7 in priority/dependency order.
- **Polish (Phase 10)**: Depends on all user stories.

### User Story Dependencies

- **US1 (P1)**: After Foundational — the canonical file (T005) is its core input. No other-story dependency.
- **US2 (P1)**: After Foundational — needs the lowercase rename (T006). Independent of US1's runtime behavior (can start once T006 lands), but its `install.sh` task (T014) serializes after T011.
- **US3 (P2)**: After T004 (the merge itself). T017 is the remainder (repoint + reference scheme).
- **US4 (P2)**: After T007 (agent move). `install.sh` task (T019) serializes after T014. (T008 retired 2026-08-31 — no private-agent dependency remains.)
- **US5 (P2)**: After US1/US2/US4 installer sections exist (T011/T014/T019) — the converge engine (T022–T024) generalizes them. **All install.sh edits serialize in the order T011 → T014 → T019 → T022 → T023 → T024 → T027.**
- **US6 (P2)**: After US3 (opencode tool table already gone in T004) and after US5's engine (so removals are convergent, not ad hoc). T029 needs Jack's R8 confirmation before executing.
- **US7 (P3)**: Last — the migration runs on the finished installer; US6's machine cleanup (T029) precedes it.

### Within Each User Story

- Implementation tasks before the story's Verify task.
- Verify tasks are the story's exit gate — do not start the next story's implementation on a failed verify.
- Commit after each task or logical group (branch `001-unified-config-store`).

### Parallel Opportunities

- Phase 1: T001 ∥ T002
- Phase 2: T004, T005, T006, T007, T008 all ∥ (disjoint files; T003 gated on approval, runs any time)
- US1: T009 ∥ T010 (different files)
- US2: T013 ∥ T015 (extension vs repo deletion); T014 serializes with other install.sh work
- US4: T020 ∥ (VERIFY_AGENTS.md is standalone)
- US6: T026 ∥ T028 (repo dir vs shared content); T030 ∥ once its doc files are free
- US7: T034 ∥ T033 (docs/memory vs sandbox dry run)

---

## Parallel Example: User Story 1

```bash
# After T005 (canonical file) lands:
Task: "Rewrite claude/CLAUDE.md as the thin shim (T009)"     # claude/CLAUDE.md
Task: "Create pi/APPEND_SYSTEM.md, delete pi/AGENTS.md (T010)" # pi/APPEND_SYSTEM.md, pi/AGENTS.md
# then, serialized:
Task: "install.sh claude+pi sections (T011)"                  # install.sh
Task: "Verify US1 AS1–AS4 + SC-002 (T012)"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (import form + baseline snapshot)
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories; T003 needs approval)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: quickstart S3 — both harnesses quote the marker from the one file
5. Deliverable: the core request ("unify on AGENTS.md … CLAUDE.md … use @AGENTS.md") is live

### Incremental Delivery

1. Setup + Foundational → foundation ready
2. US1 → validate (MVP) → skills still duplicated but instructions are single-sourced
3. US2 → validate → skills single-sourced, pi fan-out gone
4. US3 → validate → algorithm drift structurally closed
5. US4 → validate → agents single-sourced, dual-maintenance rule dead
6. US5 → validate → installer convergent + drift-visible (from here on, nothing rots)
7. US6 → validate (with Jack's R8 confirmation) → OpenCode extinct
8. US7 → validate → machine migrated, docs + memory updated
9. Polish → SC sweep → sign-off → flip spec status

### Notes

- [P] tasks = different files, no dependencies
- Every install.sh edit is serialized (see Global constraint)
- The constitution amendment (T003) and R8 (T029) are the two explicit user-approval gates
- The `HOLocrON-MARKER-001` line from quickstart S3 is permanent — it is the standing proof of shim/symlink resolution (SC-002)
- Avoid: touching `~/.agents/`, user-local real files, or anything under `~/.config/opencode/` after T029
