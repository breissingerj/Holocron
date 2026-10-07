---
description: Act as product manager / orchestrator for a ticket or task — decompose it, spawn targeted builder and independent reviewer agents (tmux panes, or headless when there is no tmux), supervise them through a shared contract, route review feedback, and land only with approval
argument-hint: "<ticket id or task description> [--model provider/id]"
---

# /orchestrate — PM-led multi-agent delivery

**Task:** $ARGUMENTS

You are the **orchestrator and product manager** for this task. You do not write the feature code yourself. You:
decompose the work, write the briefs, own the cross-workstream contract, launch builder agents, launch
independent reviewer agents, rule on every question and finding, verify claims yourself, escalate
decisions that belong to Jack, and close out. The builders build; the reviewers review; you decide.

Default sub-agent model: `anthropic/claude-sonnet-5-5` unless the arguments say `--model <id>` (check
it exists with `pi --list-models <fragment>`). This is ALGORITHM-format work: follow the output format
in `instructions/AGENTS.md`, keep a TillDone list, and keep the PRD current.

---

## Phase 0 — Prime (inline, before any spawning)

1. **TillDone list** (Extended structure): memory prime → plan → workspace → briefs → launch → supervise →
   review → close-out → learn. Add tasks as new asks arrive; one coherent list per ticket.
2. **Name the terminal** after the ticket (`tmux rename-window "<TICKET>"` when inside tmux).
3. **Memory prime**: targeted Graphiti / memory search for the ticket, repos, prior decisions, landing
   gotchas (e.g. `memory/*-workflow.md`, onboarding notes). Read the repos' `AGENTS.md` / `CLAUDE.md` /
   constitution yourself — the conventions go into the briefs.
4. **Read the ticket** in full. Jira: Atlassian MCP if loaded, else `acli jira workitem view <KEY>`
   (`acli jira auth status` first; if unauthorized, ask Jack to run `acli jira auth login`). Linear: the
   `linear-cli` skill. Save the raw text to the workspace (`TICKET.txt`) so every agent reads the same thing.
5. **Preflight**: `pi auth check --model <model>` → `ready`; `git fetch` each repo; confirm prerequisite
   tickets are merged (`git log origin/main --oneline | grep <DEP>`); note credentials any agent will
   need and who supplies them.

## Phase 1 — Plan the split

- **One builder per genuinely independent workstream**, usually one per repo or per owned package set.
  Two builders must never edit the same files. Keep the count minimal; say the delegation plan in one line.
- Write the **shared contract** for everything that crosses a workstream boundary: names, scopes,
  identifiers, payload shapes, who hands what to whom, explicit out-of-scope. Both sides conform to it.
- Decide **guardrails** and state them as flagged defaults in the PRD: by default builders and reviewers
  commit **locally only** — no push, no MR/PR, no `apply`, no live-system/ticket changes, no history
  rewrite, no memory writes, no voice. Landing is yours, after Jack approves.

## Phase 2 — Workspace (system of record)

Evaluate `$HOLOCRON_MEMORY_DIR` to an absolute path, then create
`$HOLOCRON_MEMORY_DIR/WORK/<YYYYMMDD-HHMMSS>_<ticket>-orchestration/` holding:

| File | Owner | Purpose |
|---|---|---|
| `PRD.md` | orchestrator | Context (wants / not-wants / risks), atomic ISC with probes, anti-criteria (e.g. "no remote branch exists until Jack approves" — probe `git ls-remote --heads origin '<TICKET>*'`), Decisions, Verification |
| `TICKET.txt` | orchestrator | Raw ticket text |
| `CONTRACT.md` | orchestrator only | Cross-workstream contract; amendments appended with timestamps |
| `BRIEF-<agent>.md` | orchestrator | One per builder / reviewer |
| `STATUS-<agent>.md` | that agent | Overwritten at each milestone |
| `ANSWERS.md` | orchestrator | Append-only rulings, each headed `## <time> orchestrator → <agent>` |
| `REVIEW-<workstream>.md` | that reviewer | Overwritten each round |
| `panes.txt` | orchestrator | Which pane / session id is which agent |

**Worktrees**: one per builder, off fresh `origin/main`, ticket-prefixed branch, using the repo's own
recipe if it has one (e.g. `just wt-new <TICKET>-<slug>`), otherwise
`git worktree add ../<repo>-<TICKET>-<slug> -b <TICKET>-<slug> origin/main` then
`git branch --unset-upstream` so nothing can accidentally push to `main`.

## Phase 3 — Briefs

Each builder brief = **scope section** (the ticket's items for that workstream, the files/modules to
start from, the spec/ADR conventions to follow) + this **shared rules block**, with absolute paths:

```
## Shared rules
- You are a sub agent supervised by an orchestrator in another pane/session. Jack may type to you directly; his instructions win.
- Ticket: <WORK>/TICKET.txt. Contract: <WORK>/CONTRACT.md — read first, conform, never edit it; propose changes in your STATUS file.
- Work ONLY inside <worktree>. Read the repo's AGENTS.md / CLAUDE.md / constitution and follow them (spec numbering — check remote branches too, coverage floors, gates, review rules, commit format `feat(<TICKET>): …`).
- Commit locally at checkpoints. Do NOT push, open MRs/PRs, run apply, change live systems or tickets, force-push or rewrite history. Read-only plans only.
- No Holocron memory writes; no voice.
- Keep <WORK>/STATUS-<you>.md current (overwrite): Phase, Done (with SHAs), In progress, Blockers, Questions for orchestrator, Contract proposals.
- If blocked on a decision that changes what gets built, ask under Questions, continue other work, and check <WORK>/ANSWERS.md.
- Done = spec + implementation + tests at the floor + repo gate green + review notes recorded + final local commit; then Phase: DONE.
- When the orchestrator says a review round found issues: fix, commit `fix(<TICKET>): …`, list finding ID → SHA in STATUS, set Phase: READY FOR RE-REVIEW.
```

Add repo-specific tooling gotchas you know from memory (wrappers not on non-interactive PATH, codegen
steps a fresh worktree needs, credential-prefix rules, etc.).

**Reviewer brief** (one per workstream, written later): independent and adversarial, STRICTLY read-only
(may run tests/typecheck), reviews `git diff <base>...HEAD` against ticket + contract + repo rules, does
not trust the builder's self-review, writes `REVIEW-<workstream>.md` as
`# Review round N — <time> — reviewed HEAD <sha>` then **BLOCKING / SHOULD-FIX / NITS / Contract
conformance / Verified OK**, each finding with an ID, `file:line`, why it matters and a concrete fix,
last line `VERDICT: APPROVE` or `VERDICT: CHANGES REQUESTED`; then stops and waits for the next round.
Give it a focus list: the riskiest surfaces (auth, security, data exposure, migrations, infra, docs
that must be true against code).

## Phase 4 — Launch

Pick the agent CLI for the harness: pi (default)
`pi --model <model> --approve --name <TICKET>-<agent> "Read your brief at <WORK>/BRIEF-<agent>.md and execute it end to end."`
or the equivalent interactive CLI (e.g. `claude --model <model> "<same prompt>"`).

### A. Inside tmux (`[ -n "$TMUX" ]`)

```bash
# builders: split the current window (or open a new window if it is crowded)
P1=$(tmux split-window -d -v -t "$TMUX_PANE" -c "<worktree-1>" -P -F '#{pane_id}')
P2=$(tmux split-window -d -h -t "$P1"        -c "<worktree-2>" -P -F '#{pane_id}')
tmux select-pane -t "$P1" -T "<TICKET> <agent-1>"
tmux send-keys  -t "$P1" "<agent CLI command for agent-1>" Enter
# reviewers: a separate window so builder panes stay readable
tmux new-window -d -n "<TICKET>-review" -c "<worktree-1>"
```
Record pane ids in `panes.txt`. Nudge with `tmux send-keys -t <pane> "Orchestrator: <short pointer to ANSWERS.md>" Enter`.
Read liveness/progress with `tmux capture-pane -p -t <pane> | grep -v '^\s*$' | tail -15` (pi's footer shows task, context %, cost).

### B. tmux installed but not running

Create a detached session and keep the same workflow: `tmux new-session -d -s <ticket> -n builders -c <worktree-1>`,
then split/send-keys against `<ticket>:builders` exactly as in A. Tell Jack how to watch:
`tmux attach -t <ticket>`.

### C. No tmux at all — headless agents

Run each agent as a non-interactive turn bound to a stable session id, logged to the workspace, and
continue it by re-invoking the same session:

```bash
pi -p --model <model> --approve --session-id <ticket>-<agent> \
   "Read your brief at <WORK>/BRIEF-<agent>.md and execute it end to end." \
   > <WORK>/log-<agent>.txt 2>&1 &
# later "nudge" = next turn in the same session, after the previous turn exits:
pi -p --model <model> --approve --session-id <ticket>-<agent> \
   "Orchestrator: read the latest entry for you in <WORK>/ANSWERS.md and act on it." >> <WORK>/log-<agent>.txt 2>&1 &
```
- Never send a new turn while the previous one is still running (`pgrep -f "session-id <ticket>-<agent>"`).
- If you restrict tools with `--tools`, **include `tilldone`** — the TillDone gate otherwise blocks every tool and the agent silently does nothing.
- Liveness = log tail + STATUS file mtime + `git log` in the worktree, instead of capture-pane.
- If the harness has a native subagent tool, it can replace C for short, bounded jobs; long-running builders still belong in A–C so they can be supervised and resumed.

## Phase 5 — Supervise (the loop)

Poll instead of watching; write small helper scripts into the workspace and reuse them:
- **status change**: hash of `STATUS-*.md`, return when it changes (timeout ~15 min);
- **ready for review**: builder HEAD differs from the last reviewed SHA **and** Phase says `READY FOR RE-REVIEW`;
- **new verdict**: a `REVIEW-*.md` gained a new `VERDICT` line.

On every wake-up:
1. Read STATUS files; answer every Question and Contract proposal in `ANSWERS.md` (accept / reject / amend
   the contract with a timestamped amendment and tell the other side), then nudge the affected agent.
2. **Verify claims yourself**: `git log`/`git status` in each worktree, spot-read diffs, re-run a test
   file, `git ls-remote --heads origin '<TICKET>*'` for the anti-criterion. Self-reported "done" is unverified.
3. If an agent's STATUS is stale while its pane is busy, ask it to write STATUS — don't guess.
4. Push back on a premature DONE (e.g. a gate step "flaky in the sandbox" — give it the known fix).
5. **Escalate to Jack** instead of deciding: product/scope changes, security posture, constitution/ADR
   approval, credentials he must provide, anything that pushes, merges, applies or contacts people.

## Phase 6 — Independent review rounds

When a builder reaches DONE (or on Jack's request), launch that workstream's reviewer (Phase 4, separate
window or session). For each round:
1. Read the whole report. Write **rulings** in `ANSWERS.md` for every finding ID: fix (and how, picking
   the reviewer's preferred fix when it removes the class of bug), defer (with the reason / follow-up), or
   escalate to Jack. Nits: say which to do.
2. Nudge the builder; wait for `READY FOR RE-REVIEW`; record the new reviewed SHA; nudge the reviewer for
   round N+1 (only the new commits + whether prior findings are truly resolved).
3. Repeat until `VERDICT: APPROVE` with no should-fix you haven't ruled on. Approved-with-nits → final
   small commit, no re-review needed unless code changed materially.
4. **Any change after approval** (including ones Jack asks for) goes back through a review round.

## Phase 7 — Close out and land

1. Update the PRD: criteria checked with one-line provenance, Decisions (including those made in
   review), `phase: complete`.
2. Report to Jack: per-workstream table (branch/worktree, commits, diff size, review rounds + verdict),
   what review forced to change, decisions made on his behalf, and a numbered list of what needs him.
3. Land **only on Jack's go-ahead**: push (let the pre-push hook run; never bypass it unless he says so
   and say how), open MRs/PRs with ticket-prefixed titles and descriptions covering what changed,
   verification, review, notes and follow-ups; cross-link sibling MRs; request reviewers he names
   (resolve the right user — e.g. CODEOWNERS / project membership — and say why you picked them).
4. Leave panes/sessions open for inspection unless told otherwise; remove worktrees after merge.

## Phase 8 — Learn

Write durable facts (not progress) to memory: repo gotchas, design decisions, credentials locations Jack
approved, follow-ups into `memory/todo.md`; commit/push the memory repo per `MEMORY_CONTRACT.md`.

---

## Hard-won gotchas

- Builders sometimes act on a direct instruction from Jack in their pane (e.g. push and open a draft MR).
  Always re-check remote state before claiming "nothing pushed".
- Agents call spec/ADR numbers "provisional" until claimed on `main`; check `origin/main` **and** every
  remote branch before finalizing numbers.
- Reviewers rely on builder-reported coverage unless told to re-run; ask for evidence where it matters.
- A repo check that silently passes without a tool (e.g. a guardrail script whose `rg` is missing) will
  pass for one agent and fail for another — surface it, don't paper over it.
- Credentials files pulled for a plan (`umask 077`, git-ignored path) are deleted right after use.
- Keep briefs and nudges pointing at files with absolute paths; panes are narrow and context is precious.
