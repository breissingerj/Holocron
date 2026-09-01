# Feature Specification: Unified Config Store — Single-Source AGENTS.md, Skills, and Agents (Claude Code + pi)

**Feature Branch**: `001-unified-config-store`

**Created**: 2026-08-28

**Status**: Approved (2026-09-01, Jack's sign-off via PR #68 merge)

**Input**: User description: "Eliminate the duplication of settings and skill files across the repo and across my computer. Unify on AGENTS.md files — at the top level just have my CLAUDE.md use @AGENTS.md to pull in those instructions. Skills, agents.md, etc. should all be stored in the claude file structure by default and harnesses like pi should be extended to read from those directories rather than duplicating file locations." Scope addition (same day): "Remove opencode support from the repo. Focus only on Claude and pi."

---

## Problem Statement

Holocron currently carries the same core knowledge in multiple hand-maintained copies that have already drifted:

| Artifact | Copies today | Evidence of drift |
|---|---|---|
| Global instruction file | 3: `instructions/AGENTS.md` (opencode), `claude/CLAUDE.md` (claude), `pi/AGENTS.md` (pi) | Each embeds harness-specific tool names/paths inline (`~/.config/opencode/...` vs `~/.claude/...`); memory section rewritten per harness (Graphiti vs obsidian-MCP vs priming extension) |
| `algorithm.md` | 2: `instructions/algorithm.md` + `claude/instructions/algorithm.md` | 84-line diff: harness tool tables differ **and** 4 `<!-- reflect: -->` learnings applied to the shared copy were never ported to the Claude copy (12 vs 8 as of 2026-08-28) |
| Agents (16) | 2 per agent: `claude/agents/` + `opencode/agents/` (bodies must stay byte-synced by manual rule in `VERIFY_AGENTS.md`) | Manual "dual-maintenance rule"; drift is only caught by re-reading both files |
| Skills (20 public + private) | 1 public canonical, fanned out to 3 live homes with per-file symlinks + **13 pi wrapper `SKILL.md` files** that duplicate canonical frontmatter (differ only in the case of `name`) | Wrappers exist solely because canonical names are CamelCase; pi is actually lenient on name/dir mismatch |
| Live machine pointers | `install.sh` granular fan-out into `~/.claude/`, `~/.config/opencode/`, `~/.pi/agent/` | Already drifted: `~/.claude/settings.json` links to the repo **template** instead of the memory-repo override `install.sh` is supposed to prefer; `~/.claude/skills` contains hand-added external symlinks no install step creates; the live Claude daemon rewrites `~/.claude/settings.json` (a symlink into the repo), churning the repo working tree |

This violates the project's own Constitution Principle I (*Harness-Agnostic Core*: "Harness-specific glue … is treated as disposable adapter code, never as the source of truth for behavior") and Principle II (which names `instructions/AGENTS.md` + `instructions/algorithm.md` as canonical — two of the three top-level files are not that file).

**Harness scope**: OpenCode is **retired** as part of this work (user direction, 2026-08-28). The repo, installer, and migration remove all OpenCode adapter content; the two supported harnesses are **Claude Code** (canonical file structure) and **pi** (extended to read the shared store). This follows the repo's own precedent (DECISIONS.md 2026-03-17: "Remove Claude Code harness support" — harness scope is user-directed and reversible).

## Target Architecture (one sentence)

One canonical set of files in the Holocron repo — `instructions/AGENTS.md`, `instructions/algorithm.md`, `skills/<lowercase-slug>/`, `agents/<Name>.md`, `commands/` — laid out in the **Claude Code file structure** by default, consumed by pi either **natively** (it reads `AGENTS.md` directly and gets the shared skill/prompt roots via a `resources_discover` extension) or via a **thin shim** (Claude Code's `~/.claude/CLAUDE.md` = `@AGENTS.md` + a handful of Claude-only rules), with `install.sh` converging the live machine and reporting drift — and with **zero OpenCode-specific content** remaining in the repo.

### Key design constraints discovered during survey

1. **pi does not expand `@`-imports in context files** (verified in pi source: `loadContextFileFromDir` reads the file raw). Claude Code **does** expand `@`-imports in CLAUDE.md (relative to the importing file; `~` and env-var paths already proven in the current shim).
   → The canonical `AGENTS.md` must be **self-contained** for always-on content. Heavy docs (`algorithm.md`, `PRDFORMAT.md`) stay separate and are referenced as *read-at-runtime* instructions ("read `$HOLOCRON_DIR/instructions/algorithm.md`") — a pattern that already works in both harnesses.
2. **pi loads `AGENTS.md` or `CLAUDE.md`** (AGENTS.md preferred) from `~/.pi/agent/` and walks up from cwd (verified in pi source). → A single file at the canonical path can serve pi globally via symlink; no pi-specific top file is needed for shared behavior.
3. **pi supports a `resources_discover` extension event** returning `skillPaths` / `promptPaths` (first-class API, documented) and natively reads `~/.agents/skills` + `.agents/skills`. → pi can consume the shared skill root directly; the 13 wrapper skills and the `~/.pi/agent/skills` fan-out become deletable.
4. **pi is lenient on skill name ≠ directory name** (documented: "suboptimal for shared skill directories used across multiple harnesses"). → The wrappers are redundant *today*, but normalizing canonical names to the Agent Skills standard (lowercase-hyphen, name == dir) removes warnings in pi and keeps the store usable by any future strict harness.
5. **pi supports `APPEND_SYSTEM.md`** in `~/.pi/agent/` (append to system prompt without replacing it). → The pi-only sections of the current `pi/AGENTS.md` (TillDone workflow, `graphiti_*` tool guidance, `HOLOCRON_MEMORY_BACKEND` toggle) move to a declarative overlay file — no extension code needed for instructions.
6. **Settings files are format-specific** (Claude `settings.json`, pi `settings.json`) — schemas cannot be unified. Their *placement* and *precedence* (repo template < memory-repo personal override < harness-local `settings.local.json`) can and must be made deterministic.
7. **Only two harnesses remain** → the 16 shared agents need exactly one format (Claude's, which is the canonical file structure). No frontmatter generator is required; `opencode/agents/` (16 files) is deleted outright, and the `VERIFY_AGENTS.md` dual-maintenance rule dies with it.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — One global instruction file, two harnesses (Priority: P1)

I (Jack) want to change a core behavioral rule once in one file and have it take effect in Claude Code and pi without hunting for per-harness copies.

**Why this priority**: The top-level files are the highest-churn, highest-drift duplication; every other duplication (agents, skills) hangs off them. This is the heart of the request ("unify on AGENTS.md files … CLAUDE.md … use @AGENTS.md").

**Independent Test**: Edit one sentence in the canonical global instruction file; start (or `/reload`) a session in each harness; confirm the changed sentence is in each harness's effective instructions. No second file edit required.

**Acceptance Scenarios**:

1. **Given** the merged canonical file at `instructions/AGENTS.md` and a fresh `install.sh` run, **When** I start a Claude Code session, **Then** `~/.claude/CLAUDE.md` resolves as a thin shim whose `@AGENTS.md` import expands to the canonical content (verifiable via `/context` or by asking the agent to quote a unique marker line).
2. **Given** the same install, **When** I start a pi session, **Then** `~/.pi/agent/AGENTS.md` symlinks to the same canonical file and the pi-specific overlay (TillDone, Graphiti tooling, backend toggle) is present via `~/.pi/agent/APPEND_SYSTEM.md` without any of it living in the canonical file.
3. **Given** a rule that applies to only one harness (e.g., Claude's `/rename` session-naming rule, pi's TillDone contract), **When** I change it, **Then** the edit touches only that harness's thin shim/overlay — the canonical file is untouched.
4. **Given** the canonical file, **When** it is read by pi (which does not expand `@`-imports), **Then** it contains no `@`-import lines that require expansion to be meaningful (self-contained for always-on content; heavy docs referenced by explicit "read this file" instructions).

---

### User Story 2 — Skills stored once, consumed by both harnesses (Priority: P1)

I want to add or edit a skill in the repo once and have it available in Claude Code and pi with no per-harness wrapper files and no per-machine fan-out maintenance.

**Why this priority**: Second-largest duplication (20 skills × 3 homes + 13 wrapper files) and an explicit part of the request ("Skills … should all be stored in the claude file structure by default and harnesses like pi should be extended to read from those directories").

**Independent Test**: Create `skills/demo-skill/SKILL.md` in the repo (lowercase name). Without touching any harness directory, confirm the skill is listed in both harnesses after reinstall/`/reload`.

**Acceptance Scenarios**:

1. **Given** canonical skills at `skills/<lowercase-slug>/` with Agent-Skills-compliant frontmatter (`name` == directory, lowercase-hyphen), **When** I run a fresh install, **Then** no skill exists on disk more than once, and every live copy is a symlink or an extension-provided path.
2. **Given** a pi session, **When** skills are discovered, **Then** the shared skill root is registered via the pi `resources_discover` extension, the `~/.pi/agent/skills/` fan-out directory no longer exists, and pi reports **zero** skill-name warnings.
3. **Given** a private skill in `$HOLOCRON_MEMORY_DIR/skills/` whose name collides (case-insensitively) with a public skill, **When** it installs, **Then** the collision is merged at file level (private file wins / adds files) — this is the only place per-file merging is allowed.
4. **Given** a private skill that exists only in the memory repo, **When** it installs, **Then** it is discoverable in both harnesses via a single directory symlink (or extension path for pi).
5. **Given** externally installed skills in `~/.agents/skills/` (e.g., `bedrock-ui`, `autodesk-forma-poweruser`), **When** Holocron installs, **Then** pi reads them natively and Claude Code continues to see them — Holocron's installer must neither delete nor shadow them.
6. **Given** an existing reference to a renamed skill (e.g., Fabric pattern paths in `algorithm.md`, `USE WHEN` cross-references in other skills), **When** the rename lands, **Then** all in-repo references are updated in the same change and a grep for the old CamelCase skill path returns nothing.

---

### User Story 3 — One algorithm doc (Priority: P2)

I want a single `algorithm.md` so that learnings from `/reflect` are never silently applied to only one harness's copy again.

**Why this priority**: The two algorithm copies have *already* diverged by 84 lines including unported reflections — a proven, recurring failure mode, not a hypothetical one.

**Independent Test**: Confirm exactly one `algorithm.md` exists in the repo; run `/reflect` in one harness; confirm the updated file is the one every harness reads (same inode/path).

**Acceptance Scenarios**:

1. **Given** the merge, **When** I grep the repo, **Then** `algorithm.md` exists at exactly one path and `claude/instructions/` no longer exists.
2. **Given** harness-specific tool tables (Claude `WebFetch`/subagent types vs pi tools), **When** each harness loads the doc, **Then** its own tool table is present and readable; the other harness's table is in a clearly-delimited, labeled subsection that does not confuse the active harness. The opencode tool table is **deleted**, not migrated.
3. **Given** the 4 `<!-- reflect: -->` entries currently missing from the Claude copy, **When** the merge lands, **Then** all of them are present in the single file.
4. **Given** all top-level files and skills that reference `algorithm.md` by absolute path, **When** they are read, **Then** they reference it via one consistent resolution scheme (env var `$HOLOCRON_DIR` with documented fallback to the canonical file's own location) — no harness-specific absolute paths remain in shared content.

---

### User Story 4 — Agents defined once, in the claude file structure (Priority: P2)

I want each of the 16 shared agents to have exactly one file in the repo, in Claude format, with no second harness copy to keep in sync.

**Why this priority**: The manual "both directories must stay in behavioral sync" rule is the most error-prone maintenance obligation in the repo; with OpenCode gone, the second copy simply disappears.

**Independent Test**: Change the Engineer agent's persona in `agents/Engineer.md`; reinstall; confirm `~/.claude/agents/Engineer.md` carries the new persona; confirm no `opencode/agents/` exists anywhere in the repo.

**Acceptance Scenarios**:

1. **Given** canonical `agents/<Name>.md` files in Claude frontmatter format (moved from `claude/agents/`), **When** I run the install, **Then** `~/.claude/agents` receives exactly one link per agent (plus any private agents from the memory repo), and no per-harness variant or generator output exists.
2. **Given** a body edit to any canonical agent, **When** I reinstall, **Then** no second file needs editing and no dual-maintenance rule applies.
3. **Given** `pi/agents/` (pi-native roster: algorithm phase agents, researcher agents, chains), **When** this change lands, **Then** it is untouched — it is a different decomposition, not a duplicate.
4. **Given** the `VERIFY_AGENTS.md` dual-maintenance rule, **When** this change lands, **Then** it is replaced by a single-harness (Claude) verification prompt plus a drift check in `install.sh --check`.
5. **Given** private agents in `$HOLOCRON_MEMORY_DIR/agents/claude/`, **When** they install, **Then** they are linked alongside the public agents exactly as today (name collision → the same sanctioned file-level merge as skills).

---

### User Story 5 — The machine converges, and drift is visible (Priority: P2)

I want `install.sh` to be safe to re-run at any time: it repairs stale links (like today's `~/.claude/settings.json` → template drift), detects daemon-caused churn, and I can ask it to *report* drift without changing anything.

**Why this priority**: Every duplication fix above rots back into duplication the moment the installer can't re-converge the machine; today's drift proves that happens.

**Independent Test**: Deliberately replace one live symlink with a stale copy; run the install in check mode (reports the drift, changes nothing); run it in apply mode (repairs it); run check mode again (clean).

**Acceptance Scenarios**:

1. **Given** a live pointer that targets the wrong source (stale, dangling, or hand-edited), **When** I run `install.sh`, **Then** it is repaired to the expected target and the repair is printed.
2. **Given** a live pointer that is correct, **When** I run `install.sh` again, **Then** it reports zero changes (idempotent).
3. **Given** `install.sh --check`, **When** I run it, **Then** it exits non-zero and prints a table of drifted/missing/dangling/unexpected pointers (including a settings-precedence violation and content churn inside a linked repo file) without modifying the filesystem.
4. **Given** settings precedence, **When** `$HOLOCRON_MEMORY_DIR/settings.json` exists, **Then** `~/.claude/settings.json` links to it (not the repo template); **when** it does not exist, **Then** the repo template is linked and the installer says so. The same rule applies to `~/.pi/agent/settings.json` via `pi-settings.json`.
5. **Given** a harness that is not installed on the machine (e.g., no `~/.pi/`), **When** I run `install.sh`, **Then** that harness's section is skipped with a notice and the run still succeeds.

---

### User Story 6 — OpenCode is fully removed (Priority: P2)

I want the repo, the installer, and my machine to contain no OpenCode adapter content, so that "supported harnesses" is unambiguously Claude Code and pi.

**Why this priority**: Leaving dead OpenCode sections in `install.sh`, `opencode/`, and the docs preserves a second "source of truth" by inertia — the exact disease this spec treats. (P2 rather than P1 because it deletes rather than builds; it lands with the migration.)

**Independent Test**: `grep -ri opencode` over the repo (excluding `DECISIONS.md` history, this spec, and the constitution's portability rationale) returns no live adapter content; `~/.config/opencode/` contains no Holocron-managed pointers.

**Acceptance Scenarios**:

1. **Given** the migration, **When** I inspect the repo, **Then** the `opencode/` directory (agents, plugins, `PLUGINS.md`) is deleted, `install.sh`/`install.ps1` have no OpenCode section, and shared content (`instructions/`, `skills/`, `agents/`, `commands/`) contains no OpenCode-specific tool names or paths (the opencode tool table in `algorithm.md` is deleted per US3 AS2).
2. **Given** the migration on this machine, **When** I inspect `~/.config/opencode/`, **Then** all Holocron-created pointers (`AGENTS.md`, `commands`, `instructions`, `scripts`, `plugins`, the `agents/` and `skills/` fan-out dirs, and the `opencode.json` symlink — installer-created, confirmed for removal by user decision 2026-08-28) are removed, while anything the user created or that belongs to OpenCode itself (real files, OpenCode's own state) is left untouched, and a notice is printed listing what was removed.
3. **Given** the OpenCode section of `install.sh` removed, **When** I run the installer, **Then** it never creates, modifies, or removes anything under `~/.config/opencode/`.
4. **Given** a future desire to support OpenCode again, **When** it is added, **Then** Constitution I still applies: it is achievable as a small additive change (one installer section + one thin adapter) without touching `instructions/`, `skills/`, `agents/`, or `commands/`.
5. **Given** the documentation, **When** it is updated, **Then** `README.md`, `instructions/SKILLSYSTEM.md`, `VERIFY_AGENTS.md`, `CLAUDE_CLI_COMPATIBILITY.md`, and `pi/EXTENSIONS.md` name exactly two supported harnesses.

---

### User Story 7 — Migration and living documentation (Priority: P3)

I want to move my current machine to the new layout in one shot, with the docs describing the new reality instead of the old one.

**Why this priority**: Without a migration, the old and new layouts coexist and the duplication re-emerges; without doc updates, the next agent (or me, next month) re-derives the old model.

**Independent Test**: Run the migration on this machine; both harnesses pass their verification prompts; `grep -r` for the removed paths (`pi/skills/`, `claude/instructions/`, `pi/AGENTS.md`, `claude/agents/`, `~/.config/opencode/instructions/...` references inside shared content) returns nothing in the repo.

**Acceptance Scenarios**:

1. **Given** this machine's current live state, **When** I run the migration, **Then** old links (e.g., `~/.pi/agent/AGENTS.md → pi/AGENTS.md`, `~/.claude/CLAUDE.md → claude/CLAUDE.md` old shim) are replaced, wrapper skill dirs removed, `~/.pi/agent/skills` removed, OpenCode pointers removed (US6), and both harnesses start cleanly with the same effective instructions.
2. **Given** the migration, **When** I inspect the repo, **Then** `pi/AGENTS.md`, `pi/skills/` (wrappers), `claude/instructions/`, `claude/agents/`, and `opencode/` are gone, and `claude/CLAUDE.md` is the thin shim.
3. **Given** a fresh clone on a clean machine with `HOLOCRON_MEMORY_DIR` set, **When** I run `install.sh` once, **Then** both harnesses are fully wired (US1–US4 acceptance tests pass).
4. **Given** this spec's decisions, **When** the work is done, **Then** `DECISIONS.md` contains entries for each non-trivial choice and the memory repo's `holocron-system.md` is updated to the new canonical layout.

---

### Edge Cases

- **pi has no `@`-import support** — the canonical file must never *require* expansion to be correct (US1 AS4). Claude's shim may freely use `@`-imports; pi never does.
- **Claude Code `@`-import depth** (limited, historically 5 levels) — the shim is one level deep (`CLAUDE.md → AGENTS.md`); `AGENTS.md` itself contains no imports. No depth risk.
- **Two files of the same name in one directory** — Claude Code reads `~/.claude/CLAUDE.md` (not AGENTS.md), pi prefers `AGENTS.md` over `CLAUDE.md`. The layout must never rely on a harness reading *both* in the same directory.
- **Private/public name collision (skills or agents)** — only sanctioned file-level merge point (US2 AS3, US4 AS5); every other resource is a whole-directory or per-file symlink/extension path. Detection must be case-insensitive (macOS default filesystem).
- **`~/.agents/skills` external skills** — pi-native location; the installer must not create a competing pointer for the same skill names (collision → merge rule, never a second live copy).
- **`HOLOCRON_DIR` unset** — shared content must degrade gracefully: resolve the Holocron root from the canonical file's own location (it lives at `<root>/instructions/AGENTS.md`), and document `export HOLOCRON_DIR=…` as the primary mechanism.
- **Repo moved/renamed** — all live pointers are absolute symlinks; a `git pull` after a repo move leaves every link dangling. The installer's check mode (US5) must detect dangling links as a drift class.
- **Claude daemon writes through `~/.claude/settings.json`** — the symlink means daemon-side rewrites (e.g., key reordering) land in the repo working tree. `--check` must flag churn inside linked repo files; the plan should evaluate whether `settings.json` should instead be a *copy* (not a link) with documented update semantics, accepting a one-time divergence cost to protect the repo.
- **OpenCode still installed on the machine** — removal is Holocron-scoped: the installer stops touching `~/.config/opencode/`, and the migration removes only Holocron-created entries there. If OpenCode itself needs its config, that is the user's (or OpenCode's) concern, not Holocron's.
- **`install.ps1` (Windows)** — out of scope for v1 (this machine is macOS), but the ps1 must not be left silently broken: it either gets the same converge+check contract or prints a "not yet updated" notice. The OpenCode section must be removed from it regardless (US6 AS1 covers both installers).
- **A harness is upgraded and changes its discovery paths** — the per-harness adapter is a thin, disposable layer by Constitution I; the failure mode is a broken link in one home, detected by `--check`, fixable by touching one harness section of `install.sh`.
- **Reflections land while the old Claude copy still exists** — migration ordering: merge `algorithm.md` (US3) must land *before* or *with* retiring `claude/instructions/`, never after, to avoid a new divergence window.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST maintain exactly one canonical global instruction file at `instructions/AGENTS.md` containing all harness-agnostic behavior (identity, execution modes, memory contract, critical rules) with no harness-specific tool names, paths, or absolute home-directory references in shared content.
- **FR-002**: The system MUST NOT use `@`-import syntax inside the canonical global instruction file. Claude Code MUST consume it via a shim (`~/.claude/CLAUDE.md` containing `@AGENTS.md`); pi MUST consume the same file via a symlinked `AGENTS.md` at `~/.pi/agent/`.
- **FR-003**: Harness-specific always-on instructions MUST live in thin per-harness adapters: for pi, `APPEND_SYSTEM.md` (linked from `~/.pi/agent/`); for Claude, the tail of the `CLAUDE.md` shim or `claude/` adapter files. Adapters MUST contain no content that is also in the canonical file.
- **FR-004**: The system MUST maintain exactly one `instructions/algorithm.md`. Harness-specific tool tables for Claude Code and pi MUST be embedded as clearly-labeled subsections within that single file. All `<!-- reflect: -->` learnings MUST be present in it. The OpenCode tool table MUST be deleted.
- **FR-005**: Shared content MUST reference Holocron repo files via `$HOLOCRON_DIR` (with the documented fallback of resolving from the canonical file's own location) instead of per-harness absolute paths.
- **FR-006**: Every public skill MUST live at `skills/<name>/SKILL.md` where `name` is lowercase a-z/0-9/hyphen and equals the frontmatter `name` (Agent Skills standard). The `pi/skills/` wrapper directory MUST be deleted.
- **FR-007**: pi MUST consume the shared skill root (and prompt root) via a `resources_discover` extension rather than a `~/.pi/agent/skills` fan-out. The `~/.pi/agent/skills` directory MUST be removed by the migration.
- **FR-008**: For Claude Code, each skill MUST appear in the live home as exactly one whole-directory symlink (public, private, or external). File-level merging MUST be permitted only where a private skill's name collides (case-insensitively) with a public skill's name.
- **FR-009**: Each of the 16 shared agents MUST have exactly one canonical file in a single repo `agents/` directory, in Claude Code frontmatter format (moved from `claude/agents/`). No per-harness variant, generator, or second copy may exist.
- **FR-010**: `pi/agents/` (pi-native roster and chains) MUST remain hand-maintained and is explicitly out of scope for FR-009.
- **FR-011**: `install.sh` MUST be convergent: re-running it repairs stale, dangling, or missing live pointers to the expected state and MUST print every repair.
- **FR-012**: `install.sh --check` MUST report drifted/missing/dangling/unexpected pointers (including settings-precedence violations and content churn inside a linked repo file) and exit non-zero without modifying the filesystem.
- **FR-013**: Settings resolution MUST follow documented precedence: repo template < `$HOLOCRON_MEMORY_DIR` personal override < harness-local user file (e.g., `settings.local.json`). The installer MUST link the highest-precedence *Holocron-managed* source and never overwrite a harness-local user file.
- **FR-014**: The migration MUST be one-shot and idempotent; it MUST remove `pi/AGENTS.md`, `pi/skills/`, `claude/instructions/`, `claude/agents/` (moved to `agents/`), `opencode/` (deleted), and the old per-harness `AGENTS.md`/`CLAUDE.md` source files; it MUST update `README.md`, `instructions/SKILLSYSTEM.md`, `VERIFY_AGENTS.md`, `CLAUDE_CLI_COMPATIBILITY.md`, and `pi/EXTENSIONS.md` in the same change.
- **FR-015**: After migration, the effective instructions in both harnesses MUST be behaviorally identical except for the content of each harness's own adapter (US1 AS3).
- **FR-016**: The installer MUST NOT create, delete, or shadow any resource under `~/.agents/` (external skill location).
- **FR-017**: Every non-trivial decision made during implementation MUST be recorded in `DECISIONS.md`, and `$HOLOCRON_MEMORY_DIR/memory/holocron-system.md` MUST be updated to the new canonical layout when the work completes.
- **FR-018**: The repository MUST contain no OpenCode adapter content after migration: `opencode/` deleted; no OpenCode section in `install.sh` or `install.ps1`; no OpenCode-specific tool names or paths in shared content (`instructions/`, `skills/`, `agents/`, `commands/`, root docs). Historical mentions in `DECISIONS.md` and the constitution's portability rationale are exempt.

### Success Criteria

1. **SC-001**: After migration, a `grep -r` of the repo shows `AGENTS.md`/instruction content duplicated across harnesses in exactly **0** places; `algorithm.md` exists at exactly **1** path; each of the 16 agents at exactly **1** path.
2. **SC-002**: Both harnesses pass a verification prompt: each correctly answers "what is the canonical location of the global instructions?" with `instructions/AGENTS.md`, and each quotes a unique marker line proving the `@`-import (Claude) or symlink (pi) resolved.
3. **SC-003**: A new skill added to `skills/` appears in both harnesses with **zero** per-harness files created (pi via the extension; Claude via directory symlink).
4. **SC-004**: `install.sh` run twice in a row: first converges (prints repairs), second prints "no changes".
5. **SC-005**: `install.sh --check` exits non-zero on a deliberately introduced stale link and prints it in the drift table; exits 0 on a clean machine.
6. **SC-006**: pi starts with **zero** skill-name warnings.
7. **SC-007**: `~/.pi/agent/skills/`, `pi/skills/`, `claude/instructions/`, and `opencode/` no longer exist; `~/.pi/agent/AGENTS.md` and `~/.claude/CLAUDE.md` resolve (through link or import) to the single canonical file.
8. **SC-008**: `grep -ri opencode` over the repo (excluding `DECISIONS.md`, this spec, and the constitution's portability rationale) returns no live adapter content, and `~/.config/opencode/` contains no Holocron-managed pointers.

## Assumptions

- Claude Code's `@`-import in CLAUDE.md continues to work for repo-path imports (the current shim already relies on it). *Plan-time verification item: confirm relative vs `~` expansion semantics in a 2-minute test before implementation.*
- pi's `resources_discover` extension API and `APPEND_SYSTEM.md` behavior hold in the currently installed pi version (verified against installed source as of this spec's date).
- The memory repo (`$HOLOCRON_MEMORY_DIR`) is the correct home for personal overrides (private skills, private agents, personal `settings.json`), per the existing repo layout.
- OpenCode is retired as an active harness for this user. It may still be installed on the machine; Holocron simply stops serving it. Re-adding support is a future additive change under Constitution I.
- The 16 shared agents' canonical home is top-level `agents/` (Claude format), consistent with the 2026-03-18 decision's canonical agent location. `claude/agents/` is retired in its favor.

## Out of Scope

- **Re-adding OpenCode support** — deferred by user direction (2026-08-28); achievable additively per US6 AS4.
- **`pi/agents/`** — pi-native roster/chain structure is a different decomposition, not duplication.
- **Windows installer (`install.ps1`) v1 parity** — `install.sh` is the target; the ps1 gets at most a "not yet updated" guard (but its OpenCode section is removed regardless per FR-018).
- **Graphiti memory backend, model routing, and MCP server configuration** — out of scope for file deduplication.
- **Any changes to how `HOLOCRON_MEMORY_DIR` priming works in pi** (the extension that injects memory into the system prompt stays as-is).
- **Renaming the repo or the canonical file `instructions/AGENTS.md`** — Constitution Principle II names it; no change.
