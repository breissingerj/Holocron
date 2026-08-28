# Research: Unified Config Store (spec 001)

Phase 0 output — resolves the spec's open assumptions and the validation pass's open design items. Every "verified" claim below was checked against the live repo/machine on 2026-08-28.

## R1 — Claude Code `@`-import semantics (spec Assumption #1)

**Decision**: The shim's first line uses `@$HOLOCRON_DIR/instructions/AGENTS.md` if `$HOLOCRON_DIR` is exported in the Claude process environment; otherwise `@/Users/jbreissinger/Projects/PersonalProjects/Holocron/instructions/AGENTS.md` (absolute, `~`-equivalent). Relative bare imports (`@AGENTS.md`) are **not** used.

**Rationale**: Evidence from the live shim (`~/.claude/CLAUDE.md` → repo `claude/CLAUDE.md`): line 1 `@~/.config/opencode/instructions/steering-rules.md` (tilde-absolute) and line 2 `@$HOLOCRON_MEMORY_DIR/memory/MEMORY.md` (env-var path) both expand in production Claude Code sessions — `~` and `$ENV` forms are proven. Two remaining risks: (a) a *relative* import resolves relative to the symlink location (`~/.claude/`) or the real file location (repo `claude/`) — ambiguous for symlinked files, so avoid; (b) `$HOLOCRON_DIR` must be exported where Claude Code starts (it is, in the user's shell env — the live `@MEMORY.md` import proves env expansion works, but for a different variable; T001's 2-minute marker test confirms `$HOLOCRON_DIR` specifically and records the fallback choice).

**Alternatives considered**: Relative `@AGENTS.md` (rejected — symlink resolution ambiguity); per-machine absolute path hardcoded (rejected — breaks on repo move, which the spec's edge cases explicitly cover).

**Action**: T001 runs the marker test before US1 implementation and records the final shim form here.

## R2 — `settings.json`: symlink (FR-013) vs copy (spec edge case)

**Decision**: Keep **symlink** per FR-013; extend apply-mode semantics so that a *churned* linked file (content no longer matches its link target) is reset from the link target and the reset is printed.

**Rationale**: Live evidence: `~/.claude/settings.json` is a symlink into the repo and the Claude daemon rewrites it in place — `git status` shows `M claude/settings.json` right now. So churn is real and must be handled, but the fix is repair-on-rerun, not a different pointer type: the expected content is deterministic (it *is* the link target's content), so reset = copy-from-target, one line. This matches FR-011's "repairs … to the expected state and MUST print every repair" — churn-reset is an instance of it, and FR-012/US5 AS3 already mandate *detecting* churn; apply-mode *repairing* it closes the loop.

**Alternatives considered**: Copy-not-link with documented update semantics (rejected — violates Constitution VI's symlink doctrine, creates a second source of truth for Holocron-managed defaults, and the one-time divergence cost the spec prices in becomes a recurring reconciliation surface); `git checkout` of the repo file (rejected — only works when the target is the repo file; when the target is the memory-repo override, git-reset would be wrong or unavailable).

## R3 — Settings precedence + user-file protection (FR-013, US5 AS4)

**Decision**:
1. **Claude**: `~/.claude/settings.json` links to `$HOLOCRON_MEMORY_DIR/settings.json` when it exists (41 KB, confirmed present and recently updated), else to repo `claude/settings.json` with an installer notice. `~/.claude/settings.local.json` (real file, present) is never touched — it is the harness-local user file (highest precedence).
2. **pi**: the installer manages `~/.pi/agent/settings.json` **only if** the live path is a Holocron-created symlink (→ repo `pi/settings.json` template). In that case it links to `$HOLOCRON_MEMORY_DIR/pi-settings.json` (confirmed present) when it exists, else the template. If the live path is a real file — which is the **current state** (user-local content: `rivai` provider, theme, model) — the installer skips it and reports `SKIPPED (user-local file)`.

**Rationale**: FR-013's "never overwrite a harness-local user file" is the hard rule; "link the highest-precedence Holocron-managed source" applies only to Holocron-managed pointers. The pi case proves the distinction is load-bearing: a naive "link the override" would destroy the user's live provider config.

**Alternatives considered**: Merge user file over template at install (rejected — merge semantics for JSON settings are fragile and out of scope); leave pi settings entirely unmanaged (rejected — FR-013 requires the documented precedence for both harnesses).

## R4 — pi skill discovery via `resources_discover`

**Decision**: New extension `pi/extensions/skill-roots.ts` (plain TS, matching existing extensions like `holocron-memory.ts`/`tilldone.ts`) registering a `resources_discover` handler returning `skillPaths: [<repo>/skills, $HOLOCRON_MEMORY_DIR/skills]`. No `promptPaths` — pi's native `~/.pi/agent/prompts → repo commands/` symlink already covers prompts and works today; adding it via extension would double-register.

**Rationale**: pi reads context files raw and discovers skills from `~/.agents/skills` (proven: `bedrock-ui`, `find-skills`, `autodesk-forma-poweruser` all surface from there in live sessions) plus extension-provided paths; the repo `skills/` root is in neither, so the extension is the mechanism (spec design constraint 3). Dedup is by canonical path (verified in pi source per spec/memory 2026-08-28). Memory-repo skills (`$HOLOCRON_MEMORY_DIR/skills/`, currently `Agents/`) must be discoverable too (US2 AS4), so both roots are returned; the case-insensitive public/private collision (`Agents` public vs `agents` after rename) is handled at the *Claude* file level (US2 AS3) and is harmless in pi (dir-level, lenient, and post-rename the public slug is `agents` — pi sees two entries differing only in case only if both roots are loaded; the extension returns both roots and pi's own dedup handles identical canonical paths; the remaining `Agents` (private, memory root) vs `agents` (public, repo root) is exactly the sanctioned collision and pi treats name≠dir leniently — SC-006 requires zero *warnings*, so T016's verification specifically checks this pair and, if pi warns, the memory-repo private skill is renamed to `_AGENTS`-style personal naming per SKILLSYSTEM.md as the fix).

**Alternatives considered**: Symlink `~/.pi/agent/skills` fan-out (rejected — that is the duplication being eliminated; FR-007); relying on `~/.agents/skills` only (rejected — repo skills must be the source of truth and versioned here).

## R5 — Private agent home (spec US4 AS5 path correction)

**Decision**: Private agents move from `$HOLOCRON_MEMORY_DIR/agents/opencode/` to `$HOLOCRON_MEMORY_DIR/agents/` (harness-neutral, memory-repo commit). The installer links them alongside public agents into `~/.claude/agents/` via the existing `merge_link_agents` helper. Frontmatter verified at migration time to be Claude-compatible (the opencode copies were byte-synced with claude copies by the old dual-maintenance rule, so they already are).

**Rationale**: Spec US4 AS5 assumed `$HOLOCRON_MEMORY_DIR/agents/claude/` — **that path does not exist** (validation finding H4). The actual private agents (`LahzoChatTester.md`, `ProductManager.md`) live under an *OpenCode-scoped* path that this spec retires; leaving them there strands them. A harness-neutral `agents/` dir is the only layout consistent with "Claude is the canonical format, no per-harness variants" (FR-009's spirit extended to private agents).

**Alternatives considered**: Keep `agents/opencode/` path and just read from it (rejected — perpetuates the retired harness's naming in the private repo); move to `agents/claude/` as the spec assumed (rejected — reintroduces a per-harness dir name for a single-format world).

## R6 — External (non-Holocron) skills

**Decision**:
- **Claude**: hand-added symlinks in `~/.claude/skills/` (`autodesk-forma-poweruser`, `autodesk-forma-readonly` → Rivian repo, `bedrock-ui` → `~/.agents/skills`) are classified **external**: preserved, never deleted or rewritten, and reported in `--check` as an informational `EXTERNAL` class (not a drift failure).
- **pi**: reads `~/.agents/skills` natively; the duplicate fan-out entry `~/.pi/agent/skills/autodesk-forma-poweruser` disappears with the fan-out dir removal (US2/US7), leaving exactly one live copy per skill (SC-007/FR-016).

**Rationale**: Live evidence (validation pass): those three hand symlinks exist, are not created by any install step, and FR-016/US2 AS5 forbid the installer from deleting or shadowing them.

**Alternatives considered**: Re-home externals into `~/.agents/skills` only (rejected — user-owned layout; out of scope); delete them (rejected — FR-016 MUST).

## R7 — `install.ps1` (Windows)

**Decision**: Remove the OpenCode section (both the `HARNESSES["opencode"]` entry at line 17 and the `%APPDATA%\opencode` block at lines 90–95) and prepend a guard: print "install.ps1 is not updated for spec 001 — run install.sh on macOS/Linux" and exit 0 without making changes. Full parity is out of scope (spec Out of Scope).

**Rationale**: FR-018 requires the OpenCode removal from *both* installers regardless; leaving the ps1 silently broken violates the spec's edge-case requirement ("it either gets the same converge+check contract or prints a 'not yet updated' notice").

## R8 — `~/.config/opencode/opencode.json` (validation finding H3 — **user decision required**)

**Decision (CONFIRMED by Jack 2026-08-28)**: Treat `opencode.json` as a **Holocron-created pointer** and remove it (with the printed notice). Rationale: it is a symlink created by `install.sh:306` targeting `$HOLOCRON_MEMORY_DIR/opencode.json` — by the spec's own definition ("Holocron-created pointers … are removed") it qualifies; the spec's US6 AS2 example listing it as "OpenCode's own" was out of date vs. live state and has been corrected. **Executed early**: the symlink was removed from the live machine on 2026-08-28 (before the US6 phase); restore at any time with `ln -s $HOLOCRON_MEMORY_DIR/opencode.json ~/.config/opencode/opencode.json` if OpenCode itself needs its config back.

**Alternatives considered**: Leave it (spec-literal reading) — rejected as default because it keeps a Holocron-managed pointer in a retired harness's home, the exact disease the spec treats; restore-on-request — kept as the fallback per above.
