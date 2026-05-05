---
description: Run the Holocron Algorithm — OBSERVE inline, then dispatch specialist subagents for each phase (with optional parallelism for independent workstreams)
---
<!--
  OBSERVE runs inline in the main session.
  All subsequent phases (THINK → PLAN → BUILD → EXECUTE → VERIFY → LEARN)
  are dispatched as subagents via the `subagent` tool.

  The main session synthesizes results automatically via slash-synthesis.ts.
  Use this command from any AI coding agent (pi, Claude Code, etc.).
-->

## The Algorithm 3.8.0 (Dynamic Orchestration)

Core: transition from CURRENT STATE to IDEAL STATE using verifiable criteria (ISC). Goal: **Euphoric Surprise** — 9-10 ratings.

### Effort Levels

| Tier | Budget | ISC Range | Min Capabilities | When |
|------|--------|-----------|-----------------|------|
| **Standard** | <2min | 8-16 | 1-2 | Normal request (DEFAULT) |
| **Extended** | <8min | 16-32 | 3-5 | Quality must be extraordinary |
| **Advanced** | <16min | 24-48 | 4-7 | Substantial multi-file work |
| **Deep** | <32min | 40-80 | 6-10 | Complex design |
| **Comprehensive** | <120min | 64-150 | 8-15 | No time pressure |

**Min Capabilities** = minimum number of distinct capabilities to **actually invoke**. Listing without acting is a **CRITICAL FAILURE**.

### Voice

```bash
bash ~/.pi/agent/scripts/voice.sh "MESSAGE"
```
**Algorithm entry:** `"Entering the Algorithm"` — before OBSERVE.
**Phase transitions (inline phases only):** `"Entering the PHASE_NAME phase."` — first action at each inline phase.
**Subagent phases:** voice is suppressed inside subagents automatically.

### PRD as System of Record

PRD.md lives at `$HOLOCRON_MEMORY_DIR/WORK/{slug}/PRD.md`. It is the shared context — every subagent reads and writes to it. The main agent creates it in OBSERVE and owns the path.

- Frontmatter: `task`, `slug`, `effort`, `phase`, `progress`, `mode`, `started`, `updated`
- Body: `## Context`, `## Criteria` (ISC checkboxes), `## Decisions`, `## Verification`
- Criteria: `- [ ] ISC-1: text` (unchecked) / `- [x] ISC-1: text` (done)
- Progress: `progress: 3/8` — updated as criteria are satisfied

### ISC Decomposition (Splitting Test)

Every criterion = one atomic verifiable thing. Apply before finalizing:

1. **"And" test** — contains "and" joining two verifiable things → split
2. **Independent failure test** — can A pass while B fails? → two criteria
3. **Scope word test** — "all", "every", "complete" → enumerate what "all" means
4. **Domain boundary test** — crosses UI/API/data/logic → one criterion per boundary

---

━━━ 👁️ OBSERVE ━━━ (inline — main agent)

**Voice:** `bash ~/.pi/agent/scripts/voice.sh "Entering the Algorithm"`

**Console output (MANDATORY):**
```
♻︎ Entering the ALGORITHM… (v3.8.0) ═════════════
🗒️ TASK: [8 word description]
```

**PRD stub (MANDATORY):** Evaluate `$HOLOCRON_MEMORY_DIR` absolutely first, then:
```bash
WORK_DIR=$(echo $HOLOCRON_MEMORY_DIR)/WORK/YYYYMMDD-HHMMSS_kebab-slug
mkdir -p "$WORK_DIR"
# Write PRD.md with frontmatter only (effort/phase/progress to be filled next)
```

**OBSERVE work:**

- REQUEST REVERSE ENGINEERING: explicit wants, implied wants, explicit not-wanted, implied not-wanted

OUTPUT:
```
🔎 REVERSE ENGINEERING:
 🔎 [Explicit wants — multiple, granular, one per line]
 🔎 [Explicit not-wanted]
 🔎 [Implied not-wanted]
 🔎 [Desired speed — factor in EFFORT LEVEL]
```

- EFFORT LEVEL:

OUTPUT:
```
💪🏼 EFFORT LEVEL: [TIER] | [8 word reasoning]
```

- ISC CRITERIA GENERATION — write into PRD:
  - Set `effort`, add `## Context`, `## Criteria`, `## Decisions`, `## Verification`
  - Add criteria as checkboxes. Apply the Splitting Test to every criterion.
  - Set `progress: 0/N`

OUTPUT: `[Show ISC criteria list]`

**ISC COUNT GATE (MANDATORY):**

| Tier | Floor | Action if below |
|------|-------|-----------------|
| Standard | 8 | Decompose further |
| Extended | 16 | Almost certainly compound criteria |
| Advanced | 24 | Decompose by domain boundaries |
| Deep | 40 | Full decomposition + edge cases |
| Comprehensive | 64 | Every sub-requirement gets its own ISC |

If ISC count < floor: **DO NOT proceed.** Decompose and recount.

- CAPABILITY SELECTION:

| Capability | When | How to Invoke |
|------------|------|---------------|
| **algorithm-think** | Always | subagent tool |
| **algorithm-plan** | Standard+ effort, multi-step changes | subagent tool |
| **algorithm-build** | Preparation / context gathering | subagent tool (parallel if workstreams) |
| **algorithm-execute** | File edits, implementation | subagent tool (parallel if workstreams) |
| **algorithm-verify** | Standard+ effort | subagent tool |
| **algorithm-learn** | Always | subagent tool (last) |
| **research-orchestrator** | Multi-source research | subagent tool |
| **Skills** | Domain workflows | Read SKILL.md first |

OUTPUT:
```
🏹 CAPABILITIES SELECTED:
 🏹 [capability] — [phase] — [8-word reason]

🏹 CAPABILITY RATIONALE: [12-24 words]
```

- Execute any OBSERVE-phase capabilities now. Update ISC if findings require it.

---

━━━ 🎯 ORCHESTRATION PLAN ━━━ (inline — main agent)

After OBSERVE, output your dispatch plan before calling any subagents.

**Route selection:**

| Route | Phases | Use when |
|-------|--------|----------|
| **CREATIVE** | Think → Build | Pure generation (text, prompts, docs) — no verification needed |
| **STANDARD** | Think → Plan → Execute → Verify | Single focused change, ≤3 files |
| **FULL** | Think → Plan → Build → Execute → Verify | Multi-file implementation, Standard+ |
| **CUSTOM** | Any subset + parallelism | Task explicitly demands it |

All routes end with **LEARN** (always last).

**Workstream analysis:**

A workstream is a chunk of work that is **fully independent** of another — different files, different domains, no shared edit conflict. If the task has ≥2 independent workstreams, dispatch parallel subagents for BUILD and/or EXECUTE.

Examples of parallel workstreams:
- Code changes to `src/` + prompt engineering in `agents/` → parallel `algorithm-build` agents
- Backend API changes + frontend UI changes → parallel `algorithm-execute` agents
- Research subtask A + research subtask B → parallel researcher agents

OUTPUT:
```
🎯 ORCHESTRATION PLAN:
  Route: [ROUTE] — [8 word rationale]
  Workstreams: [1 — single | N — describe each]
  Dispatch sequence:
    1. [agent(s)] [parallel? Y/N] — [task summary]
    2. [agent(s)] ...
    ...
    N. algorithm-learn — reflection + JSONL
```

---

━━━ 🚀 DISPATCH ━━━ (inline — main agent calls subagents)

Call subagents via the `subagent` tool. **Do not execute THINK, PLAN, BUILD, EXECUTE, VERIFY, or LEARN phases inline.**

**PRD_PATH propagation:** The subagents auto-discover the active PRD via `$HOLOCRON_MEMORY_DIR/WORK/` (most recently modified). Since OBSERVE just created it, they will find it. No explicit passing needed.

**Sequential phases** — one at a time, await each before calling the next:
```
subagent(agent: "algorithm-think")
# await result
subagent(agent: "algorithm-plan")
# await result
```

**Parallel workstreams** — call multiple subagents IN THE SAME MESSAGE for concurrent execution:
```
# Both fire simultaneously — do this when workstreams are independent
subagent(agent: "algorithm-build", task: "Workstream A: [description]")
subagent(agent: "algorithm-build", task: "Workstream B: [description]")
# await both results before proceeding
```

**Workstream task format** — when splitting BUILD/EXECUTE across multiple agents, prefix each task with the workstream scope:
```
"Workstream A (src/api/): implement new endpoint handler"
"Workstream B (agents/): update algorithm-observe.md with new capability"
```

**Standard dispatch sequence:**
1. `algorithm-think` (sequential)
2. `algorithm-plan` (sequential, skip for CREATIVE route)
3. `algorithm-build` × N (parallel if N > 1, skip for STANDARD/CREATIVE)
4. `algorithm-execute` × N (parallel if N > 1)
5. `algorithm-verify` (sequential, skip for CREATIVE route)
6. `algorithm-learn` (always last, sequential)

After all subagents complete, the main session synthesizes via `slash-synthesis.ts` automatically.

---

### Phase Agent Reference

Brief summary of what each subagent does (for task composition):

| Agent | Role | Reads | Writes |
|-------|------|-------|--------|
| `algorithm-think` | Premortem, ISC refinement, risk analysis | PRD | PRD (risks section) |
| `algorithm-plan` | Prerequisites, dependency-ordered plan | PRD | PRD (plan section) |
| `algorithm-build` | Invoke capabilities, gather context, prep work | PRD | PRD (decisions), any prep files |
| `algorithm-execute` | File edits, implementation, mark ISC done | PRD, plan | PRD (criteria ✓, progress) |
| `algorithm-verify` | Independent test of each ISC criterion | PRD | PRD (verification section) |
| `algorithm-learn` | Reflection, JSONL write, mark PRD complete | PRD | PRD (`phase: complete`), REFLECTIONS JSONL |

---

### Critical Rules (Zero Exceptions)

- **OBSERVE is inline, everything else is a subagent** — Do not execute THINK through LEARN in the main session.
- **No phantom capabilities** — every selected capability MUST be invoked.
- **PRD is shared state** — all subagents read/write the same PRD. Never write session files to the current project directory.
- **Parallel = same message** — to run two subagents concurrently, call both in the same response turn.
- **Sequential = await** — call, await the result, then call the next. Do not fire VERIFY before EXECUTE completes.
- **LEARN is always last** — never skip it; it captures the reflection JSONL.
- **ISC Count Gate is mandatory** — cannot exit OBSERVE below tier floor.
- **Atomic criteria only** — every criterion must pass the Splitting Test.

### Context Recovery

If you don't know the current phase or criteria status:
1. Read the most recent PRD: `ls -t $HOLOCRON_MEMORY_DIR/WORK/*/PRD.md | head -1`
2. PRD frontmatter has phase, progress, effort, task, slug, started, updated
3. PRD body has criteria checkboxes, decisions, verification evidence
