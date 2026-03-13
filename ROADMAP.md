# Holocron Roadmap

Feature parity with [Personal AI Infrastructure](https://github.com/danielmiessler/Personal_AI_Infrastructure), built to be harness-agnostic.

---

## Milestone 1 — Scaffold
*Get the repo structure in place and OpenCode running with a baseline config.*

- Define and create the directory structure (`skills/`, `commands/`, `plugins/`, `instructions/`)
- Write `install.sh` to symlink config into `~/.opencode/`
- Install critical safety plugins: CC Safety Net, Envsitter Guard
- Install quality-of-life plugins: Dynamic Context Pruning, opencode-snip, Oh My OpenCode Slim, Worktree
- Verify OpenCode launches cleanly with Holocron symlinked in

---

## Milestone 2 — The Algorithm
*The core execution engine that governs how the agent approaches every task.*

- Port PAI Algorithm v3.7.0 into `instructions/algorithm.md`
- Port behavioral steering rules into `instructions/steering-rules.md`
- Write `pai-algorithm` plugin to inject both into the system prompt at session start
- Validate mode dispatch (NATIVE / ALGORITHM / MINIMAL) works as expected

---

## Milestone 3 — Skills & Commands
*Domain-specific capabilities and slash commands that give the agent leverage.*

- Port PAI skill files from `~/.claude/skills/` into `skills/`
- Adapt `USE WHEN` frontmatter for OpenCode's skill loading model
- Port slash commands (`/commit`, `/review-pr`, etc.) into `commands/`
- Smoke test key skills trigger correctly

---

## Milestone 4 — Personal Context Loading
*What makes it personal — relationship memory, learning signals, and active work injected at session start.*

- Design `OPENCODE_MEMORY_DIR` env var convention pointing to private memory repo
- Write `pai-context-loader` plugin to read and inject at session start:
  - Relationship memory
  - Recent learning signals
  - Active work summary
  - User identity / preferences
- Validate context appears correctly in the agent's first response

---

## Milestone 5 — Memory & Work Tracking
*Persistent capture of work, learning, and decisions across sessions.*

- Install Simple Memory plugin for learning/relationship captures
- Write `pai-prd` plugin: PRD stub creation + frontmatter sync to `work.json`
- Define `MEMORY/` directory structure in the private memory repo
- Validate work sessions are tracked and retrievable

---

## Milestone 6 — Learning Feedback Loop
*Ratings, sentiment capture, and reflection — the flywheel that improves the system over time.*

- Write `pai-learning-capture` plugin:
  - Explicit rating detection from user prompts
  - Haiku inference for implicit sentiment
  - Append to `MEMORY/SIGNALS/ratings.jsonl`
  - Learning write trigger on low ratings
- Port Algorithm reflection JSONL format
- Validate signals accumulate across sessions

---

## Milestone 7 — Voice & Notifications
*Ambient feedback — knowing when the agent is done without watching the screen.*

- Install Smart Voice Notify for baseline OS notifications
- Write `pai-voice` plugin to call ElevenLabs server (`localhost:8888`) on completion
- Validate voice fires on task completion, silent on subagent work

---

## Milestone 8 — Agent Personas
*Specialized agents with distinct identities for different types of work.*

- Define custom agent persona files in `skills/agents/` for core PAI agents:
  Engineer, Architect, QATester, Researcher, Designer
- Wire agent skills so @-mention loads the right persona context
- Validate persona context loads correctly when @-mentioned

---

## Milestone 9 — Hardening & Portability
*Make Holocron installable on a new machine in under 10 minutes.*

- Finalize `install.sh` with full setup (clone, symlink, env vars, plugin installs)
- Document setup in README
- Test clean install on a fresh shell
- Tag `v1.0.0`
