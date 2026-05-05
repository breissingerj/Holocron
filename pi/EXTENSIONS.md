# Pi Extensions

Tracking for all pi extensions — both npm-installed packages and lifted local extensions from third-party repos.
Update this file whenever an extension is added, removed, or sourced.

---

## Local Extensions (Lifted)

Sourced from [`disler/pi-vs-claude-code`](https://github.com/disler/pi-vs-claude-code/tree/main/extensions).
Files live in `pi/extensions/`. All five share a required dependency: `themeMap.ts` (also lifted, same source).

> **Activated automatically** by `install.sh`, which symlinks all `.ts` files from `pi/extensions/` (and the `prd-sidebar/` subdirectory) into `~/.pi/agent/extensions/`. The `_lib/` directory is a shared helper and is intentionally skipped. No manual copying required.

---

### damage-control

| Field | Value |
|-------|-------|
| **File** | `pi/extensions/damage-control.ts` |
| **Source** | https://github.com/disler/pi-vs-claude-code/blob/main/extensions/damage-control.ts |
| **License** | (see source repo) |
| **Lifted** | 2026-05-01 |

**What it does:** Rule-based safety gate. Loads a YAML rules file from `.pi/damage-control-rules.yaml` (project) or `~/.pi/damage-control-rules.yaml` (global) and enforces four rule types:
- `bashToolPatterns` — regex patterns to block or confirm in bash commands
- `zeroAccessPaths` — paths Pi cannot touch at all
- `readOnlyPaths` — paths Pi can read but not write/edit
- `noDeletePaths` — paths Pi cannot delete or move

Rules with `ask: true` show a confirmation dialog instead of hard-blocking. All violations are logged via `pi.appendEntry`. Directly reinforces Holocron's *"ask before destructive actions"* steering rule in code.

**To configure:** Create `~/.pi/damage-control-rules.yaml` (or `.pi/damage-control-rules.yaml` in a project). See [source repo](https://github.com/disler/pi-vs-claude-code/blob/main/.pi/damage-control-rules.yaml) for the full schema.

---

### tilldone

| Field | Value |
|-------|-------|
| **File** | `pi/extensions/tilldone.ts` |
| **Source** | https://github.com/disler/pi-vs-claude-code/blob/main/extensions/tilldone.ts |
| **License** | (see source repo) |
| **Lifted** | 2026-05-01 |

**What it does:** Task discipline enforcer. Registers a `tilldone` tool and **blocks every other tool call** until the agent has defined a task list and marked one item as in-progress. Three-state lifecycle: `idle → inprogress → done`. Auto-nudges the agent at `agent_end` if tasks remain incomplete. Full TUI overlay via `/tilldone`.

Aligns with Holocron's ISC principle (verifiable criteria before executing) and ALGORITHM mode's planning phase.

**Commands / tool actions:** `new-list`, `add`, `toggle`, `remove`, `update`, `list`, `clear`

---

### slash-synthesis

| Field | Value |
|-------|-------|
| **File** | `pi/extensions/slash-synthesis.ts` |
| **Source** | Holocron original |
| **License** | MIT |
| **Authored** | 2026-05-05 |

**What it does:** Closes the feedback loop for slash-driven subagent runs.

pi-subagents' slash commands (`/run-chain`, `/run`, `/chain`, `/parallel`) inject their results into the session with `display: true` but *without* `triggerTurn: true`. The chain output lands in context but the main LLM never gets a turn to respond — the session just goes idle.

This extension listens for `subagent:slash:response` and sends a hidden synthesis prompt with `triggerTurn: true` and `deliverAs: "followUp"`, causing the main agent to immediately process the chain results and respond with a synthesis of what was accomplished, key findings, and next actions.

**Toggle:**
- `/synthesis-on` — enable (default)
- `/synthesis-off` — disable (results land in context silently)

**Note:** When the main LLM itself calls the `subagent` tool, synthesis happens automatically (the tool result is processed in the normal turn). This extension is only needed for the slash-command path.

---

### subagent-progress

| Field | Value |
|-------|-------|
| **File** | `pi/extensions/subagent-progress.ts` |
| **Source** | Holocron original |
| **License** | MIT |
| **Authored** | 2026-05-04 |

**What it does:** Live card-grid progress tracker for [pi-subagents](https://www.npmjs.com/package/pi-subagents). Hooks into `tool_execution_start`, `tool_execution_update`, and `tool_execution_end` events and renders a real-time status grid below the editor while any `subagent` tool call is running.

- **Single agent** → one full-width card
- **Parallel** (`tasks: [...]`) → cards side-by-side
- **Chain** (`chain: [...]`) → cards left-to-right with `──▶` arrows between steps
- Multiple concurrent `subagent` calls (LLM parallelizing two chains in one turn) each get their own labelled section stacked vertically
- Elapsed timer ticks at 500 ms; last work line updates from streaming partial output
- Chain step transitions detected from pi-subagents' compact progress text patterns (`done X → running Y`, `✓ X`)
- Completed runs linger 8 s then auto-clear

**Card layout (5 lines):**
```
┌──────────────────┐
│ Scout            │   agent name
│ ● running 1.5s   │   status + elapsed
│  reading auth.ts │   last work line
└──────────────────┘
```

**Commands / shortcuts:**
- `/subagent-progress` — show / refresh the grid
- `Ctrl+Shift+G` — toggle grid visibility

**Dependencies:** Requires `pi-subagents` npm package (`npm:pi-subagents` in `pi/settings.json`). Uses `themeMap.ts` for default theme.

---

### tool-counter

| Field | Value |
|-------|-------|
| **File** | `pi/extensions/tool-counter.ts` |
| **Source** | https://github.com/disler/pi-vs-claude-code/blob/main/extensions/tool-counter.ts |
| **License** | (see source repo) |
| **Lifted** | 2026-05-01 |

**What it does:** Rich two-line footer for every session.
- Line 1: model ID + context bar + tokens in + tokens out + session cost (e.g. `$0.0142`)
- Line 2: cwd + git branch + per-tool call tally

Cost and token tracking accumulate across the full session branch via `ctx.sessionManager.getBranch()`.

---

### purpose-gate

| Field | Value |
|-------|-------|
| **File** | `pi/extensions/purpose-gate.ts` |
| **Source** | https://github.com/disler/pi-vs-claude-code/blob/main/extensions/purpose-gate.ts |
| **License** | (see source repo) |
| **Lifted** | 2026-05-01 |

**What it does:** Prompts the engineer to declare intent on session start via a text input dialog. Purpose is **optional** — dismissing the dialog (empty input) lets you continue without one. When provided, the purpose is displayed in a persistent widget and injected into the system prompt as a `<purpose>` block for the full session, keeping the agent focused.

**Enable / disable:** The extension reads `purpose_gate.enabled` from `~/.pi/agent/settings.json` at load time. Set it to `false` to skip the extension entirely without removing it from the config:

```json
"purpose_gate": {
  "enabled": false
}
```

> **Requires a pi reload to take effect.** Edit the value, then run `/reload` (or restart pi). Changes while pi is running are ignored until reload.

Omitting the key, or any read/parse error, defaults to `true` (gate enabled).

Aligns with Holocron's *"Plan means stop"* and session naming principles.

---

### cross-agent

| Field | Value |
|-------|-------|
| **File** | `pi/extensions/cross-agent.ts` |
| **Source** | https://github.com/disler/pi-vs-claude-code/blob/main/extensions/cross-agent.ts |
| **License** | (see source repo) |
| **Lifted** | 2026-05-01 |

**What it does:** Scans `.claude/`, `.gemini/`, `.codex/` directories (both project-local and `~/` global) for:
- `commands/*.md` → registered as `/name` slash commands
- `skills/` → registered as `/skill:name` commands
- `agents/*.md` → listed as `@name` references

Makes other agents' commands and skills available in pi without manual re-registration. Useful for bridging Claude slash commands into pi sessions.

---

### themeMap (shared dependency)

| Field | Value |
|-------|-------|
| **File** | `pi/extensions/themeMap.ts` |
| **Source** | https://github.com/disler/pi-vs-claude-code/blob/main/extensions/themeMap.ts |
| **License** | (see source repo) |
| **Lifted** | 2026-05-01 |

**What it does:** Shared utility required by all five lifted extensions. Exports `applyExtensionDefaults(import.meta.url, ctx)` which applies a default theme per extension and sets the terminal title. Not a standalone extension — must be co-located with any of the above files.

**Theme ownership (auto-link mode):** When pi is launched with `-e` flags, the first `-e` extension owns the theme and all others skip `setTheme`. When extensions are auto-linked by `install.sh` (no `-e` flags), every extension calls `setTheme` on `session_start` — **the last one to fire wins** and the result is load-order-dependent. If you use auto-linked extensions and want a stable, predictable theme, set `defaultTheme` in `pi/settings.json` (the extension theme map is then overridden by the user config).

---

---

## Agent Pipelines

Custom agent files and chain pipelines stored in `pi/agents/`. Install by copying to `~/.pi/agent/agents/`.

> **Activated automatically** by `install.sh` via `merge_link_agents`, which symlinks all `.md` and `.chain.md` files from `pi/agents/` into `~/.pi/agent/agents/`. No manual copying required.

---

### Algorithm Pipeline

Runs the full 8-phase Holocron Algorithm as a subagent chain. Pass your task and the chain handles everything: PRD creation, ISC criteria, planning, building, executing, verification, learning, and a final session summary.

**How to run:**
```text
/run-chain algorithm -- your task description here
```
Each agent auto-discovers the active PRD from `$HOLOCRON_MEMORY_DIR` via the `PRD_PATH` written by the OBSERVE agent.

| File | Phase | Role |
|------|-------|------|
| `algorithm-observe.md` | OBSERVE (1/8) | Creates PRD, reverse-engineers request, generates atomic ISC criteria (with Splitting Test + ISC count gate), selects capabilities |
| `algorithm-think.md` | THINK (2/8) | Reads PRD, applies Splitting Test to all ISC, runs premortem + risk analysis, flags compound criteria |
| `algorithm-plan.md` | PLAN (3/8) | Reads PRD + think output, addresses prerequisites, produces dependency-ordered implementation plan |
| `algorithm-build.md` | BUILD (4/8) | Invokes every capability selected in OBSERVE — research APIs, codebase analysis, thinking. No phantom invocations. |
| `algorithm-execute.md` | EXECUTE (5/8) | Reads PRD + plan, implements the work, reports which ISC criteria were satisfied with evidence |
| `algorithm-verify.md` | VERIFY (6/8) | Independently tests each ISC criterion (does not trust executor's claims), produces PASS/FAIL table + Confidence Check |
| `algorithm-learn.md` | LEARN (7/8) | Produces learning reflections, writes JSONL to `LEARNING/REFLECTIONS/`, marks PRD phase complete |
| `algorithm.chain.md` | Full chain | Wires all 7 phases in sequence. The main session synthesizes results automatically via `slash-synthesis.ts`. |

**PRD discovery:** OBSERVE creates the PRD and writes `PRD_PATH=<absolute-path>` as the first line of `observe-output.md`. Every downstream agent reads that line to locate the PRD — no path argument needed at any step.

**Context passing:** Each step writes an output file (`think-output.md`, `plan-output.md`, `execute-output.md`) that the next step reads via `reads:` frontmatter in the chain directory.

---

### Research Pipeline

Multi-model parallel research. Checks `PERPLEXITY_API_KEY`, `GEMINI_API_KEY`, and `OPENAI_API_KEY` at runtime. Runs all available models simultaneously via bash background jobs. Skips any whose key is missing — no errors, just a SKIPPED note in the output.

**How to run:**
```text
/run-chain research -- what are the tradeoffs of edge computing vs centralised cloud for IoT
```

| File | Role |
|------|------|
| `perplexity-researcher.md` | Calls Perplexity Sonar API. Checks `PERPLEXITY_API_KEY`. Produces citation-backed web findings. |
| `gemini-researcher.md` | Calls Gemini 2.0 Flash API. Checks `GEMINI_API_KEY`. Multi-perspective coverage, cross-domain synthesis. |
| `openai-researcher.md` | Calls GPT-4o API. Checks `OPENAI_API_KEY`. Technical depth, tradeoffs, second-order effects. |
| `research-orchestrator.md` | Dispatches all three in parallel via bash `&` + `wait`. Synthesizes available results into a unified brief. Gracefully notes any skipped sources. |
| `research.chain.md` | Single-step chain: runs the orchestrator. Result: `research.md`. |

**Key design:** Parallelism happens inside `research-orchestrator` via bash background jobs — not as separate chain steps — because the `.chain.md` format is sequential. Each researcher still exists as a standalone agent for individual use (`/run perplexity-researcher "query"`).

---

## npm Packages

---

## Settings Template

`pi/settings.json` is a template committed to the repo and symlinked to `~/.pi/agent/settings.json` by `install.sh`. If a private `pi-settings.json` exists in `$HOLOCRON_MEMORY_DIR`, that takes precedence.

> **Model string note:** `defaultModel` is pinned to a snapshot model string (e.g. `claude-sonnet-4-6`). Anthropic deprecates snapshot models periodically. When a model is deprecated, pi will fail silently or with a provider error at startup. Update this value whenever a newer snapshot is available, or switch to a stable alias if the pi provider supports it.

---

## Installed

### pi-subagents

| Field | Value |
|-------|-------|
| **Package** | `pi-subagents` |
| **Author** | Nico Bailon (`nicopreme`) |
| **Version** | 0.21.3 |
| **License** | MIT |
| **Install command** | `pi install npm:pi-subagents` |
| **Gallery** | https://pi.dev/packages/pi-subagents |
| **npm** | https://www.npmjs.com/package/pi-subagents |
| **GitHub** | https://github.com/nicobailon/pi-subagents |
| **Installed** | 2026-05-01 |

**What it does:** Adds a `subagent` tool that Pi can call to delegate tasks to focused child Pi sessions. Supports sequential chains, parallel execution, foreground streaming, and background async jobs. Ships with 8 built-in agents: `scout`, `researcher`, `planner`, `worker`, `reviewer`, `context-builder`, `oracle`, `delegate`.

**Usage:**
```text
Use reviewer to review this diff.
Run parallel reviewers: one for correctness, one for tests, one for complexity.
Use scout to understand this code then ask me clarification questions.
/subagents-status
/subagents-doctor
```
