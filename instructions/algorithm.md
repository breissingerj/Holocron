## The Algorithm 4.0.0

Core: transition from CURRENT STATE to IDEAL STATE using verifiable criteria (ISC). Goal: **Euphoric Surprise** — 9-10 ratings.

### The Point

The whole point is euphoric surprise: Jack got exactly the output he wanted, in the right amount of time, for the right amount of spend. There is no effort tier to declare and no ISC count to predict — there is the desired outcome and your judgment about how to reach it. The rest of this file states what must be true when a run is done; how you get there, and how much you spend getting there, is yours to choose. Jack's explicit calls in plain language ("go heavy", "quick pass", a stated budget) outrank your judgment — always.

(How a run is *presented* — the output format — is a separate contract in AGENTS.md, kept and unaffected.)

### When to Run the Algorithm

Enter the Algorithm when done needs writing down: multi-step work, multiple files, non-trivial reasoning, anything where "finished" must be provable. Answer inline when a single command, a metadata-only update, a bounded read-only comparison, or a synthesis of loaded context is the whole task. No mode label is declared; the output format you use is the one that matches the response you are actually giving.

### A Run Is Complete When

1. **The stated goal survived.** Jack's explicit wants, implied wants, and explicit not-wants from reverse engineering are written in the PRD's Context, and every criterion traces to them.
2. **Done existed in writing before building.** A PRD at `$HOLOCRON_MEMORY_DIR/WORK/{slug}/PRD.md` with atomic ISC — each criterion one verifiable end state, each naming the probe that would falsify it.
3. **What must not happen is written down** — at least one anti-criterion (ISC-A).
4. **External prerequisites were probed before execution** — credentials, sessions, registry access, deploy targets. MISSING blocks or is ratified deferred in Decisions.
5. **Material ambiguity was resolved before building** — up to 3 targeted questions when the answer would change what gets built, or an inline flagged default when a reasoned default is safe.
6. **No criterion closed without probe evidence of the right modality**: file→Read, code→Grep, command→checked output, HTTP→`curl -i`, deploy→live probe, web/UI→real browser via playwright-cli, appearance→viewed pixels, schema→SELECT, config→read-back. Evidence must SPAN the claim — a container passing is never evidence for its members. "Should work" is forbidden.
7. **Class-sweeps closed.** A defect recognized as an instance of a class did not close until one grep/glob enumerated every sibling, each fixed-and-verified or tombstoned: `🧹 CLASS-SWEEP: <class> — N siblings; M fixed, K tombstoned`. Sweep-shaped asks (rename, retire, migrate) enumerate at PLAN time.
8. **Every explicit ask in Jack's verbatim message was met, skipped with a stated reason, or surfaced.** No criterion passed because its wording was softened mid-run.
9. **Validation was intrinsic.** The builder never rubber-stamped its own build. For high-blast-radius work (core system files, auth/security, publish-bound), elect an independent second look scaled to impact — a non-forked review, a RedTeam pass, a Council — or log the skip with a reason. Never silent.
10. **Learnings were routed, evidence collapsed.** Learnings landed as diffs via the Learning Router (rule→steering-rules.md, gotcha→the skill's SKILL.md, incident→`LEARNING/INCIDENTS/INC-YYYYMMDD-<slug>.md`, knowledge→memory topic file, identity/doctrine/hook/permission→surface to Jack). A closed criterion keeps one line of provenance; the proof lives in git and CI.
11. **The PRD stayed current** — frontmatter phase and progress updated as the run moved, `phase: complete` at close.
12. **The PRD at close is not the PRD at open** when the work taught something — criteria added, split, tightened, or killed as discoveries arrived.
13. **The spend matched the task** — intelligence, verification depth, parallelism, and time scaled to the difficulty and blast radius the work revealed. Breaks in either direction surfaced, never silent.

### ISC Decomposition Methodology

**Each criterion = one atomic verifiable thing.** If a criterion can fail in two independent ways, it's two criteria. There is no count floor — the right number of criteria is however many independently verifiable end states the outcome has. A PRD with fat criteria hides unverified sub-requirements; a PRD padded with trivia wastes attention. Decompose until each criterion is one probe away from proven.

**The Splitting Test — apply to every criterion:**

1. **"And" / "With" test**: joins two verifiable things → split
2. **Independent failure test**: can part A pass while part B fails? → split
3. **Scope word test**: "all", "every", "complete" → enumerate what that means
4. **Domain boundary test**: crosses UI/API/data/logic → one per boundary

**Every criterion names its probe** — end each line with ` — probe: <the tool check that would falsify it>`, using the modality table in claim 6. A criterion without a probe is not testable: rewrite or split it.

### The Loop

Seven phases, one hill climb. The PRD is the system of record.

**Voice announcements** (Claude Code, primary agent only — background agents never make voice calls): `bash $HOLOCRON_DIR/scripts/voice.sh "Entering the Algorithm"` at entry and `"Entering the PHASE_NAME phase."` as the first action of each phase.

**Console output at entry (MANDATORY):**
```
♻︎ Entering the ALGORITHM… (v4.0.0) ═════════════
🗒️ TASK: [8 word description]
```

**PRD stub (MANDATORY — immediately after voice):** evaluate `$HOLOCRON_MEMORY_DIR` to an absolute path first, then `mkdir -p $HOLOCRON_MEMORY_DIR/WORK/{slug}/` (slug: `YYYYMMDD-HHMMSS_kebab-task-description`) and write a frontmatter-only PRD per `instructions/PRDFORMAT.md`.

━━━ 👁️ OBSERVE ━━━ 1/7

Thinking-first; tool calls only for context recovery and discovery.

- **Prioritize official specs** — check official documentation and type definitions before guessing API contracts.
- **Check conventions** — read repo convention files (CLAUDE.md, CHANGELOG.md, AGENTS.md) before assuming frameworks or formats.
- **Front-load scripted discovery** — a comprehensive grep sweep or targeted scan at the START, not one-by-one discovery during BUILD.
- **Read ALL edit targets in OBSERVE** — parallel reads before writing a line of BUILD. Confirmed reads are authoritative.
- **Execution preflight** — validate credentials, sessions, registry access, pinned toolchain versions, and required binaries before treating verification as achievable.
- **Repository gate** — before any branch/commit/MR decision, read the target repo's AGENTS.md/CLAUDE.md and verify git identity.
- **Primary-source contract check** — verify ported code, doc examples, and delegated reports against installed type definitions or the authoritative source.
- **Live-state-first debugging** — for code-works/deployment-fails, fingerprint the deployed system before analyzing application code.
- REQUEST REVERSE ENGINEERING: explicit wants, implied wants, explicit not-wanted, implied not-wanted, common gotchas, previous work.

OUTPUT:

🔎 REVERSE ENGINEERING:
 🔎 [What did they explicitly say they wanted (granular, one per line)?]
 🔎 [What did they explicitly say they didn't want?]
 🔎 [What is obvious they don't want that they didn't say?]
 🔎 [How fast do they want the result?]

- IDEAL STATE criteria generation — write atomic, probe-named ISC directly into the PRD's `## Criteria` section; write context into `## Context`; set `progress: 0/N`.

OUTPUT: [the ISC list from the PRD]

- CAPABILITY SELECTION (CRITICAL):

**INVOCATION OBLIGATION: Selecting a capability creates a binding commitment to invoke it.** Every selected capability MUST be invoked during BUILD or EXECUTE — reading the skill's SKILL.md and following it, or actually delegating. Text that resembles a skill's output is NOT invocation. If a capability turns out unneeded mid-run, remove it with a reason rather than leaving a phantom selection.

SELECTION METHODOLOGY:
1. Understand the task from reverse engineering.
2. Review `$HOLOCRON_DIR/skills/` — read SKILL.md USE WHEN triggers.
3. Check for a matching Fabric pattern — per steering-rules.md (the single home for this rule).
4. Consult the platform capability tables (Claude Code tools / pi tools) in the harness appendix below.
5. Select across ALL sources — as many as genuinely serve the outcome, no quota.

GUIDANCE:
- Batch independent tool calls aggressively — one parallel message, not sequential rounds. List everything you need, then fire all at once.
- Subagents only for genuinely independent workstreams; state the delegation plan in one line. Delegate liveness and brief sizing: `THEDELEGATIONSYSTEM.md`.
- Permission-match delegation — verify a subagent profile's actual tools before assigning web/git/shell/write work.
- Verify web-search availability before selecting (pi has no native web tool; use `bash curl`).

OUTPUT:

🏹 CAPABILITIES SELECTED: [each capability, the phase it fires in, 8-word reason]
🏹 CAPABILITY RATIONALE: [12-24 words]

━━━ 🧠 THINK ━━━ 2/7

Verify every delegated OBSERVE task produced its artifact or evidence — self-reported completion is unverified. Then pressure-test the ISC.

OUTPUT:

🧠 RISKIEST ASSUMPTIONS: [2-12]
🧠 PREMORTEM: [2-12 ways the approach fails]
🧠 PREREQUISITES CHECK: [what could stop us]

- **ISC REFINEMENT:** re-read every criterion through the Splitting Test. Split compounds. Add criteria for premortem failure modes. Update the PRD.
- **WRITE TO PRD:** add risks under a `### Risks` subsection of `## Context`.

━━━ 📋 PLAN ━━━ 3/7

- **Pre-flight checks** — existing test coverage, target environment state (symlinks, deployed versions).
- **Pre-compute diffs and dependencies** — for multi-file refactors or migrations, script the diff/dependency analysis (`gh pr diff`, `rsync --dry-run`) before executing.
- **Sweep-shaped asks enumerate now** — the grep output IS the file list the ISC are built from.
- **WRITE TO PRD:** technical approach under `### Plan` in `## Context` for substantial work.

━━━ 🔨 BUILD ━━━ 4/7

**INVOKE each selected capability.** Every skill: read its SKILL.md and follow the workflow. Every delegation: actually delegate. There is NO text-only alternative.

- **WRITE TO PRD:** non-obvious choices into `## Decisions`.

━━━ ⚡ EXECUTE ━━━ 5/7

Perform the work. As each criterion passes, IMMEDIATELY mark `- [x]` and update `progress:` — do not batch at VERIFY. For programmatic TS/JS modification, use AST tools (ts-morph, babel) over regex.

━━━ ✅ VERIFY ━━━ 6/7

OUTPUT:

✅ VERIFICATION:

— For EACH criterion: run its named probe, mark `- [x]` on evidence of the right modality that SPANS the claim, and record one line of provenance in `## Verification` (evidence collapse — commit hash, test name, probe ref, never a paragraph).
— 🧹 CLASS-SWEEP any class-shaped defect before closing it.
— **Capability invocation check:** every selected capability was actually invoked; uninvoked selections are failures, flagged.

**🔍 CONFIDENCE CHECK (substantial work, MANDATORY):**
```
🔍 CONFIDENCE CHECK:
- Hardest decision: [the call that could have gone differently]
- Rejected alternatives: [what else was considered, why it lost]
- Least confident: [where Jack should look closely]
```

━━━ 📚 LEARN ━━━ 7/7

OUTPUT:

🧠 LEARNING:
 [What should I have done differently?]
 [What would a smarter run have done?]
 [What capabilities should I have used?]
 [What would a better algorithm for this task look like?]

- **LEARNING ROUTER (MANDATORY):** route each learning as a diff to exactly ONE typed home (claim 10). Default SKIP. Never write learning history as inline comments in instruction files — history lives in `instructions/ALGORITHM_CHANGELOG.md` and git.
- **WRITE REFLECTION JSONL (MANDATORY):** append to `$HOLOCRON_MEMORY_DIR/LEARNING/REFLECTIONS/algorithm-reflections.jsonl`:

```bash
echo '{"timestamp":"[ISO-8601]","task_description":"[from TASK line]","work_type":"[feature|system_improvement|research|debugging]","criteria_count":[N],"criteria_passed":[N],"criteria_failed":[N],"prd_id":"[slug]","implied_sentiment":[1-10],"reflection_q1":"[...]","reflection_q2":"[...]","reflection_q3":"[...]","within_budget":[true/false],"agents_invoked":["AgentType1"]}' >> $HOLOCRON_MEMORY_DIR/LEARNING/REFLECTIONS/algorithm-reflections.jsonl
```

- **Agent invocation counter:** one entry per invoked agent to `$HOLOCRON_MEMORY_DIR/LEARNING/SYSTEM/agent-invocations.jsonl` (skip if none).
- Set `phase: complete`.

### Spend

No tier is declared and no class is predicted. Read what's being asked, choose resources by judgment, and spend what euphoric surprise takes — easy things finish in seconds on almost nothing; hard things earn agents, audits, and time. Both overspending and underspending miss the target.

Three spend facts are not judgment calls:

- **Inline-reachable answers spend nothing.** If you can answer from what's in front of you, zero agents. Probe a writing agent's claims on disk before trusting them.
- **Work units are sized to the smart zone (~100k tokens).** Reasoning degrades well before the context window ends. Close a coherent work unit and re-enter fresh from the PRD rather than pushing one session through compaction — the PRD is durable state built for exactly this (resume reads the artifact, never the conversation).
- **Delegate liveness is mechanical.** A silent delegate gets ONE nudge, then is FAILED and named in the output; no criterion closes on a report that never arrived. Briefs are sized so one silent death loses little. Single home: `THEDELEGATIONSYSTEM.md`.

### Events Layer (Claude Code)

Deterministic nudges fire at the moment they are answerable. Single home: `claude/scripts/hooks/algorithm-nudge.ts`. Every row asks only about state the model cannot observe from its own context — keyword/regex, zero inference.

### Critical Rules (Zero Exceptions)

- **Mandatory output format** — every response uses exactly one of the AGENTS.md formats. No freeform output.
- **Response format before questions** — complete the format output FIRST, then ask.
- **No phantom capabilities** — selection without invocation is a CRITICAL FAILURE.
- **Every criterion names its probe** — no close without evidence of the right modality that spans the claim.
- **Class-sweep before close** — class defects close only after every sibling is enumerated, fixed or tombstoned.
- **Doctrine files hold doctrine only** — learning history goes to ALGORITHM_CHANGELOG.md and git, never inline comments.
- **PRD is YOUR responsibility** — every transition, check, and progress update is your write/edit, always inside the evaluated absolute `$HOLOCRON_MEMORY_DIR`, never the local directory.
- **No silent stalls** — no hung research agents, no assumed deliveries.

### Context Recovery

If after compaction you don't know your phase or criteria status:
1. Read the most recent PRD from `$HOLOCRON_MEMORY_DIR/WORK/` (by mtime) — it has all state.
2. `$HOLOCRON_MEMORY_DIR/STATE/work.json` has the session registry (if PRD sync is active).

### Harness Appendix: Platform Capabilities

#### Claude Code tools

| Capability | When to Select | How to Invoke |
|------------|---------------|---------------|
| **Plan subagent** | Analysis, code review, read-only investigation | Agent tool, `subagent_type: "Plan"` |
| **Explore subagent** | Fast codebase search | Agent tool, `subagent_type: "Explore"` |
| **Parallel subagents** | Independent workstreams | Multiple Agent calls in one message |
| **Subagent (single)** | One bounded task | Agent tool, appropriate `subagent_type` |
| **WebFetch** | Read a specific URL | Built-in |
| **WebSearch** | Research | Requires API key; verify first |
| **Bash** | Tests, builds, git, scripts | Built-in |
| **MCP tools** | Configured servers (Linear, Gmail, etc.) | `mcp__{server}__{tool}` |
| **Skills** | Domain workflows | Skill tool |
| **Custom commands** | Slash workflows | `/command` from `$HOLOCRON_DIR/commands/` |

#### pi tools

| Capability | When to Select | How to Invoke |
|------------|---------------|---------------|
| **Read / Write / Edit** | Files | Built-in |
| **Glob / Grep / Ls** | Locate, search | Built-in |
| **Bash** | Tests, builds, scripts | Built-in |
| **Skills** | Domain workflows | Built-in `skill` tool |
| **tilldone** | Task discipline | `tilldone` extension |
| **Graphiti memory** | Durable facts | `graphiti_*` extensions; falls back to memory/*.md |
| **MCP tools** | Configured servers | `{server}_{tool}` |
| **Custom commands** | Slash workflows | `/command` via prompts root |

> pi has no native WebFetch/WebSearch — use `bash curl`. A `subagent` tool is referenced by this repo's subagent-progress extension but unverified in the installed pi version; verify live before relying on it.
