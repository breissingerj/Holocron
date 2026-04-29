# M17 — Pi-Native Algorithm Sub-Agent Pipeline

**Status:** Proposed  
**Prerequisite:** M16 (Pi Extensions Port) — must ship `subagent` extension and `algorithm-mode` extension first  
**Target location:** `pi/extensions/algorithm-pipeline/`

---

## Context

The Holocron Algorithm (v3.7.0) currently runs as a single-agent sequential process: one model, one context window, all 7 phases in one session. This works but has two structural weaknesses:

1. **Context rot** — by the time VERIFY runs, the context window is polluted with OBSERVE tool calls, THINK reasoning, and BUILD artifacts. The VERIFY agent is working in degraded conditions.
2. **No isolation** — a failure or hallucination in PLAN contaminates the entire session. There is no clean boundary.

M17 restructures the Algorithm as a **sequential sub-agent pipeline**: each phase runs as an isolated pi subprocess with a clean context window. Phases communicate via a structured **context envelope** (JSON). Phases that are not needed for a given task are **programmatically skipped** based on the prior phase's output — not hardcoded by effort level alone.

This uses the pi `subagent` extension as the execution primitive (chain mode).

---

## Directory Layout

```
pi/extensions/algorithm-pipeline/
├── index.ts                    # Registers the algorithm_pipeline tool
├── orchestrator.ts             # Pipeline loop + skip evaluation logic
├── context.ts                  # Context envelope TypeScript types
├── phases.ts                   # Phase definitions: tools, skip rules, agent paths
├── package.json                # Dependencies (TypeScript types only)
└── agents/
    ├── observe.md              # OBSERVE agent system prompt
    ├── think.md                # THINK agent system prompt
    ├── plan.md                 # PLAN agent system prompt
    ├── build.md                # BUILD agent system prompt
    ├── execute.md              # EXECUTE agent system prompt
    ├── verify.md               # VERIFY agent system prompt
    └── learn.md                # LEARN agent system prompt
```

`install.sh` symlinks `pi/extensions/algorithm-pipeline/` → `~/.pi/agent/extensions/algorithm-pipeline/` automatically via the existing extension-linking block added in M16.

---

## Context Envelope Schema

Every phase receives the full envelope as its prompt input and returns an updated envelope. Agents are instructed to **summarize prior phase outputs** before appending their own — keeping the envelope under ~8k tokens regardless of task size.

```typescript
// context.ts

export type Effort = "standard" | "extended" | "advanced" | "deep" | "comprehensive";
export type PhaseName = "observe" | "think" | "plan" | "build" | "execute" | "verify" | "learn";

export interface ISCCriterion {
  id: string;           // "ISC-1"
  text: string;         // criterion text
  done: boolean;        // true when verified
  evidence?: string;    // populated by VERIFY
}

export interface CapabilitySelection {
  name: string;         // e.g. "Research", "Subagents"
  phase: string;        // which phase will invoke it
  reason: string;       // 8-word reason
  invoked: boolean;     // set to true when actually called
}

export interface PipelineContext {
  // ── Immutable header (set by orchestrator at start) ──────────────────
  task: string;                    // original user prompt
  slug: string;                    // YYYYMMDD-HHMMSS_kebab-slug
  effort: Effort;
  started: string;                 // ISO timestamp
  prd_path: string;                // absolute path to PRD.md

  // ── Phase control (updated by orchestrator) ───────────────────────────
  phases_run: PhaseName[];
  phases_skipped: PhaseName[];

  // ── Phase outputs (appended as each phase completes) ──────────────────
  observe?: {
    reverse_engineering: {
      explicit_wants: string[];
      explicit_not_wants: string[];
      implied_not_wants: string[];
      speed_preference: string;
    };
    effort_level: Effort;
    isc_criteria: ISCCriterion[];
    capabilities_selected: CapabilitySelection[];
    context_summary: string;           // ≤300 words of gathered context
    recommend_skip: PhaseName[];       // agent's skip recommendations
  };

  think?: {
    riskiest_assumptions: string[];    // 2–8 items
    premortem: string[];               // 2–8 failure modes
    prerequisites_blocked: string[];   // empty = no blockers
    isc_additions: ISCCriterion[];     // new criteria discovered
    isc_splits: Array<{
      original_id: string;
      replacements: ISCCriterion[];
    }>;
    recommend_skip: PhaseName[];
  };

  plan?: {
    technical_approach: string;        // ≤200 words
    dependency_list: string[];
    decisions: Array<{ decision: string; rationale: string }>;
    pre_flight_checks: string[];
    recommend_skip: PhaseName[];
  };

  build?: {
    capabilities_invoked: Array<{
      name: string;
      result_summary: string;          // ≤100 words
      success: boolean;
    }>;
    preparation_summary: string;       // ≤200 words
    decisions: Array<{ decision: string; rationale: string }>;
    recommend_skip: PhaseName[];
  };

  execute?: {
    work_summary: string;              // ≤300 words
    files_changed: string[];
    isc_status: ISCCriterion[];        // all criteria with done=true/false
    decisions: Array<{ decision: string; rationale: string }>;
  };

  verify?: {
    criteria_passed: string[];         // ISC IDs
    criteria_failed: string[];         // ISC IDs
    evidence: Record<string, string>;  // ISC-ID → evidence string
    confidence_check: {
      hardest_decision: string;
      rejected_alternatives: string;
      least_confident: string;
    };
  };

  learn?: {
    reflection_q1: string;
    reflection_q2: string;
    reflection_q3: string;
    reflection_q4: string;
    implied_sentiment: number;         // 1–10
    agents_invoked: string[];
    within_budget: boolean;
  };
}
```

---

## Skip Logic

Skip evaluation is a **two-layer system**:

**Layer 1 — Agent recommendation:** Each agent includes a `recommend_skip: PhaseName[]` field in its output. The orchestrator reads this and uses it as the primary skip signal.

**Layer 2 — Orchestrator hard rules:** The orchestrator validates recommendations against non-negotiable constraints. Hard rules can **add** skips (e.g., BUILD has nothing to invoke) but can **never override a skip of OBSERVE, EXECUTE, or VERIFY**.

```typescript
// orchestrator.ts (skip evaluation)

const NEVER_SKIP: PhaseName[] = ["observe", "execute", "verify"];

function evaluateSkips(
  phase: PhaseName,
  ctx: PipelineContext,
  agentRecommendations: PhaseName[]
): boolean {
  // Hard rule: these phases never skip
  if (NEVER_SKIP.includes(phase)) return false;

  // Agent recommendation is primary signal
  if (agentRecommendations.includes(phase)) return true;

  // Orchestrator hard rules (secondary — can catch what agents miss)
  switch (phase) {
    case "think":
      // Skip if Standard effort, small ISC count, no research capabilities
      return (
        ctx.effort === "standard" &&
        (ctx.observe?.isc_criteria.length ?? 0) <= 8 &&
        !(ctx.observe?.capabilities_selected.some(c =>
          ["Research", "Thinking", "Council"].includes(c.name)
        ) ?? false)
      );

    case "plan":
      // Skip if Standard effort, no blocked prerequisites, ≤2 capabilities
      return (
        ctx.effort === "standard" &&
        (ctx.think?.prerequisites_blocked.length ?? 0) === 0 &&
        (ctx.observe?.capabilities_selected.length ?? 0) <= 2
      );

    case "build":
      // Skip if no capabilities were selected that need pre-invocation
      return (ctx.observe?.capabilities_selected.length ?? 0) === 0;

    case "learn":
      // Skip for pure lookup/question tasks (no ISC criteria to reflect on)
      return (
        ctx.effort === "standard" &&
        (ctx.verify?.criteria_passed.length ?? 0) <= 2 &&
        (ctx.execute?.files_changed.length ?? 0) === 0
      );

    default:
      return false;
  }
}
```

---

## Orchestrator Tool

Registered in `index.ts` as a custom tool callable by the primary agent:

```typescript
// index.ts

pi.registerTool({
  name: "algorithm_pipeline",
  label: "Algorithm Pipeline",
  description: [
    "Run the Holocron Algorithm as a sequential sub-agent pipeline.",
    "Each phase (OBSERVE → THINK → PLAN → BUILD → EXECUTE → VERIFY → LEARN) runs in an isolated context.",
    "Phases are skipped automatically when not needed.",
    "Use this instead of running the Algorithm inline for Advanced+ effort tasks.",
  ].join(" "),
  parameters: Type.Object({
    task: Type.String({
      description: "The original user task — full prompt text"
    }),
    effort: Type.Optional(StringEnum(
      ["standard", "extended", "advanced", "deep", "comprehensive"] as const,
      { description: "Override effort level. If omitted, OBSERVE agent determines it." }
    )),
    force_skip: Type.Optional(Type.Array(Type.String(), {
      description: "Phase names to force-skip regardless of skip logic"
    })),
    force_run: Type.Optional(Type.Array(Type.String(), {
      description: "Phase names to force-run regardless of skip logic"
    })),
  }),

  async execute(toolCallId, params, signal, onUpdate, ctx) {
    // Implemented in orchestrator.ts — see Pipeline Loop below
  },

  renderCall(args, theme) { ... },
  renderResult(result, options, theme) { ... },
});
```

---

## Pipeline Loop

```typescript
// orchestrator.ts

export async function runPipeline(
  params: PipelineParams,
  signal: AbortSignal | undefined,
  onUpdate: OnUpdateCallback | undefined,
  ctx: ExtensionContext,
): Promise<PipelineResult> {

  const slug = generateSlug(params.task);
  const prdPath = `${process.env.HOLOCRON_MEMORY_DIR}/WORK/${slug}/PRD.md`;

  // Initialise envelope
  let envelope: PipelineContext = {
    task: params.task,
    slug,
    effort: params.effort ?? "standard",  // OBSERVE will refine
    started: new Date().toISOString(),
    prd_path: prdPath,
    phases_run: [],
    phases_skipped: [],
  };

  const ALL_PHASES: PhaseName[] =
    ["observe", "think", "plan", "build", "execute", "verify", "learn"];

  for (const phase of ALL_PHASES) {
    // Force-skip overrides everything except OBSERVE/EXECUTE/VERIFY
    if (params.force_skip?.includes(phase) && !NEVER_SKIP.includes(phase)) {
      envelope.phases_skipped.push(phase);
      onUpdate?.({ content: [{ type: "text", text: `Skipping ${phase} (forced)` }], details: envelope });
      continue;
    }

    // Evaluate skip (uses prior phase outputs + agent recommendations)
    const priorAgentRecommendations = getPriorRecommendations(phase, envelope);
    if (evaluateSkips(phase, envelope, priorAgentRecommendations)) {
      // Force-run overrides skip evaluation
      if (!params.force_run?.includes(phase)) {
        envelope.phases_skipped.push(phase);
        onUpdate?.({ content: [{ type: "text", text: `Skipping ${phase}` }], details: envelope });
        continue;
      }
    }

    // Run phase agent
    onUpdate?.({ content: [{ type: "text", text: `Running ${phase}...` }], details: envelope });
    const agentPromptPath = path.join(__dirname, `agents/${phase}.md`);
    const agentPrompt = await fs.readFile(agentPromptPath, "utf-8");

    const result = await runSubagent({
      systemPrompt: agentPrompt,
      task: `CONTEXT_ENVELOPE:\n${JSON.stringify(envelope, null, 2)}`,
      tools: PHASE_TOOLS[phase],
      cwd: ctx.cwd,
      signal,
    });

    // Parse and validate envelope update from agent output
    const updated = parseEnvelopeUpdate(result.output, phase);
    if (updated) {
      envelope = mergeEnvelope(envelope, phase, updated);
      envelope.phases_run.push(phase);
    } else {
      // Malformed JSON — store raw output as context_summary fallback
      envelope = storeFallback(envelope, phase, result.output);
      envelope.phases_run.push(phase);
    }

    onUpdate?.({ content: [{ type: "text", text: result.output }], details: envelope });
  }

  return {
    content: [{ type: "text", text: buildFinalSummary(envelope) }],
    details: envelope,
  };
}

// Tools available per phase
const PHASE_TOOLS: Record<PhaseName, string[]> = {
  observe:  ["read", "bash", "grep", "find", "ls"],          // read-only
  think:    ["read", "bash", "grep", "find", "ls"],          // read-only
  plan:     ["read", "bash", "grep", "find", "ls"],          // read-only
  build:    ["read", "bash", "edit", "write"],               // full access (capability invocation)
  execute:  ["read", "bash", "edit", "write"],               // full access
  verify:   ["read", "bash"],                                 // run tests, no writes
  learn:    ["read", "bash", "write"],                       // reflection writes only
};
```

---

## Agent System Prompt Templates

Each agent receives the full `PipelineContext` JSON envelope and must return:

```json
{
  "phase_output": { ...phase-specific fields... },
  "recommend_skip": ["plan"],
  "narrative": "Human-readable summary of what this phase did"
}
```

The orchestrator extracts `phase_output`, merges it into the envelope, reads `recommend_skip` for the next skip evaluation, and discards everything else.

---

### `agents/observe.md`

```
You are the OBSERVE phase agent in the Holocron Algorithm pipeline.

Your job: analyse the task, reverse-engineer requirements, select capabilities, generate ISC criteria, and write a PRD stub.

INPUT: The CONTEXT_ENVELOPE JSON contains: task, slug, effort (preliminary), started, prd_path.

WORK TO DO:
1. Reverse-engineer the request: explicit wants, explicit not-wants, implied not-wants, speed preference
2. Determine EFFORT LEVEL: standard (<2min) | extended (<8min) | advanced (<16min) | deep (<32min) | comprehensive (<120min)
3. Generate ISC criteria — atomic, one verifiable thing each. Apply the Splitting Test. Minimum counts: standard=8, extended=16, advanced=24, deep=40, comprehensive=64
4. Select CAPABILITIES from available skills and tools. Only select what you will actually invoke
5. Write PRD stub to prd_path (use bash/write tools)
6. Recommend phases to skip based on effort and task nature

SKIP RECOMMENDATIONS — recommend skipping:
- "think" if: effort=standard AND isc_count<=8 AND no research/thinking capabilities selected
- "plan" if: effort=standard AND no complex prerequisites AND <=2 capabilities selected
- "build" if: zero capabilities selected
- "learn" if: effort=standard AND task is a pure lookup/question with no file changes expected

OUTPUT FORMAT (return this exact JSON structure, nothing else after it):
{
  "phase_output": {
    "reverse_engineering": {
      "explicit_wants": [...],
      "explicit_not_wants": [...],
      "implied_not_wants": [...],
      "speed_preference": "..."
    },
    "effort_level": "standard|extended|advanced|deep|comprehensive",
    "isc_criteria": [{"id":"ISC-1","text":"...","done":false}, ...],
    "capabilities_selected": [{"name":"...","phase":"...","reason":"...","invoked":false}, ...],
    "context_summary": "...≤300 words of gathered context...",
    "recommend_skip": []
  },
  "recommend_skip": [],
  "narrative": "..."
}
```

---

### `agents/think.md`

```
You are the THINK phase agent in the Holocron Algorithm pipeline.

Your job: pressure-test the ISC criteria, identify riskiest assumptions, run a premortem, check prerequisites.

INPUT: The CONTEXT_ENVELOPE JSON contains all OBSERVE output. Focus on observe.isc_criteria, observe.capabilities_selected, observe.context_summary.

WORK TO DO:
1. Identify 2–8 riskiest assumptions in the current approach
2. Run a premortem: 2–8 ways this could fail
3. Check prerequisites: list anything that could block execution
4. Apply the Splitting Test to every ISC criterion — split compound criteria, add missing ones
5. Add new criteria or splits to isc_additions / isc_splits

SKIP RECOMMENDATIONS — recommend skipping:
- "plan" if: no blocked prerequisites AND effort=standard AND approach is clear

OUTPUT FORMAT:
{
  "phase_output": {
    "riskiest_assumptions": [...],
    "premortem": [...],
    "prerequisites_blocked": [],
    "isc_additions": [{"id":"ISC-N","text":"...","done":false}, ...],
    "isc_splits": [{"original_id":"ISC-N","replacements":[...]}],
    "recommend_skip": []
  },
  "recommend_skip": [],
  "narrative": "..."
}
```

---

### `agents/plan.md`

```
You are the PLAN phase agent in the Holocron Algorithm pipeline.

Your job: define the technical approach, validate dependencies, make and record key decisions.

INPUT: Full CONTEXT_ENVELOPE including observe and think outputs.

WORK TO DO:
1. Define the technical approach (≤200 words)
2. List concrete dependencies to validate before execution
3. Record key decisions with rationale
4. Run pre-flight checks (e.g., does the target file exist? Is the test suite passing?)

OUTPUT FORMAT:
{
  "phase_output": {
    "technical_approach": "...",
    "dependency_list": [...],
    "decisions": [{"decision":"...","rationale":"..."}, ...],
    "pre_flight_checks": [...],
    "recommend_skip": []
  },
  "recommend_skip": [],
  "narrative": "..."
}
```

---

### `agents/build.md`

```
You are the BUILD phase agent in the Holocron Algorithm pipeline.

Your job: invoke every selected capability. This is the preparation phase before execution.

INPUT: Full CONTEXT_ENVELOPE. Focus on observe.capabilities_selected.

WORK TO DO:
1. For each capability in observe.capabilities_selected: read its SKILL.md and follow its workflow OR delegate to an agent
2. Mark each capability invoked=true after actually calling it — text-only output does NOT count
3. Record decisions made during capability invocation
4. Summarise preparation artifacts created

OUTPUT FORMAT:
{
  "phase_output": {
    "capabilities_invoked": [{"name":"...","result_summary":"...","success":true},...],
    "preparation_summary": "...",
    "decisions": [...],
    "recommend_skip": []
  },
  "recommend_skip": [],
  "narrative": "..."
}
```

---

### `agents/execute.md`

```
You are the EXECUTE phase agent in the Holocron Algorithm pipeline.

Your job: do the actual work. Implement, write, fix, or produce whatever the task requires.

INPUT: Full CONTEXT_ENVELOPE including observe, think, plan, and build outputs. This is your complete brief.

WORK TO DO:
1. Execute the work described in plan.technical_approach
2. For each ISC criterion: implement what is needed to satisfy it, mark done=true as you go
3. Record decisions made during execution
4. List every file changed

OUTPUT FORMAT:
{
  "phase_output": {
    "work_summary": "...",
    "files_changed": [...],
    "isc_status": [{"id":"ISC-1","text":"...","done":true,"evidence":"..."}, ...],
    "decisions": [...]
  },
  "narrative": "..."
}
```

---

### `agents/verify.md`

```
You are the VERIFY phase agent in the Holocron Algorithm pipeline.

Your job: independently verify every ISC criterion. You have read and bash access — run tests, read files, check outputs.

INPUT: Full CONTEXT_ENVELOPE. Focus on execute.isc_status and execute.files_changed.

WORK TO DO:
1. For EACH ISC criterion: test it independently. Do not trust execute.isc_status — verify yourself
2. Record evidence for each criterion (what command you ran, what output confirmed it)
3. Complete the confidence check: hardest decision, rejected alternatives, least confident area

OUTPUT FORMAT:
{
  "phase_output": {
    "criteria_passed": ["ISC-1", "ISC-3", ...],
    "criteria_failed": ["ISC-2", ...],
    "evidence": {"ISC-1": "ran test X, output Y confirmed", ...},
    "confidence_check": {
      "hardest_decision": "...",
      "rejected_alternatives": "...",
      "least_confident": "..."
    }
  },
  "narrative": "..."
}
```

---

### `agents/learn.md`

```
You are the LEARN phase agent in the Holocron Algorithm pipeline.

Your job: reflect on the completed work, write the reflection JSONL entry, and mark the PRD complete.

INPUT: Full CONTEXT_ENVELOPE — all phases.

WORK TO DO:
1. Answer the 4 reflection questions
2. Estimate implied_sentiment (1–10) from task complexity vs outcome
3. List agents actually invoked (from build.capabilities_invoked)
4. Append a JSONL entry to $HOLOCRON_MEMORY_DIR/LEARNING/REFLECTIONS/algorithm-reflections.jsonl
5. Update PRD.md: set phase=complete, mark all passed ISC as [x]

REFLECTION QUESTIONS:
Q1: What should have been done differently in execution?
Q2: What would a smarter algorithm have done instead?
Q3: What capabilities should have been used but weren't?
Q4: What would a smarter AI have designed as a better algorithm for this task?

OUTPUT FORMAT:
{
  "phase_output": {
    "reflection_q1": "...",
    "reflection_q2": "...",
    "reflection_q3": "...",
    "reflection_q4": "...",
    "implied_sentiment": 8,
    "agents_invoked": [...],
    "within_budget": true
  },
  "narrative": "..."
}
```

---

## Context Pruning Protocol

To prevent envelope bloat, each agent is instructed to:

1. **Summarise** prior phase outputs before appending its own — not copy them verbatim
2. **Never** repeat the original task text (it's in the header)
3. **Truncate** evidence strings to ≤100 chars each

The orchestrator enforces a hard cap: if the serialised envelope exceeds 12,000 tokens, it strips evidence fields from phases older than 2 phases back before passing to the next agent.

---

## Failure Recovery

| Failure mode | Orchestrator response |
|---|---|
| Agent returns malformed JSON | Store raw output as `{phase}_fallback_text`, log warning, continue pipeline |
| Agent process exits non-zero | Record error in `phases_skipped` with reason, skip remaining phases that depend on this one |
| Signal abort mid-phase | Kill subprocess, mark current phase as partial, return partial envelope |
| Envelope exceeds token cap | Strip evidence from oldest phases, retry |

---

## Integration with `algorithm-mode` Extension

The `algorithm-mode.ts` extension (M16 work) classifies incoming prompts and injects `[MODE DIRECTIVE]`. M17 extends this by adding a new mode: `PIPELINE`.

When mode = `PIPELINE`:
- The primary agent calls `algorithm_pipeline` tool with the task
- Does not run the Algorithm inline
- The pipeline handles all 7 phases in isolated subagents

This requires a small update to `algorithm-mode.ts` to add `PIPELINE` to the cycle:
```
auto → ALGORITHM → NATIVE → MINIMAL → PIPELINE → auto
```

And a corresponding update to `before_agent_start` to inject:
```
[MODE DIRECTIVE] Use PIPELINE mode — call the algorithm_pipeline tool with the user's task.
```

---

## Phased Implementation Plan

### Phase 1 — Schema + Orchestrator skeleton (no agent prompts yet)
- `context.ts` — full TypeScript types
- `orchestrator.ts` — pipeline loop, skip evaluation, JSON parse/validate
- `index.ts` — tool registration (returns placeholder output)
- Unit tests for skip evaluation logic

### Phase 2 — Agent prompts (7 files)
- Write and iterate all 7 `agents/*.md` prompts
- Test each phase in isolation with mock envelopes
- Validate JSON output shape against schema

### Phase 3 — Integration
- Wire `index.ts` to full `orchestrator.ts`
- Install `subagent` extension as a dependency
- End-to-end test: simple Standard task through full pipeline

### Phase 4 — `algorithm-mode.ts` PIPELINE mode
- Add `PIPELINE` to mode cycle
- Update `before_agent_start` directive
- Update `AGENTS.md` Pi Harness Notes

---

## Success Criteria

- [ ] `algorithm_pipeline` tool callable from primary agent
- [ ] Standard task (≤8 ISC) skips THINK, PLAN, BUILD, LEARN automatically
- [ ] Extended task runs all phases, context envelope stays under 12k tokens
- [ ] VERIFY agent independently re-tests criteria rather than trusting EXECUTE output
- [ ] Malformed agent JSON does not crash pipeline — falls back gracefully
- [ ] ROADMAP.md M17 entry added
