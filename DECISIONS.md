# Decision Log

Key architectural and design decisions made while building Holocron. Captured so I can revisit the reasoning later and talk through the tradeoffs.

---

## 2026-08-28

### Claude shim mechanism: generated concatenation over `@`-import (spec 001, T001 finding)

- **Decision** — The Claude Code side of the unified config store does **not** use `@`-imports to pull in the canonical `instructions/AGENTS.md`. `claude/CLAUDE.md` becomes a **generated file** rebuilt by `install.sh` whenever inputs change: `instructions/AGENTS.md` + `claude/claude-tail.md` (new tracked file holding only Claude-specific content) + a primed copy of `$HOLOCRON_MEMORY_DIR/memory/MEMORY.md`. The generated file carries a "GENERATED — do not edit" header and is git-ignored; `~/.claude/CLAUDE.md` keeps its existing symlink to it; `--check` verifies freshness via input hashes and apply mode regenerates.
- **Options considered** — (1) `@`-import shim as originally specced (`@/abs/path/instructions/AGENTS.md` + `@$HOLOCRON_MEMORY_DIR/memory/MEMORY.md`) — refuted by T001 marker test (Claude Code v2.1.251): external (outside-project) imports are consent-gated per project via `hasClaudeMdExternalIncludesApproved` in `~/.claude.json`; every project on this machine is `false`, proving the live shim's external imports **never expanded**; env-var import paths don't expand at all; non-interactive `-p` runs silently skip unconsented imports with no way to pre-consent for *future* projects. (2) Relative import from user scope — still counts as external, same gate. (3) Symlink `~/.claude/CLAUDE.md` directly at the canonical file — no home for the Claude-only tail. (4) Pre-seed consent flags in `~/.claude.json` at install — only covers known projects and means writing into the harness's own state from Holocron.
- **Rationale** — Generated concatenation is consent-free, deterministic, portable across machines and repo moves, and a natural fit for the converge/`--check` engine because the installer already owns regeneration. It also *repairs* a live bug discovered during the test: today's Claude Code sessions load only the literal body of `claude/CLAUDE.md` — the steering-rules and MEMORY.md `@`-imports have silently never expanded, so Claude has been running without the shared steering rules and memory priming that pi receives via its extension.

---

## 2026-03-31

### Multi-domain agent selection — use Agent tool's injected subagent descriptions

- **Decision** — Updated `algorithm.md` OBSERVE capability selection to consult the Agent tool's available `subagent_type` values and their USE WHEN descriptions for multi-domain or Extended+ tasks. Both Claude Code and OpenCode inject agent descriptions into the model's context at session start via the Agent tool schema — no file globbing or env vars needed. Added `agents_invoked` field to the LEARN phase reflection JSONL to track which agents are actually used per session.
- **Options considered** — (1) Static agent table in algorithm.md — requires manual updates. (2) `$HOLOCRON_AGENTS_DIR` env var + glob — dynamic but redundant; the harness already loads agent descriptions into context. (3) Agent tool self-description — always current, harness-agnostic, zero configuration.
- **Rationale** — Option 2 was initially implemented before recognizing that both harnesses already inject agent descriptions through the Agent tool schema. Option 3 is strictly simpler: no env var, no file I/O, works identically in Claude Code and OpenCode.

---

## 2026-03-23

### Known issue: RelationshipMemory and IntegrityCheck may be no-ops on SessionEnd

- **Issue** — `RelationshipMemory.hook.ts` and `IntegrityCheck.hook.ts` both require a `transcript_path` in the hook input payload to do meaningful work. Both are now wired to `SessionEnd` in `config/claude/settings.json`. It is unconfirmed whether Claude Code's `SessionEnd` event provides `transcript_path` in its stdin payload (the payload shape for `SessionEnd` has not been empirically tested).
- **Current behavior** — Both hooks handle a missing or empty `transcript_path` gracefully: they log a warning and exit 0. So they are safe but potentially no-ops on `SessionEnd` if the transcript is not provided.
- **To resolve** — Run a test session, check hook stderr output for `[RelationshipMemory] No transcript path, exiting` or `[IntegrityCheck] No transcript path`. If confirmed no-op, two options: (1) accept the limitation and remove from `SessionEnd` wiring; (2) rewrite the hooks to read from an alternative source (e.g., the WORK/ PRD or STATE/ files) when `transcript_path` is absent.
- **Rationale for keeping them wired** — The hooks exit safely if transcript is missing. Wiring them now means they will work automatically if Claude Code adds `transcript_path` to the `SessionEnd` payload in a future version, or when a workaround is implemented.

---

### Refactored agents/ into opencode/ and claude/ subdirectories

- **Decision** — Split `agents/` into `agents/opencode/` (existing 15 agents, opencode schema) and `agents/claude/` (new 15 agents, Claude Code schema). Updated `install.sh` to symlink each harness to its own subdir: `~/.config/opencode/agents → agents/opencode/`, `~/.claude/agents → agents/claude/`. Added dual-maintenance rule to `VERIFY_AGENTS.md`.
- **Options considered** — (1) Single directory with harness-detection in frontmatter — not possible, schemas are structurally different. (2) Single directory with shared files and a separate override mechanism — complex, fragile. (3) Separate subdirs per harness — clean, explicit, each harness gets exactly what it expects.
- **Rationale** — OpenCode and Claude Code use incompatible agent frontmatter schemas (opencode uses `color`/`voiceId`/`voice`/`persona`/`permission`; Claude Code uses `model`/`tools`/`skills`). The body content (behavior, persona, output format) is identical and must stay in sync. Separate directories make the contract explicit: same body, different headers. The dual-maintenance rule in `VERIFY_AGENTS.md` ensures they don't drift.

---


- **Decision** — Created `claude/ValidateClaudeCLI.md` (human-readable checklist) and `claude/validate-claude-cli.sh` (runnable bash script) to verify all Claude Code harness wiring: CLAUDE.md symlink and imports, settings.json validity, skills/commands symlinks, hook scripts existence/executability/exit codes, HOLOCRON_MEMORY_DIR, absence of stale `~/.config/claude`, and MCP config.
- **Options considered** — (1) Manual spot-check — no audit trail, easy to miss things. (2) Inline checks in install.sh — couples validation to install, hard to re-run independently. (3) Standalone playbook + script — runs anytime, documents expected state, exits non-zero on failure for CI use.
- **Rationale** — After removing the `~/.config/claude` symlink and clarifying the Claude CLI wiring model, a repeatable validation was needed to catch regressions. The script runs in ~2s and currently passes 41/41 checks (1 info for optional agents dir).

---

### Updated CLAUDE_CLI_COMPATIBILITY.md — removed stale symlink references

- **Decision** — Rewrote the opening sections of `CLAUDE_CLI_COMPATIBILITY.md` to remove all references to `~/.config/Claude → ~/.config/opencode` as an active symlink, corrected the agents location claim (Claude CLI reads `~/.claude/agents/`, not `~/.config/Claude/agents/`), updated status from "Planning" to "Implemented", and converted the implementation priority table to a completion status table.
- **Options considered** — (1) Leave the doc stale — causes confusion on next read. (2) Annotate with correction comments — messy. (3) Rewrite the affected sections — clean and accurate.
- **Rationale** — The doc was written when the symlink was assumed to be the mechanism. Now that the actual mechanism is fully explicit symlinks in `~/.claude/` managed by `install.sh`, the doc should reflect that. The subagents gap is also now clearly documented as an unresolved item rather than falsely marked complete.

---

### Removed ~/.config/claude symlink

- **Decision** — Deleted the `~/.config/claude → ~/.config/opencode` symlink. Claude Code does not read `~/.config/claude/` automatically; it only reads from `~/.claude/`. The symlink served no functional purpose and created confusion about which directory Claude Code actually used.
- **Options considered** — (1) Keep the symlink for completeness — no benefit, adds confusion. (2) Remove it — correct state; `~/.claude/` already has all required symlinks (CLAUDE.md, settings.json, skills/, commands/) via `install.sh`.
- **Rationale** — Claude Code's documented config locations are `~/.claude/` (user-level) and project-level `.claude/`. `~/.config/claude/` is not in that list. The install script already handles `~/.claude/` explicitly. The symlink was an artifact of an earlier setup assumption that has since been superseded.

---

### Claude CLI config files versioned in Holocron repo, symlinked from ~/.claude/

- **Decision** — `config/claude/settings.json` and `config/claude/CLAUDE.md` live in the Holocron repo under `config/claude/` and are symlinked from `~/.claude/settings.json` and `~/.claude/CLAUDE.md`. Hook scripts live in `scripts/hooks/` (already in the repo) and are symlinked from `~/.config/opencode/scripts/hooks`.
- **Options considered** — (1) Write `settings.json` and `CLAUDE.md` directly to `~/.claude/` with no repo copy — easy but unversioned, lost on machine wipe. (2) Copy them to the repo and document that you must manually re-copy on change — fragile. (3) Store in repo, symlink from `~/.claude/` — single source of truth, version-controlled, zero-friction.
- **Rationale** — Symlinks make the repo the source of truth with zero maintenance overhead. Any edit in the repo is immediately live; any edit via a tool that follows the symlink is also versioned. Consistent with the existing pattern where `~/.config/Claude → ~/.config/opencode` already makes the entire opencode config dir available to Claude CLI.

---

## 2026-03-23

### Claude CLI dual-harness compatibility plan approach

- **Decision** — Created `claude/CLAUDE_CLI_COMPATIBILITY.md` as the compatibility plan. Shell hook scripts will live in `scripts/hooks/` (version-controlled in this repo, accessible via the existing symlink from both harnesses). Claude CLI config lives in `~/.claude/settings.json` and `~/.claude/CLAUDE.md` (outside the repo — user-scope config). No TypeScript plugins are modified or deleted.
- **Options considered** — (1) Put shell scripts in `~/.claude/hooks/` (outside the repo, not version-controlled). (2) Put shell scripts in a new `hooks/` directory in the Holocron repo. (3) Put them in `scripts/hooks/` alongside the existing `voice.sh`.
- **Rationale** — `scripts/hooks/` extends the existing scripts directory pattern (already contains `voice.sh`). Scripts in `scripts/` are accessible from both harnesses via the `~/.config/Claude → ~/.config/opencode` symlink — no duplication. The hook scripts reference `$HOLOCRON_MEMORY_DIR` directly, so they work regardless of which harness invokes them.

### Ralph Loop is an OpenCode-exclusive feature

- **Decision** — Documented the Ralph Loop as not fully portable to Claude CLI. The `stop-guard.sh` script is a weak PRD-state approximation, not a full port.
- **Options considered** — (1) Attempt a `Stop` hook + transcript-read approximation (read the last message from the transcript file). (2) Accept the limitation and document it clearly.
- **Rationale** — Claude CLI's `Stop` hook stdin contains no response text, and there is no mechanism to programmatically inject a follow-up user turn. Reading the transcript at Stop time could work in theory but introduces race conditions (transcript may not be flushed) and file-parsing complexity for marginal gain. The stop-guard covers the primary use case (preventing premature stopping during active PRD execution). The live-text scanning behavior that catches incomplete work in arbitrary responses is genuinely impossible in the Claude CLI hook model.

---

## 2026-03-19

### Add /compound command for solution card extraction

- **Decision** — Added `commands/compound.md` as a new slash command that extracts solved problems into searchable markdown cards written to `$HOLOCRON_MEMORY_DIR/RESEARCH/solutions/{category}/`.
- **Options considered** — (1) Add a Compound step inline to the Algorithm's LEARN phase — keeps it in one file but couples two separate concerns (reflection vs. solution documentation). (2) Add as a workflow inside the existing Algorithm or Research skill — possible but slash commands are more discoverable and invokable ad hoc. (3) Standalone command — most flexible, opt-in, matches the compound engineering article's philosophy that compounding is a separate explicit step after the work is done.
- **Rationale** — The article's insight is that most developers skip the compound step because it's not a named, explicit action. Making it a slash command gives it the same weight as `/reflect` — something you consciously run, not a passive side effect. Solution cards in `RESEARCH/solutions/` are optimized for future retrieval, unlike PRDs which are tracking artifacts.

### Add CONFIDENCE CHECK to VERIFY phase (Extended+ effort)

- **Decision** — Added a `🔍 CONFIDENCE CHECK` block to the VERIFY phase of `algorithm.md`, mandatory for Extended+ effort. It requires answering: hardest decision made, alternatives rejected, least confident part of the output.
- **Options considered** — (1) Add as a LEARN phase reflection question — already asked in generic form, but fires after delivery not before. (2) Add to every effort level — creates overhead on simple tasks where the answers are obvious. (3) Extended+ only in VERIFY — surfaces weak spots before the user sees the output, scoped to work complex enough to have real judgment calls.
- **Rationale** — The compound engineering article's three questions ("What was the hardest decision?", "What alternatives did you reject?", "What are you least confident about?") are specifically useful as a pre-delivery review, not a post-session retrospective. Placing them in VERIFY for Extended+ effort means they run when stakes are high enough to justify the overhead, and they surface issues while there's still time to fix them.

### Add work_type field to algorithm reflection JSONL

- **Decision** — Added `work_type` as a required field to the LEARN phase JSONL schema with four valid values: `feature`, `system_improvement`, `research`, `debugging`.
- **Options considered** — (1) Derive work type automatically from task description via inference — fragile and adds latency. (2) Add as an optional field — optional fields get skipped; a required field creates the data needed to track the 50/50 balance. (3) Required field with four enum values — explicit, low-friction to fill in, queryable.
- **Rationale** — The compound engineering "50/50 rule" (half time on features, half on system improvement) can't be tracked without tagging work sessions by type. The `work_type` field makes this data available in `algorithm-reflections.jsonl` for future analysis via `/reflect` or a dedicated balance report. Four values are enough to distinguish the relevant categories without over-engineering the taxonomy.

---

## Format

Each entry has:
- **Date** — when the decision was made
- **Decision** — what was decided
- **Options considered** — what else was on the table
- **Rationale** — why this one

---

## 2026-03-19

### Move Agents skill to Holocron config repo

- **Decision** — Moved the entire `Agents` skill directory from `holocron-context/skills/` (private memory repo) to `Holocron/skills/` (public config repo). Reverted the `${HOLOCRON_MEMORY_DIR}` paths in the agent definitions to standard `~/.config/opencode/skills/` paths.
- **Options considered** — (1) Leave `Agents` skill in the private repo and keep `${HOLOCRON_MEMORY_DIR}` paths in public agent definitions; (2) Move it to the public repo so the entire Agent System (definitions + context + composition tools) is cohesive.
- **Rationale** — The agent definitions (`Holocron/agents/*.md`) were made public, but their required context files and composition tools (`Agents` skill) were left private. This broke them for any clean install, as `install.sh` wouldn't symlink the private skill. By moving the `Agents` skill into the public repo, the entire system is cohesive and uses standard `~/.config/opencode/` paths. The only private information was in `ProductManagerContext.md` (which referenced the user's employer), but since `ProductManager.md` was already moved to the public repo, moving its context file matches the visibility level.

### Fix agent frontmatter fields to match opencode schema

- **Decision** — Converted all 15 agent files from Claude Code frontmatter schema to opencode schema: `model: sonnet` → `model: anthropic/claude-sonnet-4-5`; `permissions: allow: [...]` → `permission: {edit: allow, bash: allow, webfetch: allow}`; removed `isolation: worktree`. Kept `voiceId`, `voice`, `persona` as Holocron-custom fields (opencode ignores them, Holocron plugins/scripts read them).
- **Options considered** — (1) Remove permissions entirely and rely on global defaults; (2) Map each old tool entry individually to opencode tool names; (3) Flat allow-all via `permission: {edit: allow, bash: allow, webfetch: allow}`.
- **Rationale** — These are named work agents, not sandboxed reviewers — full tool access is correct. Opencode's `permission` field only gates `edit`, `bash`, and `webfetch`; all other tools (`glob`, `grep`, MCP, etc.) are always available. Flat allow-all is accurate and idiomatic. The `isolation: worktree` field is Claude Code-specific and has no equivalent in opencode.

### Move named agents from holocron-context to Holocron

- **Decision** — Moved all 15 agent files from `holocron-context/agents/` into `Holocron/agents/`. Replaced the slim `pm.md` stub with the full `ProductManager.md` (richer persona, permissions, voice, full workflow).
- **Options considered** — (1) Keep agents in private memory repo and add a second symlink; (2) Move to Holocron (public repo); (3) Keep status quo (agents invisible to harness).
- **Rationale** — The harness symlink resolves `~/.config/opencode/agents` → `Holocron/agents/`. Agent persona definitions (name, voice ID, model, permissions) are not secrets. Sensitive content (personal knowledge, context files like `EngineerContext.md`) stays in the private `holocron-context/skills/Agents/` directory. The split is: _who you are_ (public, Holocron) vs _what you know_ (private, holocron-context). The slim `pm.md` stub was superseded by `ProductManager.md` — no value in keeping both.

---

## 2026-03-18

### /reflect command as slash command prompt template (not script or plugin)

- **Decision** — implement reflect as `commands/reflect.md` — an OpenCode slash command prompt template
- **Options considered** — (1) standalone bash script called manually, (2) OpenCode plugin triggered on a scheduled or manual hook, (3) slash command prompt template
- **Rationale** — slash command gives the agent full tool access (bash, file editing, gh CLI) and explicit user-triggered execution. A plugin would need an explicit invocation mechanism anyway. A bare script can't synthesize signal meaning — the LLM reasoning capability is essential for thematic clustering and deciding what rises above noise.

### snapshot-before-apply ordering in /reflect

- **Decision** — copy all signal files to `LEARNING/PROCESSED/YYYY-MM-DD_HH-MM-SS/` BEFORE applying any repo changes
- **Options considered** — (1) apply changes first, then archive, (2) archive first then apply (chosen), (3) delete in-place as part of apply
- **Rationale** — crash-safety. If the agent fails mid-apply, signals are preserved in the snapshot and can be re-read. Clearing original files happens only after PRs are successfully created. PROCESSED/ snapshots are immutable and never deleted — they are the permanent audit trail.

### threshold for promoting signals to applied changes

- **Decision** — apply a signal pattern only if rating ≤ 5 OR the same pattern recurs in ≥ 3 separate sessions
- **Options considered** — (1) apply all signals regardless of confidence, (2) apply only explicit user corrections, (3) threshold-based (chosen)
- **Rationale** — implicit sentiment detection (correction keywords → rating 3) is noisy. A single implicit 3/10 on an isolated incident should not become a permanent behavioral rule. The threshold reduces noise while still catching real patterns. Human review via PR is the final gate.

### two separate PRs (one per repo) in /reflect

- **Decision** — create one PR in `holocron-context` for memory changes and one PR in `Holocron` for system/algorithm changes
- **Options considered** — (1) single combined PR in one repo, (2) separate PRs per repo (chosen)
- **Rationale** — the two repos have different reviewers, merge cadences, and risk profiles. Memory changes (preferences, opinions) are lower risk and can be merged quickly. System changes (algorithm.md, steering-rules.md) warrant more careful review. Keeping them separate allows independent merge decisions.

---

## 2026-03-16

### claude-code harness uses whole-dir symlink instead of granular per-dir symlinks

- **Decision** — `~/.config/Claude` is now a single symlink pointing directly to the Holocron repo root, replacing the previous real directory that contained individual symlinks for each subdir (skills, commands, agents, etc.).
- **Options considered** — Keep the real directory with granular per-dir symlinks (old approach); replace with a single top-level dir symlink (chosen).
- **Rationale** — The granular approach required keeping the list of symlinked dirs in sync with the repo structure. A single top-level symlink means any new dir added to the Holocron repo is automatically visible to Claude Code without any install.sh changes. Accepted tradeoff: any files Claude Code writes into `~/.config/Claude` will land in the Holocron repo, which is acceptable since that repo is already the source of truth for this config.

---

## 2026-03-15

### Simple Memory Plugin OpenCode Entry Point

- **Decision** — Created `plugins/simple-memory/index.ts` to re-export the `@knikolov/opencode-plugin-simple-memory` package rather than adding the plugin as a flat file or expecting OpenCode to discover it from `node_modules` alone.
- **Options considered** — Changing the symlink structure in `install.sh`, using an OpenCode configuration for explicit loading, or using an `index.js`.
- **Rationale** — OpenCode plugin discovery from directories requires an entry file (`index.ts` or `index.js`) at the directory root. Since we bundle the plugin in `node_modules` inside `plugins/simple-memory`, this shim file is the most idiomatic way to expose the external npm package to the OpenCode engine.

---

## 2026-03-14


### Port voice server vs use OpenCode notification plugin

**Decision:** Port the full PAI VoiceServer (Bun/ElevenLabs TTS) into Holocron rather than relying on the OpenCode Smart Voice Notify plugin.

**Options considered:**
- Use Smart Voice Notify plugin — already exists, zero-effort integration, but limited to OS notifications with no TTS and no per-voice persona control
- Port PAI voice server — more work, but carries over the full 3-tier voice resolution, emotional presets, pronunciation system, and 5-level volume control

**Rationale:** The voice system is a core part of the PAI experience, not a nice-to-have. Smart Voice Notify handles OS banners but not ElevenLabs TTS, so it can't replicate the persona voice behavior (engineer vs architect vs default voice per agent). Porting the full server also keeps the voice system harness-agnostic — it runs as a standalone Bun service at `localhost:8888` that any harness can curl.

---

### Config isolation: config.json instead of settings.json

**Decision:** Voice config lives in `VoiceServer/config.json` (or `$HOLOCRON_VOICE_CONFIG`) rather than inside a settings.json file.

**Options considered:**
- Read from `~/.opencode/settings.json` — mirrors PAI's `~/.config/opencode/opencode.json` pattern but ties config to a specific harness
- Read from `~/.holocron/config.json` — harness-agnostic but adds another dotfolder
- Read from `VoiceServer/config.json` local to the repo — self-contained, ships with sensible defaults via `config.json.example`, overridable via env var

**Rationale:** Keeping config local to the `VoiceServer/` directory means the voice system is self-contained. No harness needs to know about it. The `config.json.example` pattern makes setup obvious on a new machine without leaking personal voice IDs into the public repo.

---

## 2026-03-15

### Plugin file structure — flat file in plugins/

**Decision:** Plugin source lives as a flat `.ts` file directly in `plugins/` (e.g., `plugins/holocron-context-loader.ts`), not in a subdirectory.

**Options considered:**
- Subdirectory per plugin (`plugins/holocron-context-loader/holocron-context-loader.ts`) — better organization for multi-file plugins, but OpenCode discovers plugins by scanning files directly in the plugins directory (not recursively), so subdirectory files are invisible without extra install.sh symlink logic
- Subdirectory + install.sh entry point symlink — works but creates a symlink inside the repo (because `~/.config/opencode/plugins/` is already symlinked to `Holocron/plugins/`), producing a confusing loop
- Flat file per plugin at `plugins/holocron-context-loader.ts` — simple, picked up automatically by the existing directory symlink, no extra wiring needed

**Rationale:** The existing `plugins/` directory symlink already makes all flat files in `plugins/` visible to OpenCode at `~/.config/opencode/plugins/`. Adding subdirectories and install.sh entry-point logic adds complexity that backfires (creates symlinks inside the repo). Flat files are the right fit for OpenCode's discovery model. If a plugin grows large enough to need multiple files, extract shared logic to a separate helper and import it.

---

### M6 context injection mechanism — session.created + tui.prompt.append

**Decision:** Use `session.created` to trigger context loading and `tui.prompt.append` to inject it into the user's first prompt. Use `experimental.session.compacting` to re-inject context on compaction.

**Options considered:**
- OpenCode Rules (context files) — simpler, but static; can't read from `$HOLOCRON_MEMORY_DIR` dynamically at session start
- `session.created` + custom tool — inject a tool the agent calls; more explicit but requires the agent to voluntarily call it
- `session.created` + `tui.prompt.append` — fires before first user message; context appears in the conversation without requiring agent action
- OpenViking MCP server — correct long-term answer but alpha-stage (see MEMORY_CONTRACT.md)

**Rationale:** `tui.prompt.append` is the least-friction injection point — context prepends to the user's first message automatically, so the agent sees it without any special instruction. The compaction hook ensures context survives context window resets. This matches the PAI pattern where CLAUDE.md is injected at every session start.

---

## 2026-03-13


### Two-repo structure: public config + private memory

**Decision:** Split into two repos — `Holocron` (public, shareable config) and a private memory repo — connected via symlinks and an `OPENCODE_MEMORY_DIR` env var.

**Options considered:**
- Single repo with `.gitignore` guarding private files — simpler but one accidental push exposes everything
- Monorepo with git submodule for private memory — works but submodules are painful
- Two fully separate repos, symlinked at install time — clean separation, same pattern PAI uses

**Rationale:** Mirrors the PAI pattern (`pai-context` private + `Personal_AI_Infrastructure` public) which has proven itself. Clean separation by design means there's no mechanism by which private memory can leak into the public repo. Symlinks keep the runtime experience seamless.

---

### Harness-agnostic design

**Decision:** Build Holocron to work across any agent harness, not tied to OpenCode specifically.

**Options considered:**
- OpenCode-specific — simpler to build, but becomes throwaway work if the tool changes
- Claude Code-specific — already have PAI for this; no point duplicating
- Harness-agnostic — more upfront design work, but the core (skills, commands, instructions) is portable by nature

**Rationale:** The agent harness landscape is moving fast. The valuable part of this system is the accumulated skills, context, and behavioral rules — not the plugin glue. Design the core to be portable so it survives tool changes. Plugin adapters for specific harnesses are thin wrappers around that core.

---

### PAI as foundation, not fork

**Decision:** Use Personal AI Infrastructure as inspiration and reference, not as a codebase to fork.

**Options considered:**
- Fork PAI and adapt it — starts with everything but carries PAI's Claude Code assumptions
- Rebuild from scratch ignoring PAI — wastes research; PAI has solved hard problems worth learning from
- Use PAI as a reference architecture, build Holocron independently — clean slate with informed decisions

**Rationale:** PAI is tightly coupled to Claude Code (hooks, `settings.json`, `CLAUDE.md` generation). Forking it means inheriting that coupling. Building independently while referencing PAI's architecture means Holocron can be genuinely harness-agnostic from day one, while still standing on PAI's shoulders for the hard design questions.

## 2026-03-15

### Context Loader Validation Approach

- **Decision** — Validated `holocron-context-loader.ts` via an isolated Node.js simulation script checking the logic of `buildContextBlock` and `getMostRecentPRD` against a scaffolded temporary test memory directory.
- **Options considered** — Booting a headless OpenCode session with a full test plugin configuration.
- **Rationale** — The logic of the context formatting and discovery was mostly pure JS, testing it using a standalone `fs` and `process.env` mock script correctly verified the behavior without the complex and brittle setup of a sub-harness integration test run within the same harness context.
## 2026-03-15

### Enforcing Absolute Paths for Memory

- **Decision** — The instructions in `algorithm.md` and `AGENTS.md` will be updated to explicitly demand the resolution of `$HOLOCRON_MEMORY_DIR` into an absolute path prior to filesystem operations.
- **Options considered** — Leaving it up to the agent's interpretation of environment variables.
- **Rationale** — The system prompt explicitly instructs the agent to construct absolute paths using the project root (`$PWD`). Without explicit overriding instructions to utilize the memory directory environment variable, agents will inherently write PRDs and learning JSONLs into the local repository being worked on.


## 2026-03-15

### holocron-prd plugin architecture

- **Decision** — The `holocron-prd` plugin is scaffolded as a TypeScript project in `plugins/holocron-prd/` with its own `package.json` rather than a flat file in `plugins/`.
- **Options considered** — Flat file like `holocron-context-loader.ts`.
- **Rationale** — This plugin requires more complex file I/O and state management. Giving it a proper structure allows for easier testing, dependencies (if needed later), and separation of concerns compared to a single monolithic flat file.

## 2026-03-15

### Testing Strategy

- **Decision** — Defer full unit testing and CI setup into a dedicated roadmap milestone (Milestone 12).
- **Options considered** — Immediate implementation using `ts-node` or `jest` on a per-plugin basis (e.g. just for `holocron-prd`).
- **Rationale** — Holocron is an amalgamation of bash scripts, a standalone TS application (`VoiceServer`), flat TS plugins (`holocron-context-loader`), and fully built TS projects (`holocron-prd`). An ad-hoc testing solution for just one of these ignores the repository architecture. A formal test runner setup (e.g., Vitest inside an NPM workspace) should be established universally so the entire stack can be verified locally and within GitHub Actions before releasing v1.0.0.

---

## 2026-03-15

### M12 monorepo tooling: npm workspaces + Vitest over Lerna/Jest

- **Decision** — Use a root `package.json` with npm workspaces pointing at `plugins/holocron-prd` and `plugins/holocron-context-loader`, with Vitest as the global test runner.
- **Options considered** — (1) Lerna monorepo: more features but significant overhead for 2 packages. (2) Jest: works but requires `ts-jest` transform config and slower cold start vs Vitest. (3) Per-package independent test setups with no root coordination: no `npm test` from root, harder to add CI.
- **Rationale** — npm workspaces is zero-dependency (built into npm 7+) and handles hoisting correctly for 2 packages. Vitest is ESM-native, requires no transform config for TypeScript via `skipLibCheck`, and is significantly faster than Jest. The root `npm test` running Vitest with `--reporter=verbose` gives a single command for both local dev and CI.

### M12 holocron-context-loader promoted to proper package

- **Decision** — Moved `plugins/holocron-context-loader.ts` (flat file) into `plugins/holocron-context-loader/src/index.ts` with its own `package.json`, matching the structure of `holocron-prd`.
- **Options considered** — Keep it as a flat file and test via a root-level barrel import; test only via integration (boot a real OpenCode session).
- **Rationale** — The flat file has no exports — `buildContextBlock` and `getMostRecentPRD` were unexported local functions. Without extracting them, unit testing is impossible. Promoting to a proper package with explicit exports is the minimal change that makes the logic testable without touching the OpenCode plugin interface. The install.sh `plugins/` symlink still works — OpenCode sees the directory the same way.

### M12 switched from npm + Vitest to bun install + bun test

- **Decision** — Use `bun install` for dependency resolution and `bun test` as the test runner across all packages. Vitest removed entirely.
- **Options considered** — (1) Keep Vitest + npm: ran into `@rollup/rollup-darwin-arm64` optional dep hoisting bug that npm workspaces doesn't resolve reliably on Apple Silicon. (2) Keep Vitest, switch to bun install only: would fix the install bug but Vitest still pulls rollup as a dependency. (3) Full bun switch: eliminates rollup entirely, `bun test` uses the same Jest-compatible `describe`/`it`/`expect` API so test code required only a one-line import swap (`from "vitest"` → `from "bun:test"`).
- **Rationale** — VoiceServer already runs on Bun — it's not a new tool. Bun's resolver handles platform-native optional deps correctly. `bun test` is faster (53ms for 24 tests vs ~1s+ cold start for Vitest), zero config, and the API is compatible. The CI switch to `oven-sh/setup-bun` is one-line. No downsides identified for a repo of this size.

---

## 2026-03-15

### M7.5 — OpenCode Todo write API is not available to plugins

- **Observation** — The OpenCode SDK (`@opencode-ai/plugin` v1.2.15, `@opencode-ai/sdk`) exposes `client.session.todo()` as a GET-only endpoint. There is no `todo.create`, `todo.update`, or `todo.upsert` method in either the v1 or v2 SDK. Todos are written exclusively by the AI's built-in `todowrite` tool. A plugin can observe changes via `event.type === "todo.updated"` but cannot initiate writes. Confirmed by exhaustive search of all `.d.ts` files in both SDK packages — no write path exists.
- **Implication** — M7.5 (PRD criteria → OpenCode Todo sync) cannot be implemented as a true bidirectional plugin. The only available approach is prompt injection: `experimental.chat.system.transform` injects a directive asking the AI to call `todowrite` with current PRD criteria — but this is prompt-based and not guaranteed.

### M7.5 — OpenCode TUI has no plugin extension API

- **Observation** — The full `Hooks` interface in `@opencode-ai/plugin` contains no panel, widget, sidebar, or layout extension point. TUI-related SDK types are limited to: `tui.prompt.append`, `tui.command.execute`, `tui.toast.show`, `tui.session.select` (v2 only). The `LayoutConfig` type exists but is deprecated and only covers `"auto" | "stretch"` for the existing layout — not custom panels. A plugin cannot render any custom UI element inside the OpenCode TUI.
- **Implication** — A live PRD criteria panel inside the OpenCode TUI is not buildable with the current plugin API surface.

### M13 — memory feed via generic `event` hook, not `file.edited` string key

- **Decision** — `holocron-memory-feed.ts` subscribes via the generic `event` hook (filtering `event.type === "file.edited"`) rather than a `"file.edited"` string key in the `Hooks` interface.
- **Options considered** — Using `"file.edited"` as a direct hook key (matches the docs example syntax); using the generic `event` hook.
- **Rationale** — The typed `Hooks` interface in `@opencode-ai/plugin` does not include `"file.edited"` as a named key. Only the generic `event` hook is in the type definition. Using the untyped string key compiles but produces a TS type error and could silently break across SDK upgrades. The `event` hook receives all event types; filtering by `event.type === "file.edited"` is type-safe against the `EventFileEdited` union member in `@opencode-ai/sdk`.

### M13 — `file.edited` event shape: `properties.file`, not `properties.filePath`

- **Decision** — The plugin reads the path from `event.properties.file` (not `filePath`).
- **Options considered** — `properties.filePath` (used in the docs example); `properties.file` (the actual SDK type).
- **Rationale** — `EventFileEdited` in `types.gen.d.ts` is `{ type: "file.edited"; properties: { file: string } }`. The docs example uses `filePath` which is incorrect or outdated. Verified against the generated types.

### Decision — Defer TUI extension and alternative frontend investigation to a future milestone

- **Decision** — Do not pursue a custom TUI panel or alternative frontend application for PRD tracking at this time. Defer to a future milestone once the OpenCode plugin surface matures or a standalone tool is warranted.
- **Options considered** — (1) External watcher script (`scripts/prd-watch.sh`) rendering a live criteria dashboard in a second terminal pane — viable but adds operational friction (must open a second pane manually). (2) Standalone web UI reading `WORK/` directly — decoupled but significant scope for marginal gain. (3) Wait for OpenCode to add a `tui.panel` hook — most elegant, zero Holocron code required.
- **Rationale** — The existing `STATE/work.json` sync (M7) and the agent's native TodoWrite tool already provide adequate work visibility within the current workflow. Building a parallel UI before the pain is felt concretely would be premature. Revisit when: (a) OpenCode adds a panel extension API, (b) the number of simultaneous PRDs makes terminal-only tracking genuinely painful, or (c) Holocron is used by more than one person.

---

## 2026-03-15

### Add Claude Code as a supported harness

- **Decision** — Added `claude-code` to the `HARNESSES` map in `install.sh` targeting `~/.config/Claude`, and added a `link_file` block to symlink `instructions/AGENTS.md` to `~/.config/Claude/AGENTS.md`.
- **Options considered** — (1) Keep Claude Code unsupported and maintain a separate manual copy of AGENTS.md. (2) Create a separate `install-claude-code.sh` script. (3) Add it directly to the existing `HARNESSES` map alongside opencode.
- **Rationale** — Claude Code reads its global instruction file from `~/.config/Claude/AGENTS.md` and injects it into every session via the system prompt. Without this symlink, Holocron's behavioral rules (execution modes, algorithm reference, memory location rules) are not loaded when using Claude Code. Adding it to the existing harness map keeps install.sh as the single source of truth for all harness targets — consistent with the harness-agnostic design principle.

---

## 2026-03-16

### Remove stale "Claude Code" references from skills

- **Decision** — Corrected all skill files that incorrectly attributed OpenCode-native tools and behaviors to Claude Code. Updated 9 files across BrightData, Recon, AudioEditor, Browser, Delegation, and Evals skills. Renamed `parseClaudeCodeTranscript` → `parseOpenCodeTranscript` in TranscriptCapture.ts. Did NOT change references in DECISIONS.md, README.md, MEMORY_CONTRACT.md, or install.sh, which legitimately discuss Claude Code as one of multiple supported harnesses.
- **Options considered** — (1) Change every occurrence of "Claude Code" including the legitimate multi-harness mentions. (2) Change only the incorrect skill-level references that imply OpenCode tools/behaviors belong to Claude Code.
- **Rationale** — The stale references mislead the agent about which harness it is running on, potentially causing incorrect tool invocations (e.g., `claude --chrome` does not exist in OpenCode). References describing Claude Code as a supported harness alongside OpenCode are accurate and intentional — those were preserved.

### Replace stale `~/.claude` paths with correct OpenCode/Holocron equivalents

- **Decision** — Replaced all `~/.claude/*` path references across 41 files with their correct equivalents based on the following mapping: `~/.claude/History/research/` → `$HOLOCRON_MEMORY_DIR/RESEARCH/`, `~/.claude/History/learnings/` → `$HOLOCRON_MEMORY_DIR/LEARNING/CAPTURES/`, `~/.claude/History/Backups/` → `$HOLOCRON_MEMORY_DIR/BACKUPS/`, `~/.claude/agents/` → `~/.config/opencode/agents/`, `~/.claude/MCPs/` → `$HOLOCRON_DIR/tools/MCPs/`, `~/.claude/Plugins/` → `~/.config/opencode/plugins/`, `~/.claude/filesystem-mcps/` → `$HOLOCRON_DIR/tools/filesystem-mcps/`, `~/.claude/Bin/` → `$HOLOCRON_DIR/tools/bin/`, `~/.claude/Templates/` → `$HOLOCRON_DIR/tools/templates/`, `~/.claude/Skills/` → `$HOLOCRON_DIR/skills/`, `~/.claude/commands/` → `~/.config/opencode/commands/`, `~/.claude/settings.json` → `~/.config/opencode/opencode.json`, `~/.claude/CLAUDE.md` → `~/.config/opencode/AGENTS.md`. Also updated `osint-api-tools.py` to prefer `$HOLOCRON_DIR` env var over legacy `$PAI_DIR` fallback.
- **Options considered** — (1) Leave paths as `~/.claude` and document that users must symlink. (2) Replace with `$HOLOCRON_DIR` / `$HOLOCRON_MEMORY_DIR` / `~/.config/opencode` per path type.
- **Rationale** — Skills are instructions given to the agent at runtime. A path like `~/.claude/agents/` points to a directory that does not exist on an OpenCode setup — the agent would fail to find or create the referenced files. Using `$HOLOCRON_DIR`, `$HOLOCRON_MEMORY_DIR`, and `~/.config/opencode` gives the agent the correct locations per Holocron's actual directory contract (see `MEMORY_CONTRACT.md`). The `filesystem-mcps/` and `tools/bin/` paths are not yet ported to Holocron; using `$HOLOCRON_DIR/tools/` as the target establishes where they should live when ported.

### Roadmap Milestone 14 — OMO Context Injection Cherry-Picks

- **Decision** — Added Milestone 14 to the roadmap targeting three specific features from Oh My OpenCode: the Ralph Loop (session continuation enforcer), Hierarchical `AGENTS.md` context injection, and Conditional Glob rules.
- **Options considered** — (1) Switch to OMO entirely. (2) Build an elaborate multi-model orchestration system in Holocron to match OMO. (3) Identify the highest-leverage single-agent UX improvements and port them via standard OpenCode plugins.
- **Rationale** — OMO's core value proposition (multi-model orchestration) requires a fundamentally different harness architecture and multiple provider API keys. However, its context injection and continuation features provide massive UX improvements without requiring multi-model routing. OpenCode's native Plugin API (`session.idle`, `tool.execute.before`, and `noReply` prompting) fully supports building these three features as standalone TS plugins that drop cleanly into Holocron's existing architecture.

### M14 Ralph Loop — hook choice and settings file location

- **Decision** — Use `experimental.text.complete` hook (not `session.idle`, which does not exist in the SDK Hooks interface). Settings live at `$HOLOCRON_MEMORY_DIR/settings/holocron.settings.json`, not in the Holocron repo itself.
- **Options considered** — (1) `session.idle` hook — does not exist in `@opencode-ai/plugin` Hooks interface as of v1.2.26. (2) `chat.message` hook — fires on user messages, not assistant completions; wrong direction. (3) `experimental.text.complete` — fires after each assistant response part completes; correct hook for post-response scanning. Settings location options: (a) `$HOLOCRON_DIR/holocron.settings.json` — version-controlled in the repo, not personal; (b) `$HOLOCRON_MEMORY_DIR/settings/holocron.settings.json` — personal, backed up in the private memory repo per user request.
- **Rationale** — `experimental.text.complete` is the only hook that fires after the assistant finishes a response and provides the completed text for scanning. Placing settings in `$HOLOCRON_MEMORY_DIR/settings/` keeps personal configuration out of the repo (appropriate for a multi-user config system) and co-locates it with other personal memory data where it will be included in backups.

### M14 Ralph Loop — infinite loop guard design

- **Decision** — Use a sentinel string `HOLOCRON_RALPH_LOOP` embedded in the continuation prompt. If the completed text contains the sentinel, skip re-triggering.
- **Options considered** — (1) Module-level boolean flag `lastWasRalphLoop` — unreliable across async turns; race conditions possible. (2) Per-session message ID tracking — requires stateful map, complex cleanup. (3) Sentinel in the injected prompt text — the continuation prompt itself contains the sentinel, so the next `text.complete` scan will detect it and skip. Zero shared state required.
- **Rationale** — The sentinel approach is stateless, deterministic, and self-documenting. The continuation prompt being scanned for incomplete work will always contain `HOLOCRON_RALPH_LOOP`, so the guard is guaranteed to fire correctly without any timing or state management concerns.

---

## 2026-03-16

### M14.2 Hierarchical AGENTS.md — hook strategy: `tool.execute.after` over `tool.execute.before`

- **Decision** — Use `tool.execute.after` (appending to `output.output`) instead of `tool.execute.before` with `noReply: true` injection.
- **Options considered** — (1) `tool.execute.before` with `noReply: true` — the ROADMAP described this, but `noReply` does not exist in the OpenCode Plugin SDK `Hooks` interface as of v1.2.26; `tool.execute.before` only exposes mutable `output.args`. (2) `experimental.chat.system.transform` — adds content to the system prompt on every request, not scoped to when specific files are read; would inject all discovered AGENTS.md globally rather than on-demand. (3) `tool.execute.after` with `output.output` mutation — the tool result string that the model sees; appending AGENTS.md content here gives the model the rules as part of the read result, exactly when it reads from that directory.
- **Rationale** — `tool.execute.after` output mutation is the correct semantic equivalent of `noReply: true` context injection: the content appears in the model's context as a tool result, not as a user message, with zero TUI visibility. It is on-demand (fires only when files are read) and file-scoped (only for the specific directory tree being accessed). The SDK surface confirms `output.output` is a mutable string in the `tool.execute.after` signature.

### M14.2 Hierarchical AGENTS.md — deduplication scope: session-level Set

- **Decision** — Use a module-level `Set<string>` keyed by absolute AGENTS.md path. Each unique path is injected at most once per session lifetime.
- **Options considered** — (1) Per-call dedup (no memory) — re-injects on every file read from the same directory; high token cost for busy sessions. (2) TTL-based cache — adds complexity without clear benefit; AGENTS.md content rarely changes mid-session. (3) Session-level Set — simple, zero overhead, correct: AGENTS.md for a directory is injected the first time the agent touches that directory, then never again.
- **Rationale** — Session-level dedup matches the expected UX: the agent learns the rules for a directory once, keeps them in context, and is not spammed with re-injections. The Set is cleared implicitly by process restart (new session = fresh process for plugins loaded by OpenCode).

---

## 2026-03-16 (M14.3)

### M14.3 Conditional Glob Rules — hook strategy: `tool.execute.after` over `tool.execute.before` + `noReply`

- **Decision** — Use `tool.execute.after` (appending to `output.output`) instead of `tool.execute.before` with `noReply: true`.
- **Options considered** — (1) `tool.execute.before` + `noReply: true` — the ROADMAP described this approach, but `noReply` does not exist in the OpenCode Plugin SDK `Hooks` interface as of v1.2.26; `tool.execute.before` only exposes mutable `output.args`, not an injection channel. (2) `experimental.chat.system.transform` — injects into the system prompt on every LLM request, not scoped to when specific file types are read; would always inject all matched rules rather than on-demand. (3) `tool.execute.after` with `output.output` mutation — appends to the tool result string the model sees; gives the agent the rules as part of the file read result, exactly when a matching file type is accessed.
- **Rationale** — Same as M14.2: `tool.execute.after` output mutation is the correct semantic equivalent of `noReply: true`. The content enters model context as a tool result without TUI visibility, is on-demand, and is file-scoped.

### M14.3 Conditional Glob Rules — glob matching: Node built-in `path.matchesGlob` over external library

- **Decision** — Use `path.matchesGlob(path, pattern)` from Node's built-in `path` module. Zero external dependencies.
- **Options considered** — (1) `minimatch` / `micromatch` / `picomatch` npm packages — battle-tested, widely used, but require an extra dep; none were pre-installed in the workspace. (2) `path.matchesGlob` — added in Node 22, available in Node 23.7.0 in use; supports `**` patterns correctly; marked experimental but stable enough for a local agent harness plugin. (3) Manual regex — fragile, error-prone for `**` semantics.
- **Rationale** — Zero external dependencies keeps the plugin lean and install-script-free. The experimental warning is acceptable given the controlled environment (personal harness, not a published npm package).

### M14.3 Conditional Glob Rules — rule discovery: init-time scan over per-read scan

- **Decision** — Discover and parse all rule files once at plugin init (`loadRules` called in plugin factory). Rules are held in memory for the session lifetime.
- **Options considered** — (1) Per-read scan — re-reads `rules/` on every file read; correct if rules change mid-session but high I/O cost. (2) Init-time scan — reads once; changes to rule files require harness restart to take effect, which is acceptable for a configuration artifact.
- **Rationale** — Rule files are configuration, not data. They change infrequently and deliberately. Init-time scanning trades mid-session mutability (not needed) for zero per-read overhead (always desirable).

---

## 2026-03-16 (Voice)

### Voice notifications — macOS `say` replacing ElevenLabs VoiceServer

- **Decision** — Replace the ElevenLabs VoiceServer (localhost:8888) with a direct `say` invocation in `scripts/voice.sh`. No server process, no API key, no quota.
- **Options considered** — (1) ElevenLabs VoiceServer — high quality but quota-limited (exhausted at 3 credits), cloud-dependent, requires a running server process. (2) mlx-audio / Kokoro-82M — near-ElevenLabs quality, fully local, but Python 3.13 + spacy dependency conflicts prevented clean installation. (3) macOS `say` — built-in, zero setup, zero cost, instant latency, works offline; voice quality is lower (~6/10 with Samantha) but sufficient for notification-style announcements.
- **Rationale** — The VoiceServer added operational complexity (LaunchAgent, port 8888, API key management) for a notification use case that doesn't require high fidelity. `say` is always available, cannot fail due to quota or network, and the script becomes a single self-contained bash file. Voice can be overridden per-machine via `$HOLOCRON_SAY_VOICE`.

### Voice notifications — kokoro-fastapi replacing macOS `say`

- **Decision** — Replace macOS `say` with [kokoro-fastapi](https://github.com/remsky/kokoro-fastapi) running in Docker at `localhost:8880`. Default voice: `bm_daniel`. `say` retained as automatic fallback when Docker is not running.
- **Options considered** — (1) Keep `say` — zero setup but voice quality (~6/10) was unsatisfactory. (2) Google Cloud TTS — 1M chars/month free, good quality, but adds cloud dependency and API key management. (3) kokoro-fastapi (Docker) — fully local, no API key, OpenAI-compatible REST endpoint, near-ElevenLabs quality (~8.5/10), single `docker run` to start. Sidesteps the Python 3.13/spacy dependency issue that blocked the direct pip install approach.
- **Rationale** — Docker isolates all dependency complexity. One command starts a persistent local server with no API key, no quota, and no cloud round-trip. The OpenAI-compatible endpoint (`POST /v1/audio/speech`) is a clean, standard interface. The `say` fallback ensures voice.sh never hard-fails when the container is not running.

## 2026-03-17

### Remove Claude Code harness support

- **Decision** — Removed the `claude-code` harness configuration from `install.sh`.
- **Options considered** — Keep it, or remove it entirely.
- **Rationale** — The user explicitly requested removing the handling for the Claude Code harness entirely.

### Remove PAI/ directory; migrate to Holocron/ namespace

- **Decision** — Deleted the `PAI/` directory from `holocron-context` entirely. Moved all content into `Holocron/` (docs, Algorithm versions, SKILL.md, ACTIONS/, PIPELINES/, FLOWS/) and `Holocron/Tools/` (Inference.ts, TranscriptParser.ts, VolumeLevel.ts, IntegrityMaintenance.ts). Moved `Inference.ts` into `Holocron/tools/` in this repo so Evals graders import from `../../../../../tools/Inference` — self-contained within the Holocron repo. Updated all hook imports, path constants, agent files, memory files, and `setup.sh`.
- **Options considered** — (1) Rename `PAI/` to `system/` — less churn but still a legacy name. (2) Delete without moving — would break all hook imports. (3) Migrate to `Holocron/` — clean, aligns with the project's own identity.
- **Rationale** — `PAI/` was an upstream artifact from Daniel Miessler's Personal AI Infrastructure repo. Holocron is its own project; naming everything after PAI added confusion about what's upstream vs. local. All active functionality is now under the `Holocron/` namespace with no cross-repo import dependencies.

## 2026-03-17

### Add proactive Fabric pattern check to Algorithm CAPABILITY SELECTION


- **Decision** — Added a step 3 to the CAPABILITY SELECTION methodology in `algorithm.md` instructing the AI to scan `~/.config/opencode/skills/Utilities/Fabric/Patterns/` for a matching pattern before selecting capabilities. Also added a guidance bullet: "Check Fabric patterns first — before writing any extraction, summarization, analysis, or review logic inline."
- **Options considered** — (1) Leave Fabric as purely reactive (user must ask explicitly). (2) Add a proactive check in CAPABILITY SELECTION. (3) Create a dedicated pre-task Fabric scan phase.
- **Rationale** — Fabric's 240+ patterns are battle-tested, structured, and faster than ad-hoc execution. The PR review session demonstrated the gap: the `review_code` pattern existed but was never surfaced until the user specifically invoked it. Adding the check to CAPABILITY SELECTION ensures patterns are considered on every task without requiring a separate phase or user prompt.

---

## 2026-03-18

### PM subagent — markdown file location: Holocron/agents/ (symlinked) over opencode.json inline

- **Decision** — Created the PM subagent as `Holocron/agents/pm.md`, which resolves via the existing broken symlink `~/.config/opencode/agents/ → Holocron/agents/`. Created the `Holocron/agents/` directory to fix the symlink.
- **Options considered** — (1) Inline agent definition in `~/.config/opencode/opencode.json` — works but buries the prompt in JSON, harder to read/edit, not version-controlled in Holocron. (2) Markdown file in `~/.config/opencode/agents/` directly — the directory is a symlink to `Holocron/agents/`, so writing there IS writing to the Holocron repo; markdown format is the idiomatic OpenCode approach.
- **Rationale** — Markdown agent files are the recommended OpenCode format (named file = named agent), self-documenting, diff-friendly, and version-controlled in Holocron automatically. The symlink already establishes `Holocron/agents/` as the canonical location — creating the directory and writing the file there is the zero-friction path.

---

## 2026-03-20

### /reflect command — strict PRD cleanup by algorithm-reflections mapping

- **Decision** — Added cleanup logic to Phase 6 of `commands/reflect.md` that deletes old PRD directories in `$HOLOCRON_MEMORY_DIR/WORK/`, but strictly filters them by extracting the `prd_id` values from all processed `algorithm-reflections.jsonl` files (current and archived).
- **Options considered** — (1) Blindly delete all `WORK/` directories older than a certain time or older than the `/reflect` run. (2) Strictly map "processed for learnings" to PRDs that generated an `algorithm-reflections.jsonl` entry.
- **Rationale** — Blind deletion would wipe out PRDs from failed sessions, aborted runs, or NATIVE mode tasks that never triggered the learning hook. By grepping the `prd_id` directly from the processed learning JSONL files, the cleanup exactly targets PRDs that successfully passed the "Learn" phase and had their insights synthesized. This safely garbage-collects the successful session folders cluttering `WORK/` while preserving artifacts from aborted sessions that might still be needed for debugging or resumption.
## 2026-03-20

### Reflect command push behavior

- **Decision** — Reflect workflow updates holocron-context repo directly on `main`
- **Options considered** — Open PRs for both memory repo and system repo, or commit to main for memory and open PR for system
- **Rationale** — Personal memory contexts are less strict and do not need a PR review process before taking effect. The System repo still goes through a PR for human review.

## 2026-03-20

### Deduplication of framework documentation files

- **Decision** — Deleted duplicate framework documentation files (`.md`) from `holocron-context/Holocron/` and updated all internal path references in `Holocron/docs/` to point to `$HOLOCRON_DIR/docs/` or `tools/` instead of `PAI/`. Overwrote `holocron-context/Holocron/README.md` to establish strict separation of concerns.
- **Options considered** — (1) Keep documentation in both repositories. (2) Define `holocron-context` as the sole source of truth. (3) Enforce `Holocron` as the stateless framework codebase and `holocron-context` as the stateful memory repo.
- **Rationale** — Mixing framework code into the context repository creates a split-brain architecture. By removing duplicate static documentation and tools from the context repo, we ensure there is only one source of truth for the system's framework, preventing divergence and broken paths for ALGORITHM tools.

---

## 2026-08-07

### Document Obsidian vault setup as full installation step

- **Decision** — Document opening the private memory repository as an Obsidian vault and installing the Obsidian Git plugin as part of a full personal Holocron installation.
- **Options considered** — (1) Automate Obsidian and plugin setup in `install.sh`. (2) Omit the workflow from Holocron documentation. (3) Document the user-managed setup in the README.
- **Rationale** — The vault-local plugin, Git remote, and Git credentials belong to the user environment and cannot be safely or portably automated by Holocron. The README makes the intended durable-memory workflow discoverable without expanding installer scope.

---

## 2026-08-07

### Register MCPVault during macOS/Linux installation

- **Decision** — Add an idempotent MCPVault stage to `install.sh` that registers an `obsidian` Claude MCP server against `$HOLOCRON_MEMORY_DIR` only when no server by that name already exists.
- **Options considered** — (1) Require manual Claude MCP configuration. (2) Overwrite `obsidian` on every install. (3) Register it when absent and preserve existing configuration.
- **Rationale** — MCPVault makes the private Obsidian-backed memory repository directly searchable by Claude agents. Registration improves fresh-install usability, while detecting an existing named server protects user-custom configuration from installer side effects.

---

## 2026-08-07

### Establish MCP-first memory retrieval order

- **Decision** — Instruct agents to retrieve memory through Graphiti when available, then Obsidian MCP search, then known direct routes, with targeted filesystem search as the final fallback.
- **Options considered** — (1) Continue direct tree traversal after Graphiti failure. (2) Make Obsidian MCP the only retrieval mechanism. (3) Use ordered semantic, lexical, deterministic, and filesystem retrieval layers.
- **Rationale** — Graphiti provides the strongest semantic and temporal retrieval when reachable; MCPVault gives local lexical discovery when it is not. Direct routes remain optimal for known targets, while filesystem search preserves functionality in harnesses without memory MCP tools.

---

## 2026-08-07

### Disable runtime context-routing reads

- **Decision** — Remove runtime context-routing reads from Claude, shared, and Pi instruction paths, while preserving the routing Markdown as commented dormant reference material.
- **Options considered** — (1) Keep known-route direct reads. (2) Delete the routing document. (3) Retain it but rely on MCP search for memory discovery.
- **Rationale** — MCPVault search provides a single retrieval path for known and ambiguous memory queries. Retaining the document preserves its information without encouraging agents to walk a static context tree.

---

## 2026-08-07

### Expose memory ingest as a skill

- **Decision** — Create the public `MemoryIngest` skill as the primary LLM-guided interface for durable memory promotion, duplicate resolution, metadata, linking, and verification.
- **Options considered** — (1) Build a custom memory-ingest MCP server first. (2) Expose direct MCPVault write tools without workflow guidance. (3) Use a skill over MCPVault primitives.
- **Rationale** — Promotion and duplicate decisions are semantic judgments best made by an LLM under a structured workflow. MCPVault remains the execution layer for search and note edits, while the skill provides consistent policy across harnesses.

---

## 2026-08-21

### Adopt GitHub spec-kit for spec-driven development

- **Decision** — Initialize [spec-kit](https://github.com/github/spec-kit) in the Holocron repo (`.specify/`, `.claude/skills/speckit-*`) with the Claude Code integration, and add a "Spec Before Work" rule to `AGENTS.md` requiring non-trivial work to go through `/speckit-specify` → `/speckit-plan` → `/speckit-tasks` before implementation.
- **Options considered** — (1) Keep the existing informal PRD/ISC workflow (Algorithm) as the only spec mechanism. (2) Adopt spec-kit as a full replacement for the Algorithm's PRD system. (3) Adopt spec-kit as an additional, repo-level convention layered on top of existing per-session PRDs, scoped to trivial-vs-non-trivial work.
- **Rationale** — Option 3 was chosen: spec-kit gives a standardized, harness-native (Claude slash commands) spec/plan/task pipeline for repo work without displacing the Algorithm's own PRD/ISC mechanism, which operates at the session level rather than the repo level. Trivial changes are explicitly exempted to avoid process overhead disproportionate to small edits.

---

## 2026-08-28

### Unified config store — spec 001: single canonical AGENTS.md, skills, and agents

- **Decision** — Per user direction, spec `specs/001-unified-config-store/spec.md` (draft) to eliminate duplication of settings/skill/agent files across the repo and the machine: (1) one canonical global instruction file at `instructions/AGENTS.md` (name kept to match Constitution Principle II), self-contained for always-on content because pi does not expand `@`-imports; Claude Code consumes it via a thin `~/.claude/CLAUDE.md` shim containing `@AGENTS.md`, and pi via symlinked `AGENTS.md` at `~/.pi/agent/`. (2) Harness-only always-on content moves to thin adapters: pi via `~/.pi/agent/APPEND_SYSTEM.md` (TillDone, Graphiti tooling, backend toggle), Claude via shim tail. (3) One `algorithm.md` (the Claude copy is retired; its unported `<!-- reflect: -->` learnings are merged back). (4) Public skills normalized to Agent-Skills-compliant lowercase names; `pi/skills/` wrappers deleted; pi consumes the shared skill root via a `resources_discover` extension instead of a `~/.pi/agent/skills` fan-out. (5) The 15 shared agents move to one canonical file each in a new `agents/` dir, in Claude frontmatter format — no per-harness variants or install-time generation, since Claude is the canonical file structure and the only other harness (pi) does not consume these agents; `opencode/agents/` is deleted and the manual dual-maintenance rule is retired. (6) `install.sh` gains converge-on-rerun behavior and a `--check` drift-report mode; settings precedence fixed (repo template < memory-repo override < harness-local).
- **Options considered** — (1) Keep per-harness top files and add a sync/verification script to detect drift (least change, still duplicates). (2) A build system generating all per-harness files from templates (heavier machinery; the current BuildCLAUDE.ts precedent showed template/build fragility). (3) The chosen hybrid: one canonical source per artifact + thin shims/adapters, with no install-time generation at all — with OpenCode retired, Claude Code is the canonical file structure, so every artifact has exactly one on-disk form. Also considered making `~/.claude/` (the live dir) itself the canonical store — rejected because it is machine-local, unversioned, and mixed with harness runtime state.
- **Rationale** — Directly implements user direction ("unify on AGENTS.md … CLAUDE.md … use @AGENTS.md … skills/agents stored in the claude file structure … harnesses like pi extended to read from those directories") and Constitution Principle I (per-harness dirs are disposable adapters, never the source of truth). The measured drift (84-line algorithm.md divergence, wrapper-only-differ-in-case SKILL.md files, settings link pointing at the template) made "detect drift and hope" (option 1) unattractive; the build-system option (2) is disproportionate because only the Claude shim and the pi overlay genuinely differ in content, and neither requires generation. The spec is a draft — implementation awaits `/speckit-plan` + `/speckit-tasks` and user sign-off.

### Retire OpenCode harness support (spec 001 scope change)

- **Decision** — Per user direction (2026-08-28, same day as the spec above): remove OpenCode support from the Holocron repo entirely and focus the unified-config work on exactly two harnesses, Claude Code and pi. Concretely: delete `opencode/` (agents, plugins, `PLUGINS.md`); drop the OpenCode section from `install.sh`/`install.ps1`; strip OpenCode-specific tool names/paths from shared content (including the opencode tool table in `algorithm.md`); migrate the live machine by removing only Holocron-created pointers under `~/.config/opencode/` (user content and OpenCode's own config untouched); document two supported harnesses everywhere.
- **Options considered** — (1) Keep OpenCode adapters but freeze them (no sync effort, still a third stale source of truth). (2) Retire OpenCode from the repo while leaving the live `~/.config/opencode/` pointers in place (repo clean, machine still half-wired). (3) Full retirement, repo + installer + machine migration, with re-adding support designed to stay a small additive change under Constitution I.
- **Rationale** — The user no longer runs OpenCode against this config, so its adapters are pure maintenance liability: every shared-content edit would otherwise have to consider a dead consumer. The 2026-03-17 "Remove Claude Code harness support" decision (later superseded when Claude came back as the canonical structure) establishes that harness scope is user-directed and reversible. Option 3 chosen; US6 in spec 001 carries the acceptance criteria, and the `resources_discover`-based pi extension makes re-adding any future harness (including OpenCode) a one-section installer + one thin adapter change.

### Spec 001: validation, plan, and tasks — open items resolved at plan time

- **Decision** — Validated `spec.md` against the constitution and the live repo/machine (2026-08-28) and generated the full design set: `plan.md`, `research.md` (R1–R8), `data-model.md`, `contracts/install-cli.md`, `quickstart.md`, and `tasks.md` (36 tasks across 7 user stories; `install.sh` edits serialized). Plan-time resolutions: (1) **settings stay symlinks** (FR-013); apply mode additionally resets *content churn* inside a linked settings file from its link target (closes the live `M claude/settings.json` daemon-churn gap; the copy-instead-of-link alternative rejected on Constitution VI). (2) **User-file protection rule**: the installer manages a settings pointer only when the live path is a Holocron-created symlink; real user files (`~/.pi/agent/settings.json` currently, `settings.local.json`) are never touched and reported `SKIPPED (user-local)` — the pi case proves this distinction is load-bearing. (3) **Private agents** move `$HOLOCRON_MEMORY_DIR/agents/opencode/` → `$HOLOCRON_MEMORY_DIR/agents/` (harness-neutral, Claude format) — the spec's assumed `agents/claude/` path does not exist; the actual private agents (LahzoChatTester, ProductManager) lived under the retired harness's path. (4) The pi `skill-roots.ts` extension returns `skillPaths` (repo + memory-repo roots) only; the native `~/.pi/agent/prompts` symlink stays (no double-registration). (5) Hand-added external skill symlinks in `~/.claude/skills/` are preserved and reported `EXTERNAL` (never deleted, FR-016). (6) `install.ps1`: OpenCode section removed + "not yet updated" guard (full parity out of scope). (7) Validation corrected stale spec counts against live state: 16 shared agents (not 15 — `ContextEngineer`), 13 pi wrappers (not 12), 4 unported reflect learnings (not 6), and aligned FR-014's doc list with US6 AS5 (added `pi/EXTENSIONS.md`).
- **Options considered** — See `specs/001-unified-config-store/research.md` R1–R8 for per-item alternatives (mainly rejected: copy-vs-link for settings, per-harness private-agent dirs, pi skill fan-out, Windows ps1 parity, leaving `opencode.json` in place).
- **Rationale** — Every open item the spec deferred to plan time (its Assumptions and edge cases) is now a recorded decision with evidence, so `tasks.md` is immediately executable. Two items were explicitly **gated on Jack's approval** rather than assumed: (a) Constitution Amendment 1.1.0 (task T003) — validation found the spec's lowercase Agent-Skills naming (FR-006) conflicts with the constitution's TitleCase "Skill structure" constraint, and the "Supported harnesses" constraint still lists retired OpenCode; both are stale constraint text vs. newer user direction, remediated by amendment (per governance, the constitution is amended out-of-band with approval, never silently overridden); (b) `~/.config/opencode/opencode.json` (task T029, research R8) — the spec's US6 AS2 example listed it as OpenCode's own, but live it is an installer-created symlink; default was remove-and-notice, pending confirmation. **Both gates were approved by Jack on 2026-08-28** — see the two entries below.

### Constitution Amendment 1.1.0 — skill naming standard + supported harnesses

- **Decision** — Per governance (sole approver: Jack; approved 2026-08-28 in response to spec 001 validation findings C1/C2): amended `.specify/memory/constitution.md` from 1.0.0 → **1.1.0 (MINOR)**: (1) the "Skill structure" constraint now mandates lowercase-hyphen Agent-Skills naming for public skills (frontmatter `name` == directory, `[a-z0-9-]+`, `USE WHEN` trigger retained; personal `_ALLCAPS` rule unchanged), replacing TitleCase; (2) the "Supported harnesses" constraint now lists exactly Claude Code + pi.dev, with add-a-harness wording updated to "one installer section + one thin per-harness adapter". Core Principles I–VI are untouched — Principle I's portability rationale (including its historical OpenCode mention) is intentionally preserved, matching the spec's exempted "constitution's portability rationale". Task T003 is complete.
- **Options considered** — (1) Leave the constitution stale and let spec 001 silently override it (rejected — governance requires an explicit amendment, and stale constraint text is exactly the drift disease this project exists to eliminate); (2) PATCH 1.0.1 (rejected — changed normative guidance on two constraints is MINOR under the constitution's own versioning policy); (3) MAJOR 2.0.0 (rejected — no principles removed or redefined).
- **Rationale** — Both constraints were stale text vs. newer, already-recorded user direction (this file, 2026-08-28: spec 001 + OpenCode retirement); the amendment codifies what the user had already decided rather than changing any value. Per the /speckit-analyze rule, constitution changes occur as a separate, explicit update — not diluted into the spec/plan/tasks — with this required DECISIONS.md entry.

### `~/.config/opencode/opencode.json` — confirmed for removal (research R8)

- **Decision** — Per Jack's confirmation (2026-08-28), `~/.config/opencode/opencode.json` is treated as a **Holocron-created pointer** and removed: the R8 default (remove + notice) is now the spec'd behavior. The symlink was removed from the live machine immediately on 2026-08-28 (restorable at any time: `ln -s $HOLOCRON_MEMORY_DIR/opencode.json ~/.config/opencode/opencode.json`); T029's machine migration covers the remaining opencode pointers and prints the removal notice. Spec US6 AS2 and research R8 updated to match.
- **Options considered** — Leave it (spec-literal reading of the original US6 AS2 example) vs. remove (R8 default). Removal chosen: it is a symlink created by `install.sh:306` targeting the memory repo — by the spec's own definition it is Holocron-managed, and keeping a Holocron pointer in a retired harness's home perpetuates the duplication disease spec 001 treats. The original example text was simply out of date vs. live state.
- **Rationale** — Reversible (target file stays in the memory repo), user-confirmed, and consistent with US6 AS3 (post-migration the installer never touches `~/.config/opencode/` at all — if OpenCode needs its config again, that is OpenCode's/user's concern per the spec's edge case).
