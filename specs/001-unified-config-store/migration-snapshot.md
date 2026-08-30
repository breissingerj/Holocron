# Migration Snapshot — Pre-Migration Live Pointer Inventory (T002)

Captured **2026-08-28** against baseline commit `5a706e5` (branch `001-unified-config-store`).
This is the rollback reference for US6 (OpenCode removal) and US7 (machine migration). Every pointer below was verified with `ls -la`/`readlink` on the live machine.

**Rollback**: `git -C ~/Projects/PersonalProjects/Holocron checkout 5a706e5 -- . && bash install.sh` (old skip-if-exists installer re-creates all Holocron pointers that still exist; dangling targets deleted by US6/US7 must be restored from the notes in §3/§6 first). Memory-repo changes roll back via its own git history (see §6).

---

## 1. `~/.claude/` — Claude Code home

### Holocron-created pointers (managed by install.sh)

| Path | Type | Target |
|------|------|--------|
| `~/.claude/CLAUDE.md` | symlink | `$HOLOCRON_REPO_ROOT/claude/CLAUDE.md` |
| `~/.claude/commands` | symlink | `$HOLOCRON_REPO_ROOT/commands` (4 files) |
| `~/.claude/instructions` | symlink | `$HOLOCRON_REPO_ROOT/claude/instructions` (per-harness copy incl. `algorithm.md`) |
| `~/.claude/scripts` | symlink | `$HOLOCRON_REPO_ROOT/claude/scripts` |
| `~/.claude/settings.json` | symlink | `$HOLOCRON_REPO_ROOT/claude/settings.json` — **churned** (see §8) |
| `~/.claude/agents/<Name>.md` (15) | symlinks | `$HOLOCRON_REPO_ROOT/claude/agents/<Name>.md` |
| `~/.claude/agents/LahzoChatTester.md` | symlink — **DANGLING** | `$HOLOCRON_MEMORY_DIR/agents/claude/LahzoChatTester.md` (deleted; §6) |
| `~/.claude/agents/ProductManager.md` | symlink — **DANGLING** | `$HOLOCRON_MEMORY_DIR/agents/claude/ProductManager.md` (deleted; §6) |
| `~/.claude/skills/<slug>` (20 symlinks) | symlinks | `$HOLOCRON_REPO_ROOT/skills/<name>/` — 13 CamelCase (`Agents` is NOT here; see below), 7 lowercase (`acli`, `langsmith-cli`, `linear-cli`, `mermaid`, `op-1password`, `playwright-cli`, `volume`) |

### External (user-added) entries — **preserve, never delete or rewrite** (FR-016, R6)

| Path | Type | Target |
|------|------|--------|
| `~/.claude/skills/autodesk-forma-poweruser` | symlink | `~/.agents/skills/autodesk-forma-poweruser` |
| `~/.claude/skills/autodesk-forma-readonly` | symlink | `$HOME/Projects/Rivian/autodesk-forma-skill/skills/autodesk-forma-readonly` |
| `~/.claude/skills/bedrock-ui` | symlink | `../../.agents/skills/bedrock-ui` (relative) |
| `~/.claude/skills/Agents` | **real dir** (private skill, not a symlink) | `SKILL.md` + 9+ context files (`AgentPersonalities.md`, `ArchitectContext.md`, …, `Data/`); byte-source is `$HOLOCRON_MEMORY_DIR/skills/Agents` (old installer copied it) |

### Harness-native (Claude Code's own state — never touched by Holocron)

`backups/`, `cache/`, `daemon/`, `debug/`, `downloads/`, `file-history/`, `gh-pr-status-cache.json`, `history.jsonl`, `ide/`, `jobs/`, `mcp-needs-auth-cache.json`, `paste-cache/`, `plans/`, `plugins/`, `policy-limits.json`, `projects/`, `remote-settings.json`, `session-env/`, `sessions/`, `settings.local.json` (**2054 b user-local file, R3: never touched**), `shell-snapshots/`, `skills/` (the dir itself is a real dir), `stats-cache.json`, `tasks/`, `telemetry/`, `daemon-auth-*`, `daemon.log`.

---

## 2. `~/.pi/agent/` — pi agent home

### Holocron-created pointers

| Path | Type | Target |
|------|------|--------|
| `~/.pi/agent/AGENTS.md` | symlink | `$HOLOCRON_REPO_ROOT/pi/AGENTS.md` |
| `~/.pi/agent/instructions` | symlink | `$HOLOCRON_REPO_ROOT/instructions` (shared dir — **already correct** for the unified store) |
| `~/.pi/agent/prompts` | symlink | `$HOLOCRON_REPO_ROOT/commands` |
| `~/.pi/agent/scripts` | symlink | `$HOLOCRON_REPO_ROOT/scripts` (3 files) |
| `~/.pi/agent/extensions/*` (12 entries) | real dir of per-file symlinks | `$HOLOCRON_REPO_ROOT/pi/extensions/*` — `chain-progress.ts`, `cross-agent.ts`, `damage-control.ts`, `google-drive/`, `graphiti-memory/`, `holocron-memory.ts`, `pi-devin-auth/`, `slash-synthesis.ts`, `subagent-progress.ts`, `themeMap.ts`, `tilldone.ts`, `tool-counter.ts` (this per-file-symlink pattern is the template for the new `skill-roots` extension, US2) |

### pi skills fan-out (removed in US2/T015, replaced by `skill-roots.ts` extension)

`~/.pi/agent/skills/` = **real dir** containing:
- 8 plain symlinks to repo skills: `acli`, `langsmith-cli`, `linear-cli`, `mermaid`, `op-1password`, `playwright-cli`, `volume` (→ `$HOLOCRON_REPO_ROOT/skills/<x>`)
- 1 external symlink: `autodesk-forma-poweruser` → `~/.agents/skills/autodesk-forma-poweruser` (R6: pi reads `~/.agents/skills` natively, so this duplicate entry disappears harmlessly)
- 13 **real dirs** (one per CamelCase skill, lowercase name), each a per-file symlink fan-out: e.g. `media/` contains `Art → repo skills/Media/Art`, `Remotion → …/Remotion`, `SKILL.md → repo pi/skills/media/SKILL.md` (pi wrapper SKILL.md with lowercase name + relinked sub-resources)

### pi-local (user/harness state — never touched)

`agents/` (real dir, 13 **pi-native** agent files: 8 `algorithm-*.md`, `gemini-researcher.md`, `openai-researcher.md`, `perplexity-researcher.md`, `research-orchestrator.md`, `research.chain.md` — out of scope for US4, which is Claude-format-only), `settings.json` (**real file, 156 b user-local: `rivai` provider + theme + model — R3: installer SKIPPED, never touched**), `auth.json`, `models.json`, `models-store.json`, `bin/`, `chains/`, `sessions/`.

---

## 3. `~/.config/opencode/` — OpenCode home (removed wholesale in US6/T029)

All entries are Holocron-created or OpenCode's empty residue:

| Path | Type | Target / contents |
|------|------|-------------------|
| `AGENTS.md` | symlink | `$HOLOCRON_REPO_ROOT/instructions/AGENTS.md` |
| `commands` | symlink | `$HOLOCRON_REPO_ROOT/commands` |
| `instructions` | symlink | `$HOLOCRON_REPO_ROOT/instructions` |
| `plugins` | symlink | `$HOLOCRON_REPO_ROOT/opencode/plugins` |
| `scripts` | symlink | `$HOLOCRON_REPO_ROOT/scripts` |
| `agents/` | real dir, 17 per-file symlinks | 15 → `$HOLOCRON_REPO_ROOT/opencode/agents/*.md`; 2 **dangling** → `$HOLOCRON_MEMORY_DIR/agents/opencode/{LahzoChatTester,ProductManager}.md` |
| `skills/` | real dir | 20 symlinks → `$HOLOCRON_REPO_ROOT/skills/*/` + `Agents` real dir (copy of private skill, same as §1) |
| `opencode.json` | symlink | **already removed 2026-08-28** (R8, Jack-approved); restore: `ln -s $HOLOCRON_MEMORY_DIR/opencode.json ~/.config/opencode/opencode.json` |

**No external/user entries** exist in `~/.config/opencode/` — safe to remove the Holocron pointers; the dir may be left empty or removed (T029 decision: remove Holocron pointers, keep dir if OpenCode's own state appears later).

---

## 4. `~/.agents/skills/` — shared external skills (pi-native discovery root)

Real dirs, user-owned, **never touched**: `autodesk-forma-poweruser/`, `bedrock-ui/`, `find-skills/`.

---

## 5. Holocron repo (`$HOLOCRON_REPO_ROOT`) state at baseline `5a706e5`

| Path | State |
|------|-------|
| `instructions/AGENTS.md` | exists (417-line-era shared content base) — becomes the canonical file (T005) |
| `instructions/algorithm.md` | 417 lines, 12 reflects (base for T004 merge) |
| `claude/CLAUDE.md` | full Claude-specific file + 2 dead `@`-imports (T001 finding) → split into `claude-tail.md` + generated `CLAUDE.md` (T009) |
| `claude/agents/` | 15 Claude-format agents (canonical per spec FR-009). Note: T007 text says "16 files" — live count is 15 (spec count error, count at execution time) |
| `claude/instructions/algorithm.md` | per-harness copy → deleted in US3 (T017) |
| `claude/scripts/`, `claude/settings.json` | harness-specific, kept (settings = template in precedence chain, R3) |
| `opencode/agents/` | 15 OpenCode-format agents → **deleted in US6** (T026) |
| `opencode/plugins/` | → deleted in US6 |
| `skills/` | 20 skills: 13 CamelCase public (`Agents`, `ContentAnalysis`, `Investigation`, `Media`, `MemoryIngest`, `RedisCloud`, `Research`, `Scraping`, `Security`, `Telos`, `Thinking`, `USMetrics`, `Utilities`) + 7 lowercase (`acli`, `langsmith-cli`, `linear-cli`, `mermaid`, `op-1password`, `playwright-cli`, `volume`). **T006 renames the 13 CamelCase to lowercase slugs** — incl. `Agents` → `agents`, which deliberately creates the case-only collision with the private memory-repo skill `$M/skills/Agents` that R4/US2 AS3 handle |
| `pi/AGENTS.md` | pi overlay target → replaced by `~/.pi/agent/APPEND_SYSTEM.md` approach (T010) |
| `pi/extensions/` | 12 extensions (pattern for `skill-roots.ts`, T013) |
| `pi/skills/` | 13 lowercase wrapper dirs (lowercase `SKILL.md` + per-file symlinks) → **deleted in US2** (T015) |
| `pi/settings.json` | template (linked only when no user file — currently SKIPPED, R3) |
| `commands/` (4), `scripts/` (3) | shared, keep |
| `install.sh` | old skip-if-exists installer (~330 lines) → rewritten converge+`--check` (T011+ serialized edits) |
| `install.ps1` | OpenCode section → "not yet updated" guard (R7, T027) |

---

## 6. Memory repo (`$HOLOCRON_MEMORY_DIR` = `~/Projects/PersonalProjects/holocron-context/`)

| Path | State |
|------|-------|
| `agents/` | **does not exist** — deleted by vault-backup commit `acaca00` (2026-08-07). Recoverable: `git show acaca00^:agents/claude/{LahzoChatTester,ProductManager}.md` and `…:agents/opencode/*.md` (all four files present at `acaca00^`). **T008 restores the `agents/claude/` copies into `$HOLOCRON_MEMORY_DIR/agents/`** (R5) with a memory-repo commit |
| `skills/Agents/` | real dir — private skill source (byte-identical to the `~/.claude/skills/Agents` copy) |
| `settings.json` | 41,236 b, 28 top-level keys, `model: claude-fable-5[1m]`, updated 2026-08-28 — the Claude settings **override** (T024 redirects `~/.claude/settings.json` link here per R3) |
| `settings.linux.json`, `settings/holocron.settings.json` | auxiliary settings files (linux variant / named copy) — keep as-is |
| `pi-settings.json` | 112 b: `{defaultProvider: anthropic, defaultModel: claude-sonnet-4-6, defaultThinkingLevel: medium}` — the pi settings override (currently not linked; live `~/.pi/agent/settings.json` is a 156 b user-local real file with `rivai` provider — R3: skip) |
| `opencode.json` | 413 b — OpenCode config source (pointer removed, R8; file itself stays in memory repo) |
| `memory/MEMORY.md` | 124 lines — the priming source for the generated Claude shim (T009) and pi's `holocron-memory` extension |
| `mcp.json`, `MEMORY_CONTRACT.md`, `WORK/`, `LEARNING/`, etc. | memory-repo internals — out of scope |

---

## 7. Environment

| Var | Value | Notes |
|-----|-------|-------|
| `HOLOCRON_MEMORY_BACKEND` | `files` | `~/.zshrc:13` — file-based memory (no Graphiti tools) |
| `HOLOCRON_MEMORY_DIR` | `/Users/jbreissinger/Projects/PersonalProjects/holocron-context/` | `~/.zshrc:14` (trailing slash!) |
| `HOLOCRON_REPO_ROOT` | `/Users/jbreissinger/Projects/PersonalProjects/Holocron` | `~/.zshrc:15` |
| `HOLOCRON_DIR` | **not exported** | spec assumed it; nothing in the final design depends on it (shim is generated, T009; installer computes paths from `$HOME` + repo root) |

---

## 8. Known anomalies at snapshot time

1. **`claude/settings.json` churn (semantic, not just key order)** — live link target shows `model: "opus[1m]"` vs committed `"sonnet"`, plus key reorder and `theme` moved. Claude Code rewrites the linked file in place (R2's churn scenario, confirmed real). The three-way model split (`sonnet` template / `opus[1m]` live churn / `claude-fable-5[1m]` memory-repo override) resolves by T024 redirecting the link to `$HOLOCRON_MEMORY_DIR/settings.json` — after which the user's model choice lives in the memory repo (committed, durable). **Converge engine note**: churn-reset of a *memory-repo-backed* link must print the reset loudly (US5) so semantic reverts are visible.
2. **4 dangling symlinks** (2 per private agent, claude + opencode sides) — restored by T008 (claude side) / removed by T029 (opencode side).
3. **`~/.claude.json` consent state** — `projects[*].hasClaudeMdExternalIncludesApproved = false` for all 9 known projects. No action needed post-migration (T009 shim uses no `@`-imports, T001/R1) — but any *future* re-introduction of external `@`-imports would hit this gate silently in `-p` mode.
4. **`~/.claude/skills/Agents` and `~/.config/opencode/skills/Agents` are copies, not links** — old installer copied the private skill. Post-migration: the claude-side private skill link is created by T008/T019 (`merge_link_agents`-style helper for skills) from the restored `$HOLOCRON_MEMORY_DIR/skills/Agents` (already present); the opencode copy disappears with T029.
5. **`~/.config/opencode/{agents,skills}` are real dirs** (not symlinks) — per-file fan-out, so T029 removes the dirs after removing their contents (order matters: contents first, else rmdir fails).
