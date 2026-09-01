# Data Model: Unified Config Store (spec 001)

This feature has no database; the "data model" is the **resource → pointer** mapping the installer converges and checks. Entities below define the vocabulary used by `install.sh` (apply + `--check`), `contracts/install-cli.md`, and the tasks.

## Entities

### 1. CanonicalResource (repo-side source of truth)

| Field | Type | Notes |
|---|---|---|
| `path` | repo-relative | e.g. `instructions/AGENTS.md` |
| `kind` | file \| dir | |
| `consumer` | shared \| claude \| pi | `shared` = both harnesses |
| `precedence_source` | none \| template \| override | settings files only (see §6) |

### 2. LivePointer (machine-side)

| Field | Type | Notes |
|---|---|---|
| `path` | absolute | e.g. `~/.claude/CLAUDE.md` |
| `harness` | claude \| pi \| opencode(migration only) | |
| `observed_kind` | symlink \| real-file \| dir \| absent | |
| `observed_target` | path \| null | null for real files |
| `managed` | bool | true = created/expected by install.sh |
| `expected_target` | path \| null | null = "must not exist" |
| `churn_check` | bool | true = apply mode may reset content (linked settings files) |

### 3. DriftClass (`--check` classification; see contracts/install-cli.md)

| Class | Definition | Exit impact |
|---|---|---|
| `STALE` | managed symlink, target ≠ expected_target | failure (exit 1) |
| `DANGLING` | managed symlink, target does not exist (repo moved) | failure |
| `MISSING` | expected pointer absent | failure |
| `CHURNED` | managed symlink whose *content* diverged from target (daemon rewrote through link) | failure; apply mode resets |
| `PRECEDENCE` | settings pointer links lower-precedence source while a higher Holocron-managed source exists (e.g. `~/.claude/settings.json` → repo template while memory-repo `settings.json` exists) | failure |
| `UNEXPECTED` | managed-location pointer not in the expected inventory (e.g. hand-added `~/.claude/skills/autodesk-forma-readonly`) | **informational only** (exit unaffected) — reported as `EXTERNAL` when it points outside the Holocron repos |
| `USER_LOCAL` | live path is a real file the installer never manages (`~/.pi/agent/settings.json`, `~/.claude/settings.local.json`) | informational (SKIPPED) |

### 4. Skill

| Field | Type | Notes |
|---|---|---|
| `name` | string | public: lowercase `[a-z0-9-]+`, **must equal** dir name + frontmatter `name` (FR-006); private: `_ALLCAPS` convention (memory repo); external: unchanged |
| `origin` | public \| private \| external | public = repo `skills/`; private = `$HOLOCRON_MEMORY_DIR/skills/`; external = `~/.agents/skills/` or hand-added |
| `claude_live` | dir-symlink \| file-merged-dir | whole-dir symlink, **except** the sanctioned collision merge (US2 AS3) |
| `pi_live` | extension path | via `skill-roots.ts`; never a fan-out |

**Merge rule (the only file-level merge in the system)**: case-insensitive name collision between public and private → private file wins / adds files into a single real directory. Known instance at migration time: public `Agents` → renamed `agents` collides with memory-repo `skills/Agents` (R4 notes the pi-side consequence and its verification gate).

### 5. Agent

| Field | Type | Notes |
|---|---|---|
| `name` | `<Name>.md` | 15 shared (repo `agents/`) — no private agents (T008 retired 2026-08-31: the two former private agents were already deleted from the memory repo before this spec was written; not restored, per Jack's decision) |
| `format` | Claude Code frontmatter | single format — no variants, no generator (FR-009) |
| `claude_live` | per-file symlink in `~/.claude/agents/` (real dir) | via `merge_link_agents` |
| `pi` | N/A | pi-native roster `pi/agents/` + `~/.pi/agent/chains/` is a different decomposition — untouched (FR-010) |

### 6. SettingsSource (precedence chain, FR-013)

```
harness-local user file (highest — never touched by installer)
  e.g. ~/.claude/settings.local.json, ~/.pi/agent/settings.json (real file)
personal override (Holocron-managed)
  ~/.claude/settings.json ← $HOLOCRON_MEMORY_DIR/settings.json
  ~/.pi/agent/settings.json ← $HOLOCRON_MEMORY_DIR/pi-settings.json
repo template (lowest Holocron-managed)
  → repo claude/settings.json        → repo pi/settings.json
```

Installer links the highest-precedence *Holocron-managed* source that exists; it only (re)links when the live path is a Holocron-managed symlink (R3).

## Pointer Inventory (target state)

| # | Canonical (repo) | Live pointer | Harness | Kind | Notes |
|---|---|---|---|---|---|
| 1 | `claude/CLAUDE.md` (shim) | `~/.claude/CLAUDE.md` | claude | symlink | shim imports canonical AGENTS.md (R1) |
| 2 | `instructions/AGENTS.md` | `~/.pi/agent/AGENTS.md` | pi | symlink | canonical file, directly |
| 3 | `pi/APPEND_SYSTEM.md` | `~/.pi/agent/APPEND_SYSTEM.md` | pi | symlink | pi-only overlay |
| 4 | `instructions/` (dir) | `~/.claude/instructions`, `~/.pi/agent/instructions` | claude, pi | symlink | `~/.claude/instructions` repointed from retired `claude/instructions/` |
| 5 | `commands/` (dir) | `~/.claude/commands`, `~/.pi/agent/prompts` | claude, pi | symlink | existing, unchanged |
| 6 | `scripts/` (dir) | `~/.pi/agent/scripts` (and `~/.claude/scripts` → `claude/scripts/` if kept) | pi, claude | symlink | verify at T032; `~/.config/opencode/scripts` removed |
| 7 | `skills/<slug>/` ×20 | `~/.claude/skills/<slug>` | claude | dir-symlink | + private merge (skill `agents`) |
| 8 | `skills/` + `$M/skills/` roots | (extension) | pi | `resources_discover` | `skill-roots.ts` |
| 9 | `agents/<Name>.md` ×15 | `~/.claude/agents/<Name>.md` | claude | file-symlink | real dir, per-file links |
| 10 | — (retired) | — | claude | n/a | private agents dropped — T008 retired 2026-08-31, no `$M/agents/` source exists |
| 11 | `claude/settings.json` | `~/.claude/settings.json` | claude | symlink + churn_check | precedence per §6 (currently STALE/PRECEDENCE — the live drift) |
| 12 | `pi/settings.json` | `~/.pi/agent/settings.json` | pi | symlink + churn_check | **only if** live is Holocron-managed; currently real user file → USER_LOCAL |
| 13 | — (removed) | `~/.config/opencode/{AGENTS.md,commands,instructions,scripts,plugins,agents/,skills/}` | opencode | absent expected | migration removes; `opencode.json` per R8 (user decision) |
| 14 | — (removed) | `~/.pi/agent/skills/` | pi | absent expected | replaced by extension |
| 15 | external (non-Holocron) | `~/.claude/skills/{autodesk-forma-poweruser,autodesk-forma-readonly,bedrock-ui}` | claude | external | preserved, reported (R6) |
| 16 | external (non-Holocron) | `~/.agents/skills/{autodesk-forma-poweruser,bedrock-ui,find-skills}` | pi (native) | external | FR-016: never touched |

## State Transitions

```
apply mode (install.sh):
  pointer absent            → create (print CREATED)
  symlink, wrong target     → relink (print REPAIRED)
  symlink, dangling         → relink (print REPAIRED)
  symlink, churned content  → reset from target (print RESET)      [churn_check=true only]
  precedence violation      → relink to higher source (print REPAIRED)
  real user file            → skip (print SKIPPED)
  external pointer          → leave (print EXTERNAL)
  fan-out dir to remove     → remove (print REMOVED)               [migration + idempotent]

check mode (install.sh --check):
  any of the above          → classify, print table, exit 1 on failure class, exit 0 if clean
  never writes anything
```
