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
- [ ] T004 [P] Merge `algorithm.md` into the single canonical `instructions/algorithm.md`: port all `<!-- reflect: -->` learnings missing from `claude/instructions/algorithm.md` (4 as of 2026-08-28 — count lines, not the spec's number, at execution time), embed clearly-labeled "Claude Code tools" and "pi tools" subsections, delete the OpenCode tool table; then delete `claude/instructions/` (merge must land with the retirement — never after, per spec edge case)
- [ ] T005 [P] Build the canonical `instructions/AGENTS.md`: merge shared content from `instructions/AGENTS.md` + `claude/CLAUDE.md` + `pi/AGENTS.md`; self-contained (zero `@`-import lines), zero harness-specific tool names/paths, repo-file references via `$HOLOCRON_DIR` with the documented fallback, OpenCode mentions stripped; keep the Constitution II naming
- [x] T006 [P] Rename the 13 CamelCase public skills in `skills/` to lowercase-hyphen slugs (edit `name` in each frontmatter so `name` == directory); update every in-repo reference to the old CamelCase paths (grep `skills/` references across `instructions/`, `skills/` cross-references, `agents/`, `commands/` — a grep for each old name must return nothing)
- [ ] T007 [P] `git mv` all 16 files from `claude/agents/` to a new top-level `agents/` (Claude frontmatter unchanged — verify one sample file parses); delete `opencode/agents/` (16 files, verified byte-identical names)
- [ ] T008 [P] Move private agents in the memory repo from `$HOLOCRON_MEMORY_DIR/agents/opencode/` to `$HOLOCRON_MEMORY_DIR/agents/` (verify Claude-compatible frontmatter on `LahzoChatTester.md` + `ProductManager.md`); commit per the memory-repo convention

**Checkpoint**: Foundation ready — one canonical AGENTS.md, one algorithm.md, lowercase skills, single `agents/` dir. User story implementation can now begin.

---

## Phase 3: User Story 1 — One global instruction file, two harnesses (Priority: P1) 🎯 MVP

**Goal**: Change a core behavioral rule once in `instructions/AGENTS.md` and have it take effect in both harnesses via the Claude shim + pi symlink/overlay.

**Independent Test**: quickstart S3 — edit one sentence in the canonical file; start (or `/reload`) a session in each harness; confirm the changed sentence is in each harness's effective instructions with no second file edit.

### Implementation for User Story 1

- [ ] T009 [US1] Build the Claude shim as a **generated concatenation** (per T001 finding — `@`-import mechanism retired, see R1 + DECISIONS.md 2026-08-28): new tracked file `claude/claude-tail.md` holding the Claude-only content (execution modes, memory-retrieval guidance, critical rules, `/rename` session naming); `install.sh` generates `claude/CLAUDE.md` = `instructions/AGENTS.md` + `claude/claude-tail.md` + primed `$HOLOCRON_MEMORY_DIR/memory/MEMORY.md` (hash-gated regen, GENERATED header); `claude/CLAUDE.md` becomes git-ignored; `~/.claude/CLAUDE.md` symlink unchanged. Remove all shared behavior from the tail (FR-003: no overlap with the canonical file)
- [ ] T010 [P] [US1] Create `pi/APPEND_SYSTEM.md` from the pi-specific sections of `pi/AGENTS.md` (TillDone workflow, `graphiti_*` tool guidance, `HOLOCRON_MEMORY_BACKEND` toggle, obsidian-search fallback); then delete `pi/AGENTS.md` (its shared content must already be in the canonical file from T005)
- [ ] T011 [US1] `install.sh` — claude section: link `CLAUDE.md` (shim) and settings with the fixed precedence (memory-repo `settings.json` override > repo template, per R3); pi section: link `~/.pi/agent/AGENTS.md` → repo `instructions/AGENTS.md` and `~/.pi/agent/APPEND_SYSTEM.md` → repo `pi/APPEND_SYSTEM.md`; drop all references to `pi/AGENTS.md`
- [ ] T012 [US1] Verify US1 acceptance AS1–AS4 + SC-002: Claude marker quote (shim import expanded), pi marker quote (symlink), one-harness-rule edits touch only the adapter, canonical file contains no `@`-import lines

**Checkpoint**: US1 independently functional — the heart of the request is live. MVP complete.

---

## Phase 4: User Story 2 — Skills stored once, consumed by both harnesses (Priority: P1)

**Goal**: A skill added to `skills/` once is available in both harnesses with zero per-harness wrapper files and zero fan-out maintenance.

**Independent Test**: quickstart S4 — create `skills/demo-skill/SKILL.md` (lowercase name); without touching any harness directory, confirm the skill is listed in both harnesses after reinstall/`/reload`.

### Implementation for User Story 2

- [ ] T013 [US2] Create `pi/extensions/skill-roots.ts`: `resources_discover` handler returning `skillPaths: [<repo>/skills, $HOLOCRON_MEMORY_DIR/skills]` (match the existing extension pattern, e.g. `pi/extensions/holocron-memory.ts`); no `promptPaths` (the native `prompts` symlink stays)
- [ ] T014 [US2] `install.sh` — skills: remove the pi skills fan-out logic entirely and (on migration) remove `~/.pi/agent/skills/`; claude skills: whole-directory symlinks for all 20 public + private skills with file-level merge ONLY on case-insensitive public/private collision (expected instance: memory-repo `skills/Agents` ↔ renamed public `skills/agents`); classify and preserve hand-added external symlinks in `~/.claude/skills/` (`autodesk-forma-poweruser`, `autodesk-forma-readonly`, `bedrock-ui`) as `EXTERNAL` (report, never delete — R6/FR-016)
- [ ] T015 [P] [US2] Delete `pi/skills/` (13 wrapper directories) from the repo; confirm no in-repo reference to the wrapper paths remains (grep `pi/skills`)
- [ ] T016 [US2] Verify US2 acceptance AS1–AS6 + SC-003 + SC-006: no skill exists on disk more than once (the `agents` collision is the single sanctioned merge), `~/.pi/agent/skills/` gone, pi reports zero skill-name warnings (specifically check the `Agents`(private)/`agents`(public) case pair — if pi warns, rename the memory-repo private skill per SKILLSYSTEM personal naming and re-test), externals untouched in both harnesses, old CamelCase path grep clean

**Checkpoint**: US1 + US2 independently functional — instructions and skills are single-sourced.

---

## Phase 5: User Story 3 — One algorithm doc (Priority: P2)

**Goal**: A single `instructions/algorithm.md` that both harnesses read, so `/reflect` learnings can never diverge again.

**Independent Test**: quickstart S5/S6 — `find . -name algorithm.md` returns exactly one doc path; run `/reflect` in one harness and confirm the updated file is the one every harness reads (same path).

### Implementation for User Story 3

- [ ] T017 [US3] Repoint the live `~/.claude/instructions` symlink from the retired `claude/instructions/` to repo `instructions/`; update all shared-content references to `algorithm.md` to the `$HOLOCRON_DIR` resolution scheme (FR-005) — top files, skills, commands; no harness-specific absolute paths remain in shared content
- [ ] T018 [US3] Verify US3 acceptance AS1–AS4: `algorithm.md` at exactly one repo path, `claude/instructions/` gone, all reflect learnings present (count vs `instructions/algorithm.md` baseline), both tool tables labeled and readable, OpenCode table absent, `$HOLOCRON_DIR` references consistent

**Checkpoint**: US3 independently functional — the proven 84-line-drift failure mode is structurally closed.

---

## Phase 6: User Story 4 — Agents defined once, in the claude file structure (Priority: P2)

**Goal**: Each of the 16 shared agents has exactly one canonical file in `agents/` (Claude format); the manual dual-maintenance rule is dead.

**Independent Test**: Change the Engineer agent's persona in `agents/Engineer.md`; reinstall; confirm `~/.claude/agents/Engineer.md` carries the new persona; confirm no `opencode/agents/` exists anywhere in the repo.

### Implementation for User Story 4

- [ ] T019 [US4] `install.sh` — claude agents: link via the existing `merge_link_agents` helper from repo `agents/` (16) + `$HOLOCRON_MEMORY_DIR/agents/` (2 private, per R5) into `~/.claude/agents/` (real dir, per-file symlinks, name collision → sanctioned file-level merge); `pi/agents/` + `~/.pi/agent/chains/` untouched (FR-010)
- [ ] T020 [P] [US4] Rewrite `VERIFY_AGENTS.md`: replace the dual-maintenance rule with a single-harness (Claude) verification prompt plus the `install.sh --check` drift reference
- [ ] T021 [US4] Verify US4 acceptance AS1–AS5: persona edit round-trips through reinstall, no second copy/variant/generator exists, `pi/agents/` untouched, private agents linked alongside public, `--check` flags an agent drift

**Checkpoint**: US4 independently functional — agent duplication eliminated.

---

## Phase 7: User Story 5 — The machine converges, and drift is visible (Priority: P2)

**Goal**: `install.sh` is safe to re-run at any time; `--check` reports drift (stale/dangling/missing/churned/precedence/external) without touching anything.

**Independent Test**: quickstart S1+S2 — replace one live symlink with a stale copy; `--check` reports it (exit 1, table row); apply mode repairs it (printed); `--check` again is clean (exit 0).

### Implementation for User Story 5

- [ ] T022 [US5] `install.sh` — converge engine: classify every managed live pointer against the data-model inventory (`data-model.md` §Pointer Inventory); apply mode creates/repairs/resets (CHURNED content reset from link target for `churn_check` pointers, per R2) and prints every action; second run prints `no changes`; missing harness homes skip with a notice (US5 AS5)
- [ ] T023 [US5] `install.sh --check` — drift table per `contracts/install-cli.md` (classes STALE/DANGLING/MISSING/CHURNED/PRECEDENCE = failure → exit 1; EXTERNAL/USER_LOCAL = informational); zero filesystem writes in check mode
- [ ] T024 [US5] `install.sh` — settings precedence implementation per R3: `~/.claude/settings.json` → memory-repo `settings.json` (exists) with template fallback + notice; never touch `~/.claude/settings.local.json`; pi settings managed only when the live path is a Holocron-created symlink (otherwise SKIPPED (user-local) — current machine state)
- [ ] T025 [US5] Verify US5 acceptance AS1–AS5 + SC-004 + SC-005: stale-link drill, idempotency drill, churn drill (edit `~/.claude/settings.json` through the link, check → CHURNED, apply → RESET, check → clean), precedence repair (the live `settings.json` → template drift is repaired to the memory-repo override), missing-harness skip

**Checkpoint**: US5 independently functional — the installer can no longer rot.

---

## Phase 8: User Story 6 — OpenCode is fully removed (Priority: P2)

**Goal**: Repo, installer, and machine contain no OpenCode adapter content; "supported harnesses" is unambiguously Claude Code + pi.

**Independent Test**: quickstart S5 — scoped `grep -ri opencode` over the repo returns no live adapter content; `~/.config/opencode/` contains no Holocron-managed pointers.

### Implementation for User Story 6

- [ ] T026 [US6] Delete `opencode/` from the repo (`agents/` already gone in T007; remaining: `plugins/` including the 7 TS plugin sources, `PLUGINS.md`)
- [ ] T027 [US6] Remove OpenCode from `install.sh` (the `HARNESSES["opencode"]` entry, the granular opencode section, the `opencode/AGENTS.md` + `opencode.json` links, the plugin dependency install step) and from `install.ps1` (the `HARNESSES["opencode"]` entry at line 17 and the `%APPDATA%\opencode` block at lines 90–95); add the ps1 "not yet updated for spec 001 — run install.sh" guard (R7)
- [ ] T028 [P] [US6] Scrub remaining OpenCode-specific tool names/paths from shared content (`instructions/`, `skills/`, `agents/`, `commands/`, `README.md`) — the opencode tool table in `algorithm.md` was already deleted in T004
- [ ] T029 [US6] Machine migration for `~/.config/opencode/`: remove Holocron-created pointers (`AGENTS.md`, `commands`, `instructions`, `scripts`, `plugins`, the `agents/` and `skills/` fan-out dirs); handle `opencode.json` per research.md R8 (**confirmed 2026-08-28: remove with notice** — the symlink was already removed early on 2026-08-28; T029 covers the remaining pointers and prints the full removal notice); print a removal notice listing every removed pointer; leave real user files and OpenCode's own state untouched
- [ ] T030 [P] [US6] Update documentation to name exactly two supported harnesses: `README.md` (§ Adding a new harness too), `instructions/SKILLSYSTEM.md` (naming section per the amended constitution + two-harness note), `CLAUDE_CLI_COMPATIBILITY.md`, `pi/EXTENSIONS.md` (`VERIFY_AGENTS.md` is handled by T020)
- [ ] T031 [US6] Verify US6 acceptance AS1–AS5: scoped opencode grep clean, machine inspection clean, a fresh `install.sh` run never creates/modifies/removes anything under `~/.config/opencode/`, re-adding a future harness is still a one-section-installer + one-adapter change (spot-check by reading the resulting install.sh structure)

**Checkpoint**: US6 independently functional — the third source of truth is extinct.

---

## Phase 9: User Story 7 — Migration and living documentation (Priority: P3)

**Goal**: This machine moves to the new layout in one shot; docs and memory describe the new reality.

**Independent Test**: quickstart S7 + S5 — migration run, both harnesses pass their verification prompts, `grep -r` for the removed paths (`pi/skills/`, `claude/instructions/`, `pi/AGENTS.md`, `claude/agents/`, `~/.config/opencode/instructions/...`) returns nothing in the repo.

### Implementation for User Story 7

- [ ] T032 [US7] Run the one-shot machine migration (full `install.sh` apply against the live machine): replace `~/.claude/CLAUDE.md` old-shim target with the new shim, repoint `~/.pi/agent/AGENTS.md` to the canonical file, repoint `~/.claude/instructions`, apply settings precedence, remove `~/.pi/agent/skills/` fan-out + wrapper remnants (US6 pointers already removed by T029); confirm both harnesses start cleanly with behaviorally identical effective instructions except adapters (FR-015)
- [ ] T033 [US7] Fresh-clone dry run per quickstart S7 (sandboxed `HOME`): one `install.sh` run fully wires both harnesses (US7 AS3)
- [ ] T034 [P] [US7] Record DECISIONS.md entries for every non-trivial decision made during implementation; update `$HOLOCRON_MEMORY_DIR/memory/holocron-system.md` to the new canonical layout (retire the "pre-migration" config-entry-point list) and commit the memory repo

**Checkpoint**: Migration complete — old and new layouts no longer coexist.

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Final proof and closure.

- [ ] T035 [P] Full success-criteria sweep SC-001 → SC-008 using quickstart S5/S6 + story verification results; fix any residual gap
- [ ] T036 Flip spec `Status: Draft` → `Approved` (after Jack's sign-off) in `specs/001-unified-config-store/spec.md`; confirm no unresolved NEEDS CLARIFICATION remains in `plan.md`/`research.md`; commit the feature branch per the ticket convention

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
- **US4 (P2)**: After T007 + T008 (agent moves). `install.sh` task (T019) serializes after T014.
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
