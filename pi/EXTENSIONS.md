# Pi Extensions

Tracking for all pi extensions — both npm-installed packages and lifted local extensions from third-party repos.
Update this file whenever an extension is added, removed, or sourced.

---

## Local Extensions (Lifted)

Sourced from [`disler/pi-vs-claude-code`](https://github.com/disler/pi-vs-claude-code/tree/main/extensions).
Files live in `pi/extensions/`. All five share a required dependency: `themeMap.ts` (also lifted, same source).

> **To activate:** Copy the desired `.ts` files from `pi/extensions/` into `~/.pi/agent/extensions/` alongside `themeMap.ts`.

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

**What it does:** Forces a purpose declaration via text input dialog on session start. Blocks all input until a non-empty purpose is entered. Displays the purpose in a persistent widget and injects it into the system prompt as a `<purpose>` block for the full session.

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

---

---

## Agent Pipelines

Custom agent files and chain pipelines stored in `pi/agents/`. Install by copying to `~/.pi/agent/agents/`.

> **To activate:** `cp pi/agents/*.md ~/.pi/agent/agents/` — or add `~/.pi/agent/agents/` to Holocron's install.sh symlink step.

---

### Algorithm Pipeline

Replaces the ALGORITHM mode inline execution with a subagent chain. The parent session handles **OBSERVE** (PRD creation, ISC gate, voice) and **LEARN** (JSONL reflection). The chain handles phases 2–5.

**How to run:**
```text
# After parent session completes OBSERVE and passes ISC gate:
/run-chain algorithm
```
No path argument needed. Each agent auto-discovers the active PRD from `$HOLOCRON_MEMORY_DIR`.

| File | Phase | Role |
|------|-------|------|
| `algorithm-think.md` | THINK (2/7) | Reads PRD, applies Splitting Test to all ISC, runs premortem + risk analysis, flags compound criteria |
| `algorithm-plan.md` | PLAN (3/7) | Reads PRD + think output, addresses prerequisites, produces dependency-ordered implementation plan |
| `algorithm-execute.md` | EXECUTE (5/7) | Reads PRD + plan, implements the work, reports which ISC criteria were satisfied with evidence |
| `algorithm-verify.md` | VERIFY (6/7) | Independently tests each ISC criterion (does not trust executor's claims), produces PASS/FAIL table + Confidence Check |
| `algorithm.chain.md` | Full chain | Wires THINK → PLAN → EXECUTE → VERIFY, passing PRD path and intermediate outputs between steps |

**PRD discovery:** Each agent runs a bash snippet at startup that checks `$HOLOCRON_MEMORY_DIR/STATE/work.json` first (M7 plugin, if active), then falls back to the most recent non-complete PRD by mtime in `$HOLOCRON_MEMORY_DIR/WORK/`. No path argument needed at any step.

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
