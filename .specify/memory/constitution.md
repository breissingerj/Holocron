<!--
SYNC IMPACT REPORT
Version change: 1.0.0 → 1.1.0 (MINOR — materially changed guidance on two existing Additional
  Constraints; approved by Jack 2026-08-28 per governance)
Modified principles: none — Core Principles I–VI unchanged (Principle I's portability rationale,
  including its historical OpenCode mention, intentionally preserved)
Added sections: none
Removed sections: none
Changes: (1) "Skill structure" constraint — public-skill naming changed from TitleCase to the
  lowercase-hyphen Agent Skills standard (frontmatter `name` == directory, `[a-z0-9-]+`), per spec
  001 FR-006/SC-006 and user direction 2026-08-28; the `USE WHEN` trigger and personal `_ALLCAPS`
  rules are unchanged. (2) "Supported harnesses" constraint — OpenCode removed (retired per user
  direction 2026-08-28); add-a-harness wording updated to "one installer section + one thin
  per-harness adapter".
Follow-up: spec/plan/tasks templates were audited against these principles on first real-feature
  run (spec 001) — aligned; see specs/001-unified-config-store/plan.md Constitution Check.
-->

# Holocron Constitution

## Core Principles

### I. Harness-Agnostic Core

Holocron's skills, instructions, and behavioral rules MUST remain portable across any AI coding
agent harness (Claude Code, OpenCode, pi.dev, and any future harness). Harness-specific glue
(agent definitions, plugins, settings files) lives in thin per-harness directories (`claude/`,
`opencode/`, `pi/`) and is treated as disposable adapter code, never as the source of truth for
behavior. Adding a new harness MUST be achievable as a small, additive change (e.g., one entry in
an install-script harness map), not a rewrite of core skills or instructions.

**Rationale**: Harness-agnostic personalization is the project's reason for existing (see
`README.md`) — "the same knowledge, voice, and workflows should be loadable whether I'm running
Claude Code, OpenCode, or whatever comes next." Coupling core behavior to one harness's API defeats
the purpose and was explicitly rejected as a design option (DECISIONS.md, 2026-03-13: "PAI as
foundation, not fork").

### II. Algorithm, ISC, and PRD Discipline

Every non-trivial task MUST be routed through the mode classification and Algorithm phase
structure defined in `instructions/algorithm.md` and `instructions/AGENTS.md`. Within ALGORITHM
mode, Ideal State Criteria MUST be atomic (pass the Splitting Test), MUST meet the effort tier's
ISC Count Gate floor before leaving OBSERVE, and the PRD MUST be kept current by the AI itself at
every phase transition and criterion change — no plugin or hook writes PRD content on the AI's
behalf. This principle states the non-negotiable; `instructions/algorithm.md` and
`instructions/PRDFORMAT.md` are the canonical source for full operational detail and MUST be
consulted rather than re-derived from memory.

**Rationale**: Analysis embedded in `algorithm.md` itself found production PRDs routinely missed
their ISC floor before the gate was added ("0 out of 10 Extended PRDs ever hit the 16-minimum").
Atomic, gated criteria are what make Algorithm-mode work independently verifiable instead of a
narrative summary of intent.

### III. Capability Invocation Is a Commitment, Not a Mention

Selecting a capability (a skill, a subagent delegation, a tool) during planning creates a binding
obligation to actually invoke it during execution. Producing text that merely resembles what a
skill or agent would output, without the corresponding real tool call or delegation, is treated as
a dishonest, critical failure — not a shortcut. If a selected capability turns out to be
unnecessary mid-task, it MUST be explicitly removed from the plan with a stated reason rather than
silently dropped.

**Rationale**: This exact failure mode — "phantom capabilities" — is called out as CRITICAL in
`instructions/algorithm.md`'s Critical Rules, its BUILD phase instructions, and its capability
selection section independently. Trust in an agent's self-reported process collapses if selection
and action can silently diverge.

### IV. Surgical Changes, Verified Claims

Fixes and changes MUST be the smallest change that addresses the actual root cause — never a
deletion, rearchitecture, or new scaffolding used as a shortcut around understanding a problem. No
claim about file contents, system state, deployment status, or visual appearance MUST be made
without having verified it with an actual tool call in the current session; "it is" is not a valid
sentence without evidence behind it. Destructive or hard-to-reverse actions (deletes, force-pushes,
production changes) require asking first, not assuming consent from a prior unrelated approval.

**Rationale**: `instructions/steering-rules.md` marks both of these CRITICAL and gives the failure
mode explicitly: "Hook throws error → remove the entire hook" (bad) vs. "read the hook, trace the
error, fix the specific line" (correct). Unverified assertions and destructive shortcuts are the
two failure patterns most likely to destroy trust and lose work irreversibly.

### V. Memory Lives in One Place, Split by Sensitivity

All durable session state — PRDs, learning reflections, relationship/user memory — MUST be written
to the location defined by `$HOLOCRON_MEMORY_DIR`, never into the local working project directory,
unless the working project *is* the memory repo itself. Within that boundary, content splits by
sensitivity, not convenience: public, shareable configuration (skills, instructions, behavioral
rules) lives in the public Holocron repo; personal context (relationship memory, work history,
learning signals) lives in the private memory repo. This split is a hard boundary, not a
suggestion.

**Rationale**: Formalized in `MEMORY_CONTRACT.md` and enforced as a Critical Rule in
`instructions/AGENTS.md`. The two-repo split traces to the project's earliest recorded design
decisions and exists specifically so Holocron itself can stay public without exposing personal
data — mixing the two defeats that guarantee.

### VI. One Source of Truth, Distributed by Symlink

Configuration that must exist in a harness-specific location (e.g., `~/.claude/`, `~/.config/opencode/`)
MUST be symlinked from its canonical location in this repo, never hand-copied. If a file must
diverge per-harness, the divergence is isolated to an explicit per-harness directory, and the
shared behavior it wraps still lives in one place.

**Rationale**: DECISIONS.md shows this pattern reinforced repeatedly across voice config, Claude
CLI settings, and agent definitions, always for the same reason: hand-copies drift silently, while
a symlink makes the repo the only place that needs to change.

## Additional Constraints

- **Skill structure**: Any skill added to this repo MUST follow the canonical structure defined in
  `instructions/SKILLSYSTEM.md` — lowercase-hyphen naming (`[a-z0-9-]+`, the Agent Skills standard)
  with frontmatter `name` equal to the directory name and a `USE WHEN` trigger in its description
  for shareable system skills, `_ALLCAPS` naming for personal (never-shared) skills, and the
  required flat directory layout. (Amended 2026-08-28, v1.1.0: previously TitleCase; the
  Agent-Skills standard removes pi name warnings and keeps the store usable by any strict future
  harness — spec 001, FR-006/SC-006.) This is a style/quality gate, not a Core Principle, but it
  is non-negotiable for anything intended to be portable per Principle I.
- **Just-in-time adoption**: Per `ROADMAP.md`'s stated plugin philosophy, capabilities (plugins,
  dependencies, new subsystems) are adopted when the work in front of the project actually demands
  them, not speculatively. Check for an existing, well-supported solution before building one from
  scratch.
- **Empirical verification over documentation assumptions**: Before relying on a third-party SDK,
  API, or tool behavior (e.g., an event shape, a write-capability, a config option), verify it
  against the actual installed version's source, generated types, or a live call — DECISIONS.md
  records multiple cases where documented or assumed behavior (a `noReply` field, a Todo write API)
  turned out not to exist.
- **Supported harnesses**: Claude Code (`~/.claude/`, the canonical file structure) and pi.dev
  (`~/.pi/agent/`) are the currently supported harnesses. (Amended 2026-08-28, v1.1.0: OpenCode
  retired per user direction — DECISIONS.md 2026-08-28 "Retire OpenCode harness support".) Adding a
  new one is scoped to one installer section plus one thin per-harness adapter — never a change to
  `instructions/`, `skills/`, `agents/`, or `commands/` (see `README.md` § Adding a new harness).

## Development Workflow

- **Spec before work**: Per the repo-root `AGENTS.md`, non-trivial work in this repo goes through
  `/speckit-specify` → `/speckit-plan` → `/speckit-tasks` before implementation begins. Trivial,
  single-file, low-risk changes are exempt.
- **Decision recording**: Per the repo-root `AGENTS.md`, any decision that trades off between
  viable approaches, changes an existing system's structure or contract, or could reasonably be
  revisited later MUST be appended to `DECISIONS.md` before the work is considered complete. This
  constitution's own adoption is recorded there under 2026-08-21.
- **Reflection loop**: Algorithm-mode sessions at Standard+ effort append a structured reflection to
  `$HOLOCRON_MEMORY_DIR/LEARNING/REFLECTIONS/algorithm-reflections.jsonl` per `algorithm.md`'s LEARN
  phase — this is the mechanism by which the Algorithm and this constitution are expected to evolve
  over time, rather than staying static.

## Governance

This constitution states the project's non-negotiable identity and values. Where it overlaps with
operational detail owned by `instructions/algorithm.md`, `instructions/steering-rules.md`, or
`MEMORY_CONTRACT.md`, those files remain the canonical source for the mechanics — this document is
not duplicated there and MUST NOT be treated as superseding their detail, only their intent. Where
a conflict is genuinely about values or priority (not mechanics), this constitution wins.

**Amendment procedure**: Jack Breissinger is the sole maintainer and sole approver of amendments.
Amendments are made by re-running the constitution workflow (`/speckit-constitution`) with the
proposed change, and — per the Development Workflow above — every amendment MUST get a
corresponding `DECISIONS.md` entry explaining what changed and why.

**Versioning policy**: Semantic versioning applies to this document. MAJOR for backward-incompatible
principle removal or redefinition; MINOR for a new principle or materially expanded guidance; PATCH
for wording, clarification, or non-semantic fixes.

**Compliance review**: There is no external PR-review gate on this solo project, so compliance is
self-applied: any ALGORITHM-mode session MUST treat this constitution as the outermost frame,
consulted before falling back to `algorithm.md`/`steering-rules.md` operational detail, and any
work that knowingly conflicts with a Core Principle MUST be flagged to the user rather than
silently proceeding.

**Version**: 1.1.0 | **Ratified**: 2026-08-21 | **Last Amended**: 2026-08-28
