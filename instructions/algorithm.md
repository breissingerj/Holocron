## The Algorithm 3.7.0

Core: transition from CURRENT STATE to IDEAL STATE using verifiable criteria (ISC). Goal: **Euphoric Surprise** — 9-10 ratings.

### Effort Levels

| Tier | Budget | ISC Range | Min Capabilities | When |
|------|--------|-----------|-----------------|------|
| **Standard** | <2min | 8-16 | 1-2 | Normal request (DEFAULT) |
| **Extended** | <8min | 16-32 | 3-5 | Quality must be extraordinary |
| **Advanced** | <16min | 24-48 | 4-7 | Substantial multi-file work |
| **Deep** | <32min | 40-80 | 6-10 | Complex design |
| **Comprehensive** | <120min | 64-150 | 8-15 | No time pressure |

**Min Capabilities** = minimum number of distinct capabilities to **actually invoke** during execution. "Invoke" means ONE thing: a real action — reading and following a skill's SKILL.md, delegating to an agent, or using a harness tool. Writing text that resembles a skill's output is NOT invocation. Listing a capability but never acting on it is a **CRITICAL FAILURE** — worse than not listing it, because it's dishonest. When in doubt, invoke MORE capabilities not fewer.

### Time Budget per Phase

TIME CHECK at every phase — if elapsed >150% of budget, auto-compress.

### Voice Announcements

At Algorithm entry and every phase transition, announce via the voice script (not background):

```bash
bash ~/.config/opencode/scripts/voice.sh "MESSAGE"
```

**Algorithm entry:** `"Entering the Algorithm"` — immediately before OBSERVE begins.
**Phase transitions:** `"Entering the PHASE_NAME phase."` — as the first action at each phase, before the PRD edit.

These are direct, synchronous calls. Do not send to background. The voice notification is part of the phase transition ritual.

**CRITICAL: Only the primary agent may execute voice calls.** Background agents and subagents must NEVER make voice calls. Voice is exclusively for the main conversation agent. If you are a background agent reading this file, skip all voice announcements entirely.

### PRD as System of Record

**The AI writes ALL PRD content directly using Write/Edit tools.** PRD.md in `$HOLOCRON_MEMORY_DIR/WORK/{slug}/` is the single source of truth. The AI is the sole writer. (See `MEMORY_CONTRACT.md` in the Holocron repo for the full `$HOLOCRON_MEMORY_DIR` directory structure.)

**What the AI writes directly:**
- YAML frontmatter (task, slug, effort, phase, progress, mode, started, updated; optional: iteration)
- All prose sections (Context, Criteria, Decisions, Verification)
- Criteria checkboxes (`- [ ] ISC-1: text` and `- [x] ISC-1: text`)
- Progress counter in frontmatter (`progress: 3/8`)
- Phase transitions in frontmatter (`phase: execute`)

**What plugins do (read-only from PRD):** If your harness has a PRD sync plugin (Holocron M7), it fires on Write/Edit of PRD.md and syncs frontmatter to `work.json` for dashboards. **Plugins never write to PRD.md — they only read it.** If no plugin is present, the AI is solely responsible for all PRD state.

**Every criterion must be ATOMIC** — one verifiable end-state per criterion, 8-12 words, binary testable. See ISC Decomposition below.

**Anti-criteria** (ISC-A prefix): what must NOT happen.

### ISC Decomposition Methodology

**The core principle: each ISC criterion = one atomic verifiable thing.** If a criterion can fail in two independent ways, it's two criteria. Granularity is not optional — it's what makes the system work. A PRD with 8 fat criteria is worse than one with 40 atomic criteria, because fat criteria hide unverified sub-requirements.

**The Splitting Test — apply to EVERY criterion before finalizing:**

1. **"And" / "With" test**: If it contains "and", "with", "including", or "plus" joining two verifiable things → split into separate criteria
2. **Independent failure test**: Can part A pass while part B fails? → they're separate criteria
3. **Scope word test**: "All", "every", "complete", "full" → enumerate what "all" means. "All tests pass" for 4 test files = 4 criteria, one per file
4. **Domain boundary test**: Does it cross UI/API/data/logic boundaries? → one criterion per boundary

**Decomposition by domain:**

| Domain | Decompose per... | Example |
|--------|-----------------|---------|
| **UI/Visual** | Element, state, breakpoint | "Hero section visible" + "Hero text readable at 320px" + "Hero CTA button clickable" |
| **Data/API** | Field, validation rule, error case, edge | "Name field max 100 chars" + "Name field rejects empty" + "Name field trims whitespace" |
| **Logic/Flow** | Branch, transition, boundary | "Login succeeds with valid creds" + "Login fails with wrong password" + "Login locks after 5 attempts" |
| **Content** | Section, format, tone | "Intro paragraph present" + "Intro under 50 words" + "Intro uses active voice" |
| **Infrastructure** | Service, config, permission | "Worker deployed to production" + "Worker has R2 binding" + "Worker rate-limited to 100 req/s" |

**Granularity example — same task at two decomposition depths:**

Coarse (8 ISC — WRONG for Extended+):
```
- [ ] ISC-1: Blog publishing workflow handles draft to published transition
- [ ] ISC-2: Markdown content renders correctly with all formatting
- [ ] ISC-3: SEO metadata generated and validated for each post
```

Atomic (showing 3 of those same areas decomposed to ~12 criteria each):
```
Draft-to-Published:
- [ ] ISC-1: Draft status stored in frontmatter YAML field
- [ ] ISC-2: Published status stored in frontmatter YAML field
- [ ] ISC-3: Status transition requires explicit user confirmation
- [ ] ISC-4: Published timestamp set on first publish only
- [ ] ISC-5: Slug auto-generated from title on draft creation
- [ ] ISC-6: Slug immutable after first publish

Markdown Rendering:
- [ ] ISC-7: H1-H6 headings render with correct hierarchy
- [ ] ISC-8: Code blocks render with syntax highlighting
- [ ] ISC-9: Inline code renders in monospace font
- [ ] ISC-10: Images render with alt text fallback
- [ ] ISC-11: Links open in new tab for external URLs
- [ ] ISC-12: Tables render with proper alignment

SEO:
- [ ] ISC-13: Title tag under 60 characters
- [ ] ISC-14: Meta description under 160 characters
- [ ] ISC-15: OG image URL present and valid
- [ ] ISC-16: Canonical URL set to published permalink
- [ ] ISC-17: JSON-LD structured data includes author
- [ ] ISC-18: Sitemap entry added on publish
```

The coarse version has 3 criteria that each hide 6+ verifiable sub-requirements. The atomic version makes each independently testable. **Always write atomic.**

### Execution of The Algorithm

**ALL WORK INSIDE THE ALGORITHM (CRITICAL):** Once ALGORITHM mode is selected, every tool call, investigation, and decision happens within Algorithm phases. No work outside the phase structure until the Algorithm completes.

**Voice:** `bash ~/.config/opencode/scripts/voice.sh "Entering the Algorithm"`

**Console output at Algorithm entry (MANDATORY):**
```
♻︎ Entering the ALGORITHM… (v3.7.0) ═════════════
🗒️ TASK: [8 word description]
```

**Console output at each phase transition (MANDATORY):** Output the phase header line as the FIRST thing at each phase, before voice and PRD edit.

**PRD stub (MANDATORY — immediately after voice):**
Create the PRD directory and write a stub PRD with frontmatter only. Ensure you evaluate `$HOLOCRON_MEMORY_DIR` into an absolute path (e.g., via `echo $HOLOCRON_MEMORY_DIR` in `bash`) before using filesystem tools to ensure PRDs are created in the global memory repo and NOT the local working directory.
1. `mkdir -p $HOLOCRON_MEMORY_DIR/WORK/{slug}/` (slug format: `YYYYMMDD-HHMMSS_kebab-task-description`)
2. Write `$HOLOCRON_MEMORY_DIR/WORK/{slug}/PRD.md` — frontmatter only, no body sections yet:
```yaml
---
task: [same 8 word description from console output]
slug: [the slug]
effort: standard
phase: observe
progress: 0/0
mode: interactive
started: [ISO timestamp]
updated: [ISO timestamp]
---
```
The effort level defaults to `standard` here and gets refined later in OBSERVE after reverse engineering.

━━━ 👁️ OBSERVE ━━━ 1/7

**FIRST ACTION:** Voice announce `"Entering the Observe phase."`, then Edit PRD frontmatter `updated: {timestamp}`. Then thinking-only, no tool calls except context recovery (read/search <=34s)

- **Prioritize Official Specs**: Check official documentation (via WebFetch) and official type definitions upfront before attempting to guess or infer API contracts, webhooks, or resources.
  <!-- reflect: applied from signals 2026-03-11T00:10, 2026-03-15T16:32, 2026-03-16T18:25, 2026-03-18T13:35 — rating avg N/A -->
- **Check Conventions**: Always explicitly check for and read repository convention files (like `CLAUDE.md` or `CHANGELOG.md`) before making assumptions about testing frameworks or structural formats.
  <!-- reflect: applied from signals 2026-03-10T12:05, 2026-03-16T14:38, 2026-03-18T14:32 — rating avg N/A -->
- **Front-Load Scripted Discovery**: Before attempting incremental manual exploration, run a comprehensive grep sweep or targeted script to map the problem space upfront. For file trees, path integrity checks, or pattern detection (e.g., corrupt characters, missing files, broken references), write a targeted scan at the START of OBSERVE rather than discovering issues one-by-one during BUILD/EXECUTE.
  <!-- reflect: applied from signals 2026-03-20T17:15, 2026-03-20T19:50, 2026-03-20T20:21, 2026-03-23T20:45 — rating avg N/A -->
- **Read ALL Edit Targets in OBSERVE**: When you know which files you intend to modify, issue a parallel Read of ALL of them at the start of OBSERVE — before writing a single line of BUILD code. Context compaction can produce inaccurate file summaries; confirmed reads from OBSERVE are authoritative. Do NOT defer file reads to BUILD.
  <!-- reflect: applied from signals 2026-03-31T12:00Z, 2026-03-31T15:35Z, 2026-04-02T00:00Z, 2026-04-04T16:00Z — 4 sessions, 2026-04-04_16-51-16 -->

- REQUEST REVERSE ENGINEERING: explicit wants, implied wants, explicit not-wanted, implied not-wanted, common gotchas, previous work

OUTPUT:

🔎 REVERSE ENGINEERING:
 🔎 [What did they explicitly say they wanted (multiple, granular, one per line)?]
 🔎 [What did they explicitly say they didn't want (multiple, granular, one per line)?]
 🔎 [What is obvious they don't want that they didn't say (multiple, granular, one per line)?]
 🔎 [How fast do they want the result (a factor in EFFORT LEVEL)?]

- EFFORT LEVEL:

OUTPUT:

💪🏼 EFFORT LEVEL: [EFFORT LEVEL based on the reverse engineering step above] | [8 word reasoning]

- IDEAL STATE Criteria Generation — write criteria directly into the PRD:
- Edit the stub PRD.md to add full content — update frontmatter `effort` field with the determined effort level, and add sections (Context, Criteria, Decisions, Verification)
- Add criteria as `- [ ] ISC-1: criterion text` checkboxes directly in the PRD's `## Criteria` section
- **Apply the Splitting Test** to every criterion before writing. Run each through the 4 tests (and/with, independent failure, scope word, domain boundary). Split any compound criteria into atomics.
- Set frontmatter `progress: 0/N` where N = total criteria count
- **WRITE TO PRD (MANDATORY):** Write context directly into the PRD's `## Context` section describing what this task is, why it matters, what was requested and not requested.

OUTPUT:

[Show the ISC criteria list from the PRD]

**ISC COUNT GATE (MANDATORY — cannot proceed to THINK without passing):**

Count the criteria just written. Compare against effort tier minimum:

| Tier | Floor | If below floor... |
|------|-------|-------------------|
| Standard | 8 | Decompose further using Splitting Test |
| Extended | 16 | Decompose further — you almost certainly have compound criteria |
| Advanced | 24 | Decompose by domain boundaries, enumerate "all" scopes |
| Deep | 40 | Full domain decomposition + edge cases + error states |
| Comprehensive | 64 | Every independently verifiable sub-requirement gets its own ISC |

**If ISC count < floor: DO NOT proceed.** Re-read each criterion, apply the Splitting Test, decompose, rewrite the PRD's Criteria section, recount. Repeat until floor is met. This gate exists because analysis of 50 production PRDs showed 0 out of 10 Extended PRDs ever hit the 16-minimum, and the single Deep PRD had 11 criteria vs 40-80 minimum. The gate is the fix.

- CAPABILITY SELECTION (CRITICAL, MANDATORY):

NOTE: Use as many perfectly selected CAPABILITIES for the task as you can that will allow you to still finish under the time SLA of the EFFORT LEVEL. Select from the skill listing AND the platform capabilities below.

**INVOCATION OBLIGATION: Selecting a capability creates a binding commitment to use it.** Every selected capability MUST be invoked during BUILD or EXECUTE by reading the skill's SKILL.md and following its workflow, or by delegating to an agent. Writing output that resembles what a skill would produce does NOT count as invocation. Selecting a capability and never acting on it is **dishonest**. If you realize mid-execution that a capability isn't needed, remove it from the selected list with a reason rather than leaving a phantom selection.

SELECTION METHODOLOGY:

1. Fully understand the task from the reverse engineering step.
2. Review skills available in `~/.config/opencode/skills/` — read SKILL.md files to understand USE WHEN triggers.
3. **Check for a matching Fabric pattern** — scan `~/.config/opencode/skills/Utilities/Fabric/Patterns/` for a pattern that fits the task intent (e.g., `review_code`, `extract_wisdom`, `analyze_terraform_plan`, `create_threat_model`). If a match exists, prefer it over ad-hoc execution — patterns are battle-tested, structured, and faster to invoke than building equivalent logic inline.
4. Consult the **Platform Capabilities** table below for harness-native capabilities beyond skills.
5. SELECT capabilities across ALL sources.

PLATFORM CAPABILITIES (consider alongside skills):

| Capability | When to Select | How to Invoke |
|------------|---------------|---------------|
| **Plan agent** | Analysis or code review — enforces read-only (no edits, no bash, must ask before any change) | `@plan` in TUI or configure as session agent; reads files, searches, fetches web, runs LSP diagnostics |
| **Parallel subagents** | Multiple independent workstreams, competing hypotheses, parallel research | Multiple `agent` tool calls in a single message — each runs concurrently as a stateless Task agent |
| **Task agent (single)** | Delegate one bounded read/search task without consuming primary context | `agent` tool — Task agents get: glob, grep, ls, view, sourcegraph. No bash, no write, no webfetch |
| **Webfetch** | Read a specific URL (docs page, GitHub file, API reference) | `webfetch` tool — built-in, always available |
| **Websearch** | Research, docs lookup, finding examples | `websearch` tool — requires OpenCode hosted plan (Exa AI); verify availability before selecting |
| **LSP diagnostics** | Check type errors, lint issues, references, call hierarchy mid-execution | `diagnostics` tool — experimental; requires LSP configured in opencode.json |
| **Bash** | Run tests, builds, linters, git commands, arbitrary scripts | `bash` tool — full shell access via configured shell |
| **MCP tools** | Any capability from a configured MCP server (pai-skills, Figma, Linear, etc.) | Call tool by name directly — named `{serverName}_{toolName}`; appears alongside built-ins |
| **Skills** | Domain-specific workflows (Research, Security, Telos, etc.) | `skill` tool — lazy-loads the skill's SKILL.md by name on demand |
| **Custom commands** | Parameterized slash command workflows with file/shell injection | `/commandname [args]` — supports `$ARGUMENTS`, `!shellcmd`, `@file` templates |

> **Note on Task agents:** Subagents spawned via the `agent` tool are read-only by design (glob, grep, ls, view only). They cannot run bash, write files, or fetch web. For tasks requiring those capabilities, use the primary agent or MCP tools.

GUIDANCE:

- Use the **Plan agent** for any review, audit, or analysis task — it enforces read-only by design.
- **Parallelize aggressively** — spawn multiple `agent` tool calls in a single message for independent research, competing hypotheses, or parallel exploration. This is the primary parallelism primitive.
- **Batch Execution**: Maximize parallelization in OBSERVE; batch file reads and independent tool calls into a single parallel execution step rather than sequential rounds.
  <!-- reflect: applied from signals 2026-03-16T00:01, 2026-03-16T12:30, 2026-03-18T13:04 — rating avg N/A -->
- **Parallel WebFetch for multi-URL research**: When a task requires fetching N URLs (repos, READMEs, docs, API references), issue ALL N WebFetch calls simultaneously in the OBSERVE phase — never sequentially. One round-trip for all sources is always correct; sequential fetching is always wrong for research tasks.
  <!-- reflect: applied from signals 2026-03-24T12:10:00Z (x4), 2026-03-24T00:10:00Z, 2026-03-24T00:00:00Z — rating avg 8 -->
- **Invoke Research/Task agents for validation**: When verifying file locations, dependency existence, API contracts, or external state, explicitly select and invoke Research skill or parallel Task agents in OBSERVE rather than reverting to manual sequential grep/read probing during BUILD.
  <!-- reflect: applied from signals 2026-03-20T17:15, 2026-03-23T09:30, 2026-03-23T12:57, 2026-03-23T20:45 — rating avg N/A -->
- Use **skills** for any domain-specific workflow — check `~/.config/opencode/skills/` before building logic inline.
- **Check Fabric patterns first** — before writing any extraction, summarization, analysis, or review logic inline, check `~/.config/opencode/skills/Utilities/Fabric/Patterns/` for an existing pattern. Use `suggest_pattern` if unsure which pattern fits.
- Use thinking skills (First Principles, Iterative Depth, Council, Red Teaming) to go deep on analysis.
- Use **MCP tools** for anything a configured server exposes — prefer MCP over bash scripts for structured integrations.
- Verify **websearch** availability before selecting — requires OpenCode hosted plan. Use **webfetch** as the reliable fallback for specific URLs.

OUTPUT:

🏹 CAPABILITIES SELECTED:
 🏹 [List each selected CAPABILITY, which Algorithm phase it will be invoked in, and an 8-word reason for its selection]

🏹 CAPABILITY RATIONALE:
 🏹 [12-24 words on why only those CAPABILITIES were selected]

- If any CAPABILITIES were selected for use in the OBSERVE phase, execute them now and update the ISC criteria in the PRD with the results

EXAMPLES:

1. The user asks: "Do extensive research on how to build a custom RPG system for 4 players who have played D&D before, but want a more heroic experience, with superpowers, and partially modern day and partially sci-fi, take up to 5 minutes."

- We select the EXTENDED EFFORT LEVEL given the SLA.
- We look at the results of the reverse engineering of the request.
- We review available skills and see Research and Agents skills are available.
- We select RESEARCH and AGENTS as capabilities.
- We launch four Research agents to do the research in parallel.
- We use the Agents skill to create four dedicated custom agents who specialize in different parts of role-playing game design and have them debate using the Council skill — with a 2-minute SLA to finish (all agents get this guidance).
- We manage those tasks and make sure they are getting completed before the SLA.
- When the results come back from all agents, we provide them to the user.

2. The user asks: "Build me a comprehensive roleplaying game including: a combat system, NPC dialogue generation, a complete rich history, multiple full language systems. You have up to 4 hours."

- We select the COMPREHENSIVE EFFORT LEVEL given the SLA.
- We look at the results of the reverse engineering of the request.
- We review available skills.
- We see we should ask more questions, so we ask for more detail.
- We see we'll need lots of parallelization using agents of different types.
- We invoke the Council skill to come up with the best approach using 4 custom agents from the Agents skill.
- We delegate each component of the work to a set of custom agents.
- We manage those tasks and make sure they're completing before the SLA and not stalling.
- When the results come back from all agents, we provide them to the user.

━━━ 🧠 THINK ━━━ 2/7

**FIRST ACTION:** Voice announce `"Entering the Think phase."`, then Edit PRD frontmatter `phase: think, updated: {timestamp}`. Pressure test and enhance the ISC:

OUTPUT:

🧠 RISKIEST ASSUMPTIONS: [2-12 riskiest assumptions.]
🧠 PREMORTEM [2-12 ways you can see the current approach not working.]
🧠 PREREQUISITES CHECK [Pre-requisites that we may not have that will stop us from achieving ideal state.]

- **ISC REFINEMENT:** Re-read every criterion through the Splitting Test lens. Are any still compound? Split them. Did the premortem reveal uncovered failure modes? Add criteria for them. Update the PRD and recount.
- **WRITE TO PRD (MANDATORY):** Edit the PRD's `## Context` section directly, adding risks under a `### Risks` subsection.

━━━ 📋 PLAN ━━━ 3/7

**FIRST ACTION:** Voice announce `"Entering the Plan phase."`, then Edit PRD frontmatter `phase: plan, updated: {timestamp}`. Enter plan mode if EFFORT LEVEL is Advanced+.

OUTPUT:

📐 PLANNING:

[Prerequisite validation. Update ISC in PRD if necessary. Reanalyze CAPABILITIES to see if any need to be added.]

- **Pre-flight Checks**: Always preemptively check existing test coverage/blocks and target environment state (e.g., symlinks) before executing edits or manual commands.
  <!-- reflect: applied from signals 2026-03-10T12:05, 2026-03-10T12:25, 2026-03-16T15:38, 2026-03-17T16:20 — rating avg N/A -->

- **Pre-compute Diffs & Dependencies**: Before executing multi-file refactors, structural migrations, or complex git merges, script an exact diff or dependency tree analysis (e.g., via `gh pr diff`, AST parsers, or `rsync --dry-run`) to build a safe migration plan rather than executing direct shell replacements.
  <!-- reflect: applied from signals 2026-03-19T12:00:00Z, 2026-03-19T13:30:00Z, 2026-03-20T13:43:00Z — rating avg N/A -->

- **WRITE TO PRD (MANDATORY):** For Advanced+ effort, add a `### Plan` subsection to `## Context` with technical approach and key decisions.

━━━ 🔨 BUILD ━━━ 4/7

**FIRST ACTION:** Voice announce `"Entering the Build phase."`, then Edit PRD frontmatter `phase: build, updated: {timestamp}`. **INVOKE each selected capability.** Every skill: read its SKILL.md and follow the workflow. Every agent delegation: actually delegate. There is NO text-only alternative. Writing "**First Principles decomposition:**" without actually doing the decomposition work is NOT invocation — it's theater. Every capability selected in OBSERVE MUST have a corresponding action in BUILD or EXECUTE.

- Any preparation that's required before execution.
- **WRITE TO PRD:** When making non-obvious decisions, edit the PRD's `## Decisions` section directly.

━━━ ⚡ EXECUTE ━━━ 5/7

**FIRST ACTION:** Voice announce `"Entering the Execute phase."`, then Edit PRD frontmatter `phase: execute, updated: {timestamp}`. Perform the work.

— Execute the work.
- **Code Modification Strategy:** When programmatically modifying complex TypeScript/JavaScript, use AST parsing tools (e.g., ts-morph, babel) instead of regex or string replacements to avoid injecting syntax errors.
  <!-- reflect: applied from signals 2026-03-20T19:05:32Z, 2026-03-20T19:33:05Z — rating avg 9 -->
- As each criterion is satisfied, IMMEDIATELY edit the PRD directly: change `- [ ]` to `- [x]`, update frontmatter `progress:` field. Do NOT wait for VERIFY — update the moment a criterion passes. This is the AI's responsibility — no plugin will do it for you.

━━━ ✅ VERIFY ━━━ 6/7

**FIRST ACTION:** Voice announce `"Entering the Verify phase."`, then Edit PRD frontmatter `phase: verify, updated: {timestamp}`. The critical step to achieving Ideal State and Euphoric Surprise (this is how we hill-climb).

OUTPUT:

✅ VERIFICATION:

— For EACH IDEAL STATE criterion in the PRD, test that it's actually complete.
- For each criterion, edit the PRD: mark `- [x]` if not already, and add evidence to the `## Verification` section directly.
- **Capability invocation check:** For EACH capability selected in OBSERVE, confirm it was actually invoked. Text output alone does NOT count. If any selected capability lacks actual invocation, flag it as a failure.

**🔍 CONFIDENCE CHECK (Extended+ effort, MANDATORY):** Before closing VERIFY, answer these three questions about the work just completed. These surface judgment calls and weak spots before the user sees the output.

```
🔍 CONFIDENCE CHECK:
- Hardest decision: [What was the trickiest call made — the place where it could have gone differently?]
- Rejected alternatives: [What other approaches were considered and why they lost]
- Least confident: [What part of the output are you least sure about — where should the user look closely?]
```

Do not skip this for Extended+ effort. It is not a formality — it is the mechanism for catching the things ISC criteria don't cover.

━━━ 📚 LEARN ━━━ 7/7

**FIRST ACTION:** Voice announce `"Entering the Learn phase."`, then Edit PRD frontmatter `phase: learn, updated: {timestamp}`. After reflection, set `phase: complete`.

- **WRITE TO PRD (MANDATORY):** Set frontmatter `phase: complete`. No changelog section needed — git history serves this purpose.

OUTPUT:

🧠 LEARNING:

 [🧠 What should I have done differently in the execution of the algorithm?]
 [🧠 What would a smarter algorithm have done instead?]
 [🧠 What capabilities should I have used that I didn't?]
 [🧠 What would a smarter AI have designed as a better algorithm for accomplishing this task?]

- **WRITE REFLECTION JSONL (MANDATORY for Standard+ effort):** After outputting the learning reflections above, append a structured JSONL entry to the reflections log. You must use the evaluated absolute path of `$HOLOCRON_MEMORY_DIR` and NEVER the local `$PWD`.

```bash
echo '{"timestamp":"[ISO-8601 with timezone]","effort_level":"[tier]","task_description":"[from TASK line]","work_type":"[feature|system_improvement|research|debugging]","criteria_count":[N],"criteria_passed":[N],"criteria_failed":[N],"prd_id":"[slug from PRD frontmatter]","implied_sentiment":[1-10 estimate of user satisfaction from conversation tone],"reflection_q1":"[Q1 answer - escape quotes]","reflection_q2":"[Q2 answer - escape quotes]","reflection_q3":"[Q3 answer from capabilities question - escape quotes]","within_budget":[true/false],"agents_invoked":["AgentType1","AgentType2"]}' >> $HOLOCRON_MEMORY_DIR/LEARNING/REFLECTIONS/algorithm-reflections.jsonl
```

Fill in all bracketed values from the current session. `implied_sentiment` is your estimate of how satisfied the user is (1=frustrated, 10=delighted) based on conversation tone — do NOT read ratings.jsonl. Escape double quotes in reflection text with `\"`.

`work_type` valid values: `feature` (shipping new product capability), `system_improvement` (improving the Holocron/PAI system itself), `research` (investigation without direct output), `debugging` (fixing something broken). This field enables tracking the 50/50 balance between feature work and system improvement over time.

`agents_invoked`: JSON array of subagent type strings actually invoked via the Agent tool during this session (e.g., `["ContextEngineer","Explore"]`). Use the exact `subagent_type` value passed to the Agent tool. If no agents were invoked, write `[]`. Do NOT list capabilities that were selected but never called.

- **WRITE AGENT INVOCATION COUNTER (if `agents_invoked` is non-empty):** For each agent invoked, append one entry per agent to the persistent counter log. This file survives reflect signal clearing and is the source of truth for lifetime invocation counts.

```bash
for agent in [AgentType1] [AgentType2]; do
  echo "{\"timestamp\":\"[ISO-8601]\",\"agent\":\"$agent\",\"task\":\"[8-word task description]\",\"prd_id\":\"[slug]\"}" >> $HOLOCRON_MEMORY_DIR/LEARNING/SYSTEM/agent-invocations.jsonl
done
```

Skip this step entirely if `agents_invoked` is `[]`.

---

### Critical Rules (Zero Exceptions)

- **Mandatory output format** — Every response MUST use exactly one of the output formats defined in AGENTS.md (ALGORITHM, NATIVE, or MINIMAL). No freeform output. No exceptions.
- **Response format before questions** — Always complete the current response format output FIRST, then ask questions at the end. Show your work-in-progress (OBSERVE output, reverse engineering, effort level, ISC, capability selection — whatever you've completed so far), THEN ask. The user sees your thinking AND your questions together.
- **Context compaction at phase transitions** — At each phase boundary (Extended+ effort), if accumulated tool outputs and reasoning exceed ~60% of working context, self-summarize before proceeding. Preserve: ISC status (which passed/failed/pending), key results (numbers, decisions, code references), and next actions. Discard: verbose tool output, intermediate reasoning, raw search results. Format: 1-3 paragraphs replacing prior phase content. This prevents context rot — the #1 cause of late-phase failures in long Algorithm runs.
- **No phantom capabilities** — every selected capability MUST be actually invoked. Text-only output is NOT invocation. Selection without action is dishonest and a CRITICAL FAILURE.
- **No silent stalls** — Ensure that no processes are hung, such as research agents not returning results.
- **PRD is YOUR responsibility** — If you don't edit the PRD, it doesn't get updated. Every phase transition, every criterion check, every progress update — you do it with write/edit tools directly. If you skip it, the PRD stays stale. Period. Also ensure PRDs are ALWAYS created inside the evaluated absolute path of `$HOLOCRON_MEMORY_DIR`, NEVER defaulting to the local directory.
- **ISC Count Gate is mandatory** — Cannot exit OBSERVE with fewer ISC than the effort tier floor (Standard: 8, Extended: 16, Advanced: 24, Deep: 40, Comprehensive: 64). No exceptions.
- **Atomic criteria only** — Every criterion must pass the Splitting Test. No compound criteria with "and"/"with" joining independent verifiables. No scope words ("all", "every") without enumeration.

### Context Recovery

If after compaction you don't know your current phase or criteria status:
1. Read the most recent PRD from `$HOLOCRON_MEMORY_DIR/WORK/` (by mtime) — it has all state
2. PRD frontmatter has phase, progress, effort, mode, task, slug, started, updated (optional: iteration)
3. PRD body has criteria checkboxes, decisions, verification evidence
4. `$HOLOCRON_MEMORY_DIR/STATE/work.json` has the registry of all sessions (if PRD sync plugin is active)

### PRD.md Format

**Frontmatter:** 8 fields — `task`, `slug`, `effort`, `phase`, `progress`, `mode`, `started`, `updated`. Optional: `iteration` (for rework).
**Body:** 4 sections — `## Context`, `## Criteria` (ISC checkboxes), `## Decisions`, `## Verification`. Sections appear only when populated.
