# Holocron Roadmap

Feature parity with [Personal AI Infrastructure](https://github.com/danielmiessler/Personal_AI_Infrastructure), built to be harness-agnostic.

---

## Milestone 1 — Scaffold & Symlinking ✅
*Directory structure, cross-platform install scripts, and harness symlinks in place.*

- Define and create the directory structure (`skills/`, `commands/`, `plugins/`, `instructions/`)
- Write `install.sh` (Mac/Linux) and `install.ps1` (Windows) to symlink config into the active harness
- Support Mac, Linux, and Windows out of the box
- Verify symlinks resolve correctly on each platform

---

## Milestone 2 — Voice & Notification System ✅
*ElevenLabs TTS voice server, 5-level volume system, and cross-harness notification pipeline.*

- Port PAI VoiceServer to `VoiceServer/` — config driven by `config.json` (not `settings.json`)
- Port volume level system to `tools/VolumeLevel.ts` + `tools/ToggleMute.ts` (uses `$HOLOCRON_MEMORY_DIR`)
- Port `scripts/voice.sh` announcement helper
- Port `skills/volume/SKILL.md` for harness-native volume control
- Config resolution: `$HOLOCRON_VOICE_CONFIG` → `VoiceServer/config.json` → fallback defaults
- Notification icon: `$HOLOCRON_NOTIFICATION_ICON` → `assets/icon.png` → omit

---

## Milestone 3 — Plugin Installation
*Critical and quality-of-life plugins installed and verified.*

- Install critical safety plugins: CC Safety Net, Envsitter Guard
- Install quality-of-life plugins: Dynamic Context Pruning, opencode-snip, Oh My OpenCode Slim, Worktree
- Verify OpenCode launches cleanly with Holocron symlinked in

---

## Milestone 4 — The Algorithm
*The core execution engine that governs how the agent approaches every task.*

- Port PAI Algorithm v3.7.0 into `instructions/algorithm.md`
- Port behavioral steering rules into `instructions/steering-rules.md`
- Write `pai-algorithm` plugin to inject both into the system prompt at session start
- Validate mode dispatch (NATIVE / ALGORITHM / MINIMAL) works as expected

---

## Milestone 5 — Skills & Commands
*Domain-specific capabilities and slash commands that give the agent leverage.*

- Port PAI skill files from `~/.claude/skills/` into `skills/`
- Adapt `USE WHEN` frontmatter for OpenCode's skill loading model
- Port slash commands (`/commit`, `/review-pr`, etc.) into `commands/`
- Smoke test key skills trigger correctly

---

## Milestone 6 — Personal Context Loading
*What makes it personal — relationship memory, learning signals, and active work injected at session start.*

- Design `HOLOCRON_MEMORY_DIR` env var convention pointing to private memory repo
- Write `pai-context-loader` plugin to read and inject at session start:
  - Relationship memory
  - Recent learning signals
  - Active work summary
  - User identity / preferences
- Validate context appears correctly in the agent's first response

---

## Milestone 7 — Memory & Work Tracking
*Persistent capture of work, learning, and decisions across sessions.*

- Install Simple Memory plugin for learning/relationship captures
- Write `pai-prd` plugin: PRD stub creation + frontmatter sync to `work.json`
- Define `MEMORY/` directory structure in the private memory repo
- Validate work sessions are tracked and retrievable

---

## Milestone 8 — Learning Feedback Loop
*Ratings, sentiment capture, and reflection — the flywheel that improves the system over time.*

- Write `pai-learning-capture` plugin:
  - Explicit rating detection from user prompts
  - Haiku inference for implicit sentiment
  - Append to `MEMORY/SIGNALS/ratings.jsonl`
  - Learning write trigger on low ratings
- Port Algorithm reflection JSONL format
- Validate signals accumulate across sessions

---

## Milestone 9 — Agent Personas
*Specialized agents with distinct identities for different types of work.*

- Define custom agent persona files in `skills/agents/` for core PAI agents:
  Engineer, Architect, QATester, Researcher, Designer
- Wire agent skills so @-mention loads the right persona context
- Validate persona context loads correctly when @-mentioned

---

## Milestone 10 — Hardening & Portability
*Make Holocron installable on a new machine in under 10 minutes.*

- Finalize `install.sh` with full setup (clone, symlink, env vars, plugin installs)
- Document setup in README
- Test clean install on a fresh shell
- Tag `v1.0.0`
