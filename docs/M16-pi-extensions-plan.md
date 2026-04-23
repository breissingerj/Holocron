# M16 — Pi Extensions Port Plan

**Status:** Proposed (not started)
**Prerequisite:** M15 (pi.dev harness support) — shipped
**Target branch:** `feat/m15-pi-dev-harness-support` (extend, or fork to `feat/m16-pi-extensions`)

## Context

M15 shipped filesystem-level pi.dev harness support — `skills/`, `commands/→prompts/`, `instructions/`, `scripts/`, and a pi-specific `AGENTS.md` are all symlinked into `~/.pi/agent/`. What remains is **lifecycle integration**: the 20 Claude-Code hooks and 8 OpenCode plugins that give Holocron its runtime behavior (context injection, PRD sync, security validation, learning capture, voice completion, etc.).

M15's ROADMAP entry explicitly defers this: *"Port `plugins/` (OpenCode TypeScript plugins) to pi Extensions — different API surface (`pi.registerTool`, `pi.registerCommand`, `pi.on(event, ...)` vs OpenCode hooks). **Deferred** — start with `holocron-context-loader`, `holocron-prd`, `holocron-learning-capture`."*

M16 closes that gap.

## Directory Pattern

Pi extensions live in a top-level `extensions/` directory — separate from `hooks/` — because pi uses a distinct enough API (`ExtensionAPI`) and naming convention that nesting under `hooks/` was confusing:

```
extensions/
├── _lib/                    # Shared helpers (PRD parsing, STATE paths, tool-name mapping)
├── holocron-load-context/   # Tier 1
├── holocron-prd-sync/       # Tier 1
├── holocron-voice-completion/ # Tier 1
├── holocron-security-validator/ # Tier 1
└── ...                      # See extensions/PORTING-PLAN.md
```

Claude hooks and OpenCode plugins continue to live under `hooks/claude/` and `hooks/opencode/` respectively. See [`extensions/README.md`](../extensions/README.md) for the full layout rationale.

`install.sh` symlinks each `extensions/<name>/` → `~/.pi/agent/extensions/<name>/` and runs `bun install` per extension.

**Migration is incremental** — M16 scaffolds `extensions/` and ports Tier-1 extensions. OpenCode plugins migrate from `plugins/` → `hooks/opencode/` on the next plugin touch. Public Claude hooks migrate on the next Claude-hook touch.

## Event Mapping (Claude → Pi)

| Claude Hook Event | Pi Extension Event | Notes |
|---|---|---|
| `SessionStart` | `session_start` (with `reason`) | `reason: "startup" \| "resume" \| "new" \| "fork"` |
| `SessionEnd` | `session_shutdown` | Fired on `/new`, `/resume`, `/fork`, and exit |
| `UserPromptSubmit` | `input` | Can intercept, transform, or short-circuit |
| `PreToolUse` | `tool_call` | Return `{ block: true, reason }` to block |
| `PostToolUse` | `tool_result` | Can modify result |
| `Stop` / `SubagentStop` | `turn_end` / `agent_end` | Pi separates these more cleanly |
| `PreCompact` | `session_before_compact` | |
| *(pi-native)* | `resources_discover` | Extensions can contribute skill/prompt paths |
| *(pi-native)* | `before_provider_request` | Inspect/replace payload pre-LLM |
| *(pi-native)* | `model_select` | |

Pi has more granular events than Claude Code. Most hooks map cleanly; terminal-UX hooks (Kitty OSC tab title) are UI-agnostic and port as-is, though pi's native `ctx.ui.setStatus()` / `ctx.ui.setWidget()` may be cleaner.

## Hook Inventory

### From `$HOLOCRON_MEMORY_DIR/hooks/` (20 Claude `.hook.ts`)

AgentExecutionGuard, DocIntegrity, IntegrityCheck, KittyEnvPersist, LastResponseCache, LoadContext, PRDSync, QuestionAnswered, RatingCapture, RelationshipMemory, ResponseTabReset, SecurityValidator, SessionAutoName, SessionCleanup, SetQuestionTab, SkillGuard, UpdateCounts, UpdateTabTitle, VoiceCompletion, WorkCompletionLearning.

### From `Holocron/plugins/` (8 OpenCode plugins)

holocron-agents-loader, holocron-context-loader, holocron-glob-rules, holocron-learning-capture, holocron-memory-feed, holocron-prd, holocron-ralph-loop.

### Current pi extensions

None. `~/.pi/agent/extensions/` does not exist.

## Phased Plan

### Phase 1 — Foundation (ship first, blocks everything else)

1. Scaffold `extensions/` with `_lib/`, `README.md`, `PORTING-PLAN.md` — **done**.
2. Extract common helpers to `extensions/_lib/`:
   - PRD frontmatter parser (matches existing `hooks/lib/` in `$HOLOCRON_MEMORY_DIR`)
   - STATE path resolver (evaluates `$HOLOCRON_MEMORY_DIR`)
   - Tool-name translation (Claude `Bash|Edit|Write|Read|Task` ↔ pi `bash|edit|write|read`)
   - Blocking-semantics adapter (Claude exit-code ↔ pi `{ block, reason }`)
3. Update `install.sh` pi section to symlink each `extensions/<name>/` → `~/.pi/agent/extensions/<name>/`. Run `bun install` in each ext dir on install — **done**.

### Phase 2 — Tier-1 (core Holocron parity)

Without these, pi is not a real Holocron harness.

| Extension | Replaces | Events | Notes |
|---|---|---|---|
| `extensions/holocron-load-context` | `LoadContext.hook.ts` + `holocron-context-loader` | `before_agent_start` | Inject `MEMORY.md`, relationship notes, active PRD into system prompt |
| `extensions/holocron-prd-sync` | `PRDSync.hook.ts` + `holocron-prd` | `tool_result` (write/edit on PRD.md) | Sync frontmatter → `STATE/work.json` |
| `extensions/holocron-voice-completion` | `VoiceCompletion.hook.ts` | `agent_end` | Pipes 🗣️ line to `scripts/voice.sh` |
| `extensions/holocron-security-validator` | `SecurityValidator.hook.ts` | `tool_call` (bash/edit/write/read) | Block dangerous commands, confirm risky ones |
| `extensions/holocron-skill-guard` | `SkillGuard.hook.ts` | `tool_call` or `input` | Block false-positive skill invocations (evaluate need — pi skill model differs) |

### Phase 3 — Tier-2 (learning & memory loop)

| Extension | Replaces | Events |
|---|---|---|
| `holocron-rating-capture` | `RatingCapture.hook.ts` + `LastResponseCache.hook.ts` | `input` (intercept `9/10` ratings), `turn_end` (cache last response) |
| `holocron-work-completion-learning` | `WorkCompletionLearning.hook.ts` | `session_shutdown` |
| `holocron-relationship-memory` | `RelationshipMemory.hook.ts` | `session_shutdown` |
| `holocron-session-cleanup` | `SessionCleanup.hook.ts` | `session_shutdown` |
| `holocron-update-counts` | `UpdateCounts.hook.ts` | `session_shutdown` |
| `holocron-session-autoname` | `SessionAutoName.hook.ts` | `input` or `turn_end` — pi already has `/name`, lighter port |

### Phase 4 — Tier-3 (maintenance & integrity)

| Extension | Replaces | Events |
|---|---|---|
| `holocron-integrity-check` | `IntegrityCheck.hook.ts` | `session_shutdown` |
| `holocron-doc-integrity` | `DocIntegrity.hook.ts` | `tool_result` (on system-file writes) |
| `holocron-agent-execution-guard` | `AgentExecutionGuard.hook.ts` | `before_agent_start` (pi-native, better than Claude's PreToolUse-on-Task hack) |

### Phase 5 — Tier-4 (terminal UX, Kitty-only, optional)

Pi has native `ctx.ui.setStatus()` / `ctx.ui.setWidget()` — evaluate using these instead of OSC escapes before porting.

| Extension | Replaces |
|---|---|
| `holocron-kitty-env-persist` | `KittyEnvPersist.hook.ts` |
| `holocron-tab-title` | `UpdateTabTitle` + `ResponseTabReset` + `SetQuestionTab` + `QuestionAnswered` (4 Claude hooks → 1 pi extension; pi's event model supports the consolidation) |

### Phase 6 — Drop / Defer

| Plugin | Decision |
|---|---|
| `holocron-ralph-loop` | Drop or reimplement as slash command — OpenCode-specific iteration primitive with no pi equivalent |
| `holocron-glob-rules` | Evaluate — pi has project-local `.pi/` discovery that may cover it |
| `holocron-agents-loader` | Skip until sub-agent bridge extension lands (tracked separately in M15 deferred work) |
| `holocron-memory-feed` | Evaluate overlap with `holocron-load-context` — may collapse into one extension |

## Design Decisions

1. **Shared lib placement.** Claude hooks in `$HOLOCRON_MEMORY_DIR/hooks/` import from `hooks/lib/` (private). Options:
   - (a) Copy lib into `hooks/_lib/` (duplication, divergence risk)
   - (b) Symlink `$HOLOCRON_MEMORY_DIR/hooks/lib` → `hooks/_lib` at install time (keeps lib private, single source)
   - (c) Publish lib as local npm workspace
   - **Recommend (b)** — minimum churn, lib stays private.

2. **Tool-name mapping.** Pi uses lowercase tool names (`bash`, `edit`, etc.) and has no `Task`. `_lib/tool-names.ts` provides the translation table.

3. **Blocking adapter.** Claude hooks block via non-zero exit + stderr; pi extensions return `{ block: true, reason }`. `_lib/block.ts` bridges both models so handler logic is harness-agnostic.

4. **Testing.** Each extension ships a `test.ts` that invokes handlers with mock events — no pi runtime required for unit tests.

5. **`hooks/` migration timing.** M16 creates `hooks/` and populates `hooks/pi/`. `plugins/` → `hooks/opencode/` and private-repo Claude hooks → `hooks/claude/` migrate opportunistically on next touch to avoid scope creep.

## Recommended First PR

**Ship Phase 1 + Phase 2 only.** That's:

- `extensions/` scaffolded with `README.md`, `PORTING-PLAN.md`, `_lib/` — **done**
- `install.sh` pi extension wiring — **done**
- 4 Tier-1 extensions to build: `holocron-load-context`, `holocron-prd-sync`, `holocron-voice-completion`, `holocron-security-validator`

Result: pi reaches functional Holocron parity for the most-used behaviors. Phases 3–5 follow incrementally.

**Estimated effort:** Phase 1 = 2–3 hours. Phase 2 = 6–10 hours (depending on whether we symlink Claude hook lib or rewrite for pi idioms).

## Success Criteria

- [ ] `~/.pi/agent/extensions/` populated after `install.sh`
- [ ] pi loads Tier-1 extensions without errors on startup
- [ ] pi session on startup shows memory + active PRD injection (matches Claude Code / OpenCode behavior)
- [ ] Writing to a `PRD.md` under `$HOLOCRON_MEMORY_DIR/WORK/` updates `STATE/work.json` automatically
- [ ] `bash` tool call with `rm -rf /` (or equivalent) is blocked with clear reason
- [ ] `turn_end` triggers a voice announcement matching the Claude VoiceCompletion behavior
- [ ] No regression in Claude Code / OpenCode harness behavior (they don't touch `hooks/pi/`)
