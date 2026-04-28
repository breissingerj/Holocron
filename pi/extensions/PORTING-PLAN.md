# Pi Extensions Porting Plan

Port Holocron's Claude Code hooks and OpenCode plugins to pi's `ExtensionAPI` so pi reaches functional Holocron parity.

**Source inventory:**
- 20 Claude Code hooks in `$HOLOCRON_MEMORY_DIR/hooks/*.hook.ts`
- 8 OpenCode plugins in `Holocron/plugins/`

**Target:** `extensions/<name>/index.ts` symlinked to `~/.pi/agent/extensions/<name>/`

---

## Event mapping: Claude → Pi

| Claude Hook Trigger | Pi Extension Event | Notes |
|---|---|---|
| `SessionStart` | `session_start` | `reason: "startup" \| "resume" \| "new" \| "fork"` |
| `SessionEnd` | `session_shutdown` | Fired on exit, `/new`, `/resume`, `/fork` |
| `UserPromptSubmit` | `input` | Can intercept, transform, or short-circuit |
| `PreToolUse` | `tool_call` | Return `{ block: true, reason }` to block |
| `PostToolUse` | `tool_result` | Can modify result; chains across extensions |
| `Stop` | `agent_end` | One per user prompt |
| `SubagentStop` | `turn_end` | Per LLM turn (more granular) |
| `PreCompact` | `session_before_compact` | |
| *(pi-native)* | `before_agent_start` | Inject context into system prompt — cleaner than SessionStart for context injection |
| *(pi-native)* | `resources_discover` | Contribute skill/prompt paths |

**Key difference:** Claude hooks communicate via `stdout` JSON + `exit(2)` for hard blocks. Pi extensions return typed objects from async handlers. The `_lib/block.ts` adapter bridges the models for shared logic.

**Tool name difference:** Claude uses `Bash`, `Edit`, `Write`, `Read`, `Task`. Pi uses `bash`, `edit`, `write`, `read` (no Task equivalent). `_lib/tool-names.ts` provides the mapping.

---

## Tier 1 — Core parity (ship first)

Without these, pi is not a real Holocron harness.

### `holocron-load-context`

**Replaces:** `LoadContext.hook.ts` + `holocron-context-loader` (OpenCode plugin)  
**Pi event:** `before_agent_start` (preferred over `session_start` — injects directly into system prompt)  
**What it does:** Injects `MEMORY.md`, recent relationship notes, learning digest, and active PRD summary at session start. Skips subagent sessions.

**Port notes:**
- Claude hook uses `console.log(<system-reminder>...)` to inject — pi uses `return { systemPrompt: ... }` from `before_agent_start`
- Subagent detection: Claude checks `CLAUDE_CODE_AGENT_TASK_ID` env var. Pi: check `ctx.sessionManager` for session source, or simply always inject (pi has no subagent concept yet)
- `loadAtStartup.files` from `settings.json` — read via `ctx.cwd` / `getAgentDir()` equivalent
- `loadLearningDigest`, `loadWisdomFrames`, `loadFailurePatterns` from `_lib/learning-readback` stay in private repo; public extension calls them as imported helpers

---

### `holocron-prd-sync`

**Replaces:** `PRDSync.hook.ts`  
**Pi event:** `tool_result` on `write` or `edit` tools  
**What it does:** When the AI writes to a `PRD.md` inside `$HOLOCRON_MEMORY_DIR/WORK/`, reads frontmatter + criteria and syncs to `STATE/work.json`.

**Port notes:**
- Claude receives `tool_input.file_path` in `PostToolUse`. Pi receives `event.toolName` + `event.input` in `tool_result` — `input.path` for write/edit
- Trigger condition: `event.input.path?.endsWith('PRD.md') && event.input.path?.includes('/WORK/')`
- `parseFrontmatter()` + `syncToWorkJson()` from `_lib/prd-utils.ts` — extract to `_lib/` and import
- Phase tab color change (Kitty OSC) can be dropped or replaced with `ctx.ui.setStatus()`

---

### `holocron-voice-completion`

**Replaces:** `VoiceCompletion.hook.ts`  
**Pi event:** `agent_end`  
**What it does:** Extracts the 🗣️ summary line from the assistant's final response and pipes it to `scripts/voice.sh` for spoken playback.

**Port notes:**
- Claude reads transcript via `parseTranscriptFromInput(input)`. Pi: access `event.messages` from `agent_end` — find the last assistant text message and extract the `🗣️` line with regex
- Subagent gate: `algorithm.md` already says subagents must never call voice. Check `event` context or simply trust that only the main session has `agent_end` firing in interactive mode
- `shouldNotify()` volume check — import from private `VolumeLevel` tool, or re-implement as a simple file read of `STATE/volume.level`
- Shell out to `scripts/voice.sh` via `pi.exec()` or `child_process.spawn`

---

### `holocron-security-validator`

**Replaces:** `SecurityValidator.hook.ts`  
**Pi event:** `tool_call` on `bash`, `edit`, `write`, `read`  
**What it does:** Validates commands and file paths against `patterns.yaml`. Hard-blocks catastrophic operations; prompts user for confirm-level operations; logs all security events.

**Port notes:**
- Claude tool names `Bash/Edit/Write/Read` → pi `bash/edit/write/read` — use `_lib/tool-names.ts`
- Claude blocks via `process.exit(2)` + stderr. Pi blocks via `return { block: true, reason }` — cleaner
- Confirm-level: Claude returns `{ decision: "ask", message: "..." }`. Pi: use `ctx.ui.confirm("Title", message)` in the `tool_call` handler — returns `true/false`. Block if user says no.
- `patterns.yaml` path: `$HOLOCRON_MEMORY_DIR/Holocron/USER/SECURITYSYSTEM/patterns.yaml` — keep private
- Security event logging: keep same JSONL-per-event pattern in `$HOLOCRON_MEMORY_DIR/STATE/SECURITY/`

---

### `holocron-skill-guard`

**Replaces:** `SkillGuard.hook.ts`  
**Pi event:** `tool_call` on the skill tool (if pi exposes skill invocation as a tool call) — or `input` event intercepting `/skill:keybindings-help`  
**What it does:** Blocks the `keybindings-help` skill from being invoked on unrelated prompts due to position-bias false positives.

**Port notes:**
- Pi does not have an equivalent "Skill tool" that the LLM calls explicitly — skills are injected into context and the LLM follows their instructions natively. This hook may not be needed.
- Alternative: use `before_agent_start` to re-order or filter skill injections
- **Verdict:** Evaluate after Tier-1 launch. May be a no-op for pi.

---

## Tier 2 — Learning & memory loop

### `holocron-rating-capture` + `holocron-last-response-cache`

**Replaces:** `RatingCapture.hook.ts` + `LastResponseCache.hook.ts`  
**Pi events:** `input` (intercept digit ratings like `9`, `10`), `agent_end` (cache last response)  
**What it does:** Intercepts single-digit user inputs as session ratings; caches the previous assistant response so the rating can be associated with it.

**Port notes:**
- `input` event with `return { action: "handled" }` short-circuits agent processing for rating inputs — cleaner than Claude's `UserPromptSubmit` interception
- Cache last response in extension-local state (updated on each `agent_end`)
- Write to `STATE/LEARNING/SIGNALS/ratings.jsonl`

---

### `holocron-work-completion-learning`

**Replaces:** `WorkCompletionLearning.hook.ts`  
**Pi event:** `session_shutdown`  
**What it does:** On session end, reads the PRD LEARN phase output and appends a structured reflection to `LEARNING/REFLECTIONS/algorithm-reflections.jsonl`.

---

### `holocron-relationship-memory`

**Replaces:** `RelationshipMemory.hook.ts`  
**Pi event:** `session_shutdown`  
**What it does:** Appends a daily relationship note to `RELATIONSHIP/YYYY-MM/YYYY-MM-DD.md` capturing interaction tone and patterns. **Identity-coupled** — implementation stays in private repo; public extension is a thin wrapper.

---

### `holocron-session-cleanup`

**Replaces:** `SessionCleanup.hook.ts`  
**Pi event:** `session_shutdown`  
**What it does:** Marks the current WORK session as COMPLETED, clears `STATE/current-work.json`, cleans `session-names.json` ghost entries.

---

### `holocron-update-counts`

**Replaces:** `UpdateCounts.hook.ts`  
**Pi event:** `session_shutdown`  
**What it does:** Bumps session/token counters in `STATE/counts.json`.

---

### `holocron-session-autoname`

**Replaces:** `SessionAutoName.hook.ts`  
**Pi event:** `input` (first prompt only)  
**What it does:** Generates a 4-word session title on first prompt. Stores in `STATE/session-names.json`. Background-upgrades with inference.

**Port notes:**
- Pi has a native `/name` command (`pi.setSessionName()`). This extension should call `pi.setSessionName(label)` instead of writing to `session-names.json` directly — that's the pi-native way.
- Two-step: deterministic keyword extraction for immediate display, background subprocess for inference upgrade
- `upsertSession()` in `_lib/prd-utils.ts` for `work.json` tracking

---

## Tier 3 — Maintenance & integrity

### `holocron-integrity-check`

**Replaces:** `IntegrityCheck.hook.ts`  
**Pi event:** `session_shutdown`  
**What it does:** Validates symlink integrity of Holocron install on session end. Non-blocking.

---

### `holocron-doc-integrity`

**Replaces:** `DocIntegrity.hook.ts`  
**Pi event:** `tool_result` on write/edit to system files  
**What it does:** Detects writes to key system files (algorithm.md, steering-rules.md, MEMORY.md) and validates structure post-write.

---

### `holocron-agent-execution-guard`

**Replaces:** `AgentExecutionGuard.hook.ts`  
**Pi event:** `before_agent_start`  
**What it does:** Guards against recursive agent execution and validates session state before the agent loop starts.

**Port notes:** Pi's `before_agent_start` is cleaner than Claude's PreToolUse-on-Task hack. Direct mapping.

---

## Tier 4 — Terminal UX (Kitty-only, optional)

Pi has native `ctx.ui.setStatus()` and `ctx.ui.setWidget()` — evaluate using these before porting OSC escapes.

### `holocron-tab-title`

**Replaces:** `UpdateTabTitle.hook.ts` + `ResponseTabReset.hook.ts` + `SetQuestionTab.hook.ts` + `QuestionAnswered.hook.ts` (4 Claude hooks → 1 pi extension)  
**Pi events:** `agent_start`, `agent_end`, `input`  
**What it does:** Sets Kitty tab title and color to reflect session state (working/answering/idle). Pi's event model supports consolidating all 4 into one.

**Port notes:**
- Pi `ctx.ui.setStatus("my-ext", "⚙ Working...")` sets footer status — may fully replace Kitty OSC for most use cases
- Still emit Kitty OSC escapes as fallback for users who want it

### `holocron-kitty-env-persist`

**Replaces:** `KittyEnvPersist.hook.ts`  
**Pi event:** `session_start`  
**What it does:** Writes `KITTY_PID` + `KITTY_WINDOW_ID` to a per-session file so other extensions can target the right Kitty window.

---

## Drop / Defer

| Source | Decision |
|---|---|
| `holocron-ralph-loop` | **Drop** — OpenCode-specific iteration loop, no pi equivalent |
| `holocron-glob-rules` | **Evaluate** — pi has project-local `.pi/` discovery; may cover it natively |
| `holocron-agents-loader` | **Defer** — depends on sub-agent bridge extension (tracked separately) |
| `holocron-memory-feed` | **Evaluate** — likely collapses into `holocron-load-context` |

---

## Shared lib plan (`_lib/`)

Extract these from `$HOLOCRON_MEMORY_DIR/hooks/lib/` into `extensions/_lib/`:

| Module | Extracts from | Notes |
|---|---|---|
| `paths.ts` | `hooks/lib/paths.ts` | `getHolocronMemoryDir()`, `holocronPath()` — public, no identity data |
| `prd-utils.ts` | `hooks/lib/prd-utils.ts` | `parseFrontmatter()`, `syncToWorkJson()`, `readRegistry()`, `upsertSession()` — public |
| `tool-names.ts` | New | `{ Bash: "bash", Edit: "edit", Write: "write", Read: "read" }` translation table |
| `block.ts` | New | `blockTool(reason: string): { block: true, reason: string }` typed helper |
| `notifications.ts` | `hooks/lib/notifications.ts` | `recordSessionStart()`, `shouldNotify()` — evaluate if volume.level read needs to stay private |

Identity-coupled helpers (`learning-readback.ts`, `tab-setter.ts`, `hook-io.ts`) stay in `$HOLOCRON_MEMORY_DIR/hooks/lib/` and are imported by extensions at runtime.

---

## Recommended first PR

**Phase 1 — Scaffold + Tier 1** (this PR):

- [x] `pi/extensions/` directory created with `README.md` and `PORTING-PLAN.md`
- [x] `pi/extensions/_lib/` scaffolded
- [x] `install.sh` updated to symlink `pi/extensions/*` → `~/.pi/agent/extensions/*`
- [ ] `pi/extensions/_lib/paths.ts` — extract from private lib
- [ ] `pi/extensions/_lib/prd-utils.ts` — extract from private lib
- [ ] `pi/extensions/holocron-load-context/` — Tier 1
- [ ] `pi/extensions/holocron-prd-sync/` — Tier 1
- [ ] `pi/extensions/holocron-voice-completion/` — Tier 1
- [ ] `pi/extensions/holocron-security-validator/` — Tier 1

Result: pi reaches functional Holocron parity for the four most-used behaviors. Tier 2–4 ship incrementally.
