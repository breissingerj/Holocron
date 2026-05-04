---
description: Run the full 7-phase Holocron Algorithm (OBSERVE → THINK → PLAN → BUILD → EXECUTE → VERIFY → LEARN)
---
<!--
  This file is the INLINE / FALLBACK algorithm prompt used when the cross-agent extension
  surfaces it as a slash command from .claude/commands/. It runs in the current session.

  The CANONICAL pipeline is the pi-subagents chain at pi/agents/algorithm.chain.md,
  invoked via: /run-chain algorithm -- <task>
  That chain isolates each phase in its own subagent with structured output files.

  Use this file when you need a quick single-session run without the chain overhead,
  or when pi-subagents is unavailable.
-->

## The Algorithm 3.7.0 (Pi)

Core: transition from CURRENT STATE to IDEAL STATE using verifiable criteria (ISC). Goal: **Euphoric Surprise** — 9-10 ratings.

### Effort Levels

| Tier | Budget | ISC Range | Min Capabilities | When |
|------|--------|-----------|-----------------|------|
| **Standard** | <2min | 8-16 | 1-2 | Normal request (DEFAULT) |
| **Extended** | <8min | 16-32 | 3-5 | Quality must be extraordinary |
| **Advanced** | <16min | 24-48 | 4-7 | Substantial multi-file work |
| **Deep** | <32min | 40-80 | 6-10 | Complex design |
| **Comprehensive** | <120min | 64-150 | 8-15 | No time pressure |

**Min Capabilities** = minimum number of distinct capabilities to **actually invoke** during execution. "Invoke" means ONE thing: a real action — reading and following a skill's SKILL.md, delegating to a subagent, or using a tool. Writing text that resembles a skill's output is NOT invocation. Listing a capability but never acting on it is a **CRITICAL FAILURE** — worse than not listing it, because it's dishonest. When in doubt, invoke MORE capabilities not fewer.

### Time Budget per Phase

TIME CHECK at every phase — if elapsed >150% of budget, auto-compress.

### Voice Announcements

At Algorithm entry and every phase transition, announce via the voice script (not background):

```bash
bash ~/.pi/agent/scripts/voice.sh "MESSAGE"
```

**Algorithm entry:** `"Entering the Algorithm"` — immediately before OBSERVE begins.
**Phase transitions:** `"Entering the PHASE_NAME phase."` — as the first action at each phase, before the PRD edit.

These are direct, synchronous calls. Do not send to background.

**CRITICAL: Only the primary agent may execute voice calls.** Subagents must NEVER make voice calls. Voice is exclusively for the main conversation agent.

### PRD as System of Record

**The AI writes ALL PRD content directly using Write/Edit tools.** PRD.md in `$HOLOCRON_MEMORY_DIR/WORK/{slug}/` is the single source of truth.

**What the AI writes directly:**
- YAML frontmatter (task, slug, effort, phase, progress, mode, started, updated; optional: iteration)
- All prose sections (Context, Criteria, Decisions, Verification)
- Criteria checkboxes (`- [ ] ISC-1: text` and `- [x] ISC-1: text`)
- Progress counter in frontmatter (`progress: 3/8`)
- Phase transitions in frontmatter (`phase: execute`)

**Every criterion must be ATOMIC** — one verifiable end-state per criterion, 8-12 words, binary testable.

**Anti-criteria** (ISC-A prefix): what must NOT happen.

### ISC Decomposition Methodology

**The core principle: each ISC criterion = one atomic verifiable thing.** If a criterion can fail in two independent ways, it's two criteria.

**The Splitting Test — apply to EVERY criterion before finalizing:**

1. **"And" / "With" test**: If it contains "and", "with", "including", or "plus" joining two verifiable things → split
2. **Independent failure test**: Can part A pass while part B fails? → they're separate criteria
3. **Scope word test**: "All", "every", "complete", "full" → enumerate what "all" means
4. **Domain boundary test**: Does it cross UI/API/data/logic boundaries? → one criterion per boundary

### Execution of The Algorithm

**ALL WORK INSIDE THE ALGORITHM (CRITICAL):** Every tool call, investigation, and decision happens within Algorithm phases. No work outside the phase structure until the Algorithm completes.

**Voice:** `bash ~/.pi/agent/scripts/voice.sh "Entering the Algorithm"`

**Console output at Algorithm entry (MANDATORY):**
```
♻︎ Entering the ALGORITHM… (v3.7.0) ═════════════
🗒️ TASK: [8 word description]
```

**Console output at each phase transition (MANDATORY):** Output the phase header line as the FIRST thing at each phase, before voice and PRD edit.

**PRD stub (MANDATORY — immediately after voice):**
Evaluate `$HOLOCRON_MEMORY_DIR` to an absolute path first (`echo $HOLOCRON_MEMORY_DIR` in bash), then:
1. `mkdir -p $HOLOCRON_MEMORY_DIR/WORK/{slug}/` (slug: `YYYYMMDD-HHMMSS_kebab-task-description`)
2. Write `$HOLOCRON_MEMORY_DIR/WORK/{slug}/PRD.md` with frontmatter only:
```yaml
---
task: [8 word description]
slug: [the slug]
effort: standard
phase: observe
progress: 0/0
mode: interactive
started: [ISO timestamp]
updated: [ISO timestamp]
---
```

━━━ 👁️ OBSERVE ━━━ 1/7

**FIRST ACTION:** Voice announce `"Entering the Observe phase."`, then Edit PRD frontmatter `updated: {timestamp}`. Then thinking-only; tool calls only for context recovery (read/search ≤34s).

- **Prioritize Official Specs**: Check official docs (via fetch) and type definitions before guessing API contracts.
- **Check Conventions**: Read convention files (`AGENTS.md`, `CHANGELOG.md`) before assuming testing or structural formats.
- **Front-Load Scripted Discovery**: Run a comprehensive grep sweep or targeted script to map the problem space upfront.

- REQUEST REVERSE ENGINEERING: explicit wants, implied wants, explicit not-wanted, implied not-wanted, common gotchas, previous work

OUTPUT:

🔎 REVERSE ENGINEERING:
 🔎 [What did they explicitly say they wanted (multiple, granular, one per line)?]
 🔎 [What did they explicitly say they didn't want (multiple, granular, one per line)?]
 🔎 [What is obvious they don't want that they didn't say (multiple, granular, one per line)?]
 🔎 [How fast do they want the result (a factor in EFFORT LEVEL)?]

- EFFORT LEVEL:

OUTPUT:

💪🏼 EFFORT LEVEL: [EFFORT LEVEL] | [8 word reasoning]

- IDEAL STATE Criteria Generation — write directly into PRD:
  - Edit stub PRD.md to add full content: update `effort`, add sections (Context, Criteria, Decisions, Verification)
  - Add criteria as `- [ ] ISC-1: criterion text` checkboxes in `## Criteria`
  - **Apply the Splitting Test** to every criterion before writing
  - Set frontmatter `progress: 0/N` where N = total criteria count
  - **WRITE TO PRD (MANDATORY):** Write context into `## Context` describing what this task is and why it matters

OUTPUT:

[Show the ISC criteria list from the PRD]

**ISC COUNT GATE (MANDATORY):**

| Tier | Floor | If below floor... |
|------|-------|-------------------|
| Standard | 8 | Decompose further using Splitting Test |
| Extended | 16 | Decompose further — you almost certainly have compound criteria |
| Advanced | 24 | Decompose by domain boundaries, enumerate "all" scopes |
| Deep | 40 | Full domain decomposition + edge cases + error states |
| Comprehensive | 64 | Every independently verifiable sub-requirement gets its own ISC |

**If ISC count < floor: DO NOT proceed.** Re-read each criterion, apply the Splitting Test, decompose, rewrite, recount.

- CAPABILITY SELECTION (CRITICAL, MANDATORY):

Select from the skills listing AND the platform capabilities below. Use as many perfectly selected capabilities as you can while staying within the effort SLA.

**INVOCATION OBLIGATION: Selecting a capability creates a binding commitment to use it.** Every selected capability MUST be invoked during BUILD or EXECUTE. Selecting without acting is **dishonest**.

PLATFORM CAPABILITIES (consider alongside skills):

| Capability | When to Select | How to Invoke |
|------------|---------------|---------------|
| **research-orchestrator** | Multi-source research, competitive analysis, deep investigation | Subagent tool — delegates to gemini/openai/perplexity researchers in parallel |
| **gemini-researcher** | Single deep web research pass via Gemini | Subagent tool with agent: gemini-researcher |
| **openai-researcher** | Single deep web research pass via OpenAI | Subagent tool with agent: openai-researcher |
| **perplexity-researcher** | Real-time web search with citations | Subagent tool with agent: perplexity-researcher |
| **Bash** | Run tests, builds, linters, git commands, scripts | Bash tool — full shell access |
| **Read/Write/Edit** | File manipulation, code changes | Read/Write/Edit tools — always available |
| **Skills** | Domain-specific workflows (Research, Security, Thinking, Telos, etc.) | Read skill's SKILL.md first, then follow its workflow; skills at `~/.pi/agent/skills/` |
| **Subagent (parallel)** | Multiple independent workstreams, competing research hypotheses | Subagent tool called multiple times in one message — each runs concurrently |

- **Parallelize aggressively** — invoke multiple subagents in a single message for independent research or parallel exploration.
- **Use skills** for any domain-specific workflow — check `~/.pi/agent/skills/` before building logic inline.
- **Batch reads** — maximize parallelization in OBSERVE; batch independent file reads and tool calls together.

OUTPUT:

🏹 CAPABILITIES SELECTED:
 🏹 [List each selected CAPABILITY, which Algorithm phase it will be invoked in, and an 8-word reason]

🏹 CAPABILITY RATIONALE:
 🏹 [12-24 words on why only those CAPABILITIES were selected]

- If any CAPABILITIES were selected for OBSERVE, execute them now and update the ISC in the PRD with results

━━━ 🧠 THINK ━━━ 2/7

**FIRST ACTION:** Voice announce `"Entering the Think phase."`, then Edit PRD frontmatter `phase: think, updated: {timestamp}`. Pressure test and enhance the ISC:

OUTPUT:

🧠 RISKIEST ASSUMPTIONS: [2-12 riskiest assumptions.]
🧠 PREMORTEM: [2-12 ways the current approach could fail.]
🧠 PREREQUISITES CHECK: [Prerequisites that may be missing.]

- **ISC REFINEMENT:** Re-read every criterion through the Splitting Test. Are any still compound? Split them. Did the premortem reveal uncovered failure modes? Add criteria for them. Update the PRD.
- **WRITE TO PRD (MANDATORY):** Edit `## Context` directly, adding risks under a `### Risks` subsection.

━━━ 📋 PLAN ━━━ 3/7

**FIRST ACTION:** Voice announce `"Entering the Plan phase."`, then Edit PRD frontmatter `phase: plan, updated: {timestamp}`.

OUTPUT:

📐 PLANNING:

[Prerequisite validation. Update ISC in PRD if necessary. Reanalyze CAPABILITIES.]

- **Pre-flight Checks**: Check existing test coverage and target environment state before executing edits.
- **Pre-compute Diffs & Dependencies**: For multi-file refactors, script a dry-run diff or dependency tree before executing.
- **WRITE TO PRD (MANDATORY):** For Advanced+ effort, add a `### Plan` subsection to `## Context`.

━━━ 🔨 BUILD ━━━ 4/7

**FIRST ACTION:** Voice announce `"Entering the Build phase."`, then Edit PRD frontmatter `phase: build, updated: {timestamp}`. **INVOKE each selected capability.** Every skill: read its SKILL.md and follow the workflow. Every subagent delegation: actually delegate. There is NO text-only alternative.

- Any preparation required before execution.
- **WRITE TO PRD:** When making non-obvious decisions, edit `## Decisions` directly.

━━━ ⚡ EXECUTE ━━━ 5/7

**FIRST ACTION:** Voice announce `"Entering the Execute phase."`, then Edit PRD frontmatter `phase: execute, updated: {timestamp}`. Perform the work.

- Execute the work.
- **Code Modification Strategy:** For complex TypeScript/JavaScript, prefer AST-aware approaches over regex/string replacement.
- As each criterion is satisfied, IMMEDIATELY edit the PRD: change `- [ ]` to `- [x]`, update frontmatter `progress:`. Do NOT wait for VERIFY.

━━━ ✅ VERIFY ━━━ 6/7

**FIRST ACTION:** Voice announce `"Entering the Verify phase."`, then Edit PRD frontmatter `phase: verify, updated: {timestamp}`.

OUTPUT:

✅ VERIFICATION:

- For EACH ISC criterion, test that it's actually complete.
- For each criterion, edit PRD: mark `- [x]` if not already, add evidence to `## Verification`.
- **Capability invocation check:** For EACH capability selected in OBSERVE, confirm it was actually invoked. Text output alone does NOT count.

**🔍 CONFIDENCE CHECK (Extended+ effort, MANDATORY):**

```
🔍 CONFIDENCE CHECK:
- Hardest decision: [The trickiest call — where it could have gone differently]
- Rejected alternatives: [What was considered and why it lost]
- Least confident: [What part to look at most closely]
```

━━━ 📚 LEARN ━━━ 7/7

**FIRST ACTION:** Voice announce `"Entering the Learn phase."`, then Edit PRD frontmatter `phase: learn, updated: {timestamp}`. After reflection, set `phase: complete`.

OUTPUT:

🧠 LEARNING:

 [🧠 What should I have done differently in the execution of the algorithm?]
 [🧠 What would a smarter algorithm have done instead?]
 [🧠 What capabilities should I have used that I didn't?]
 [🧠 What would a smarter AI have designed as a better algorithm for this task?]

- **WRITE TO PRD (MANDATORY):** Set frontmatter `phase: complete`.

- **WRITE REFLECTION JSONL (MANDATORY for Standard+ effort):** Evaluate `$HOLOCRON_MEMORY_DIR` absolute path, then:

```bash
echo '{"timestamp":"[ISO-8601]","effort_level":"[tier]","task_description":"[from TASK line]","work_type":"[feature|system_improvement|research|debugging]","criteria_count":[N],"criteria_passed":[N],"criteria_failed":[N],"prd_id":"[slug]","implied_sentiment":[1-10],"agents_invoked":["agent names used"],"reflection_q1":"[Q1]","reflection_q2":"[Q2]","reflection_q3":"[Q3]","within_budget":[true/false]}' >> $HOLOCRON_MEMORY_DIR/LEARNING/REFLECTIONS/algorithm-reflections.jsonl
```

`work_type` valid values: `feature`, `system_improvement`, `research`, `debugging`.

---

### Critical Rules (Zero Exceptions)

- **Mandatory output format** — Every response MUST use exactly one of the output formats defined in AGENTS.md (ALGORITHM, NATIVE, or MINIMAL). No freeform output.
- **Response format before questions** — Always complete the current response format output FIRST, then ask questions at the end.
- **Context compaction at phase transitions** — At each phase boundary (Extended+ effort), if accumulated tool outputs exceed ~60% of working context, self-summarize before proceeding. Preserve: ISC status, key results, next actions. Discard: verbose tool output, intermediate reasoning.
- **No phantom capabilities** — every selected capability MUST be actually invoked.
- **PRD is YOUR responsibility** — If you don't edit the PRD, it doesn't get updated. Always use the evaluated absolute path of `$HOLOCRON_MEMORY_DIR`.
- **ISC Count Gate is mandatory** — Cannot exit OBSERVE below tier floor (Standard: 8, Extended: 16, Advanced: 24, Deep: 40, Comprehensive: 64).
- **Atomic criteria only** — every criterion must pass the Splitting Test.

### Context Recovery

If you don't know your current phase or criteria status:
1. Read the most recent PRD from `$HOLOCRON_MEMORY_DIR/WORK/` (by mtime)
2. PRD frontmatter has phase, progress, effort, mode, task, slug, started, updated
3. PRD body has criteria checkboxes, decisions, verification evidence

### PRD.md Format

**Frontmatter:** task, slug, effort, phase, progress, mode, started, updated (+ optional: iteration)
**Body:** `## Context`, `## Criteria` (ISC checkboxes), `## Decisions`, `## Verification`
