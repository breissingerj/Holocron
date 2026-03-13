# Holocron Roadmap

Feature parity with [Personal AI Infrastructure](https://github.com/danielmiessler/Personal_AI_Infrastructure), built to be harness-agnostic.

> **Plugin philosophy:** Don't install plugins speculatively. Before building any capability from scratch, check `PLUGINS.md` to see if a well-supported plugin already covers the scope. Install plugins just-in-time — when the work demands it.

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

## Milestone 3 — Safety Baseline
*Minimum security guardrails before any real work happens in the harness.*

- Install CC Safety Net — intercepts destructive git/filesystem commands before execution
- Verify OpenCode launches cleanly with Holocron symlinked in

---

## Milestone 4 — The Algorithm ✅
*The core execution engine that governs how the agent approaches every task.*

- Port PAI Algorithm v3.7.0 into `instructions/algorithm.md` ✅
- Port behavioral steering rules into `instructions/steering-rules.md` ✅
- Update `instructions/AGENTS.md` with mode dispatch (NATIVE / ALGORITHM / MINIMAL) ✅
- Add `scripts` to install.sh harness symlinks so voice.sh is reachable ✅
- _(Deferred to M9)_ Write `pai-algorithm` plugin to inject algorithm + steering rules at session start

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

## Milestone 9 — Quality-of-Life Plugin Pass
*Evaluate and install workflow plugins deferred from M3. Install only what repeated work has proven necessary.*

See `PLUGINS.md` for the full evaluated list. Candidates to revisit:

- **Dynamic Context Pruning** — prunes stale tool outputs mid-session; useful on long tasks
- **opencode-snip** — truncates verbose shell output; useful in CLI-heavy workflows
- **Oh My OpenCode Slim** — pre-built subagents + LSP/AST tools + tmux integration
- **Worktree** — git worktree automation with auto terminal spawn/cleanup
- **Envsitter Guard** — blocks agent from reading/writing `.env*` files

---

## Milestone 10 — Agent Personas
*Specialized agents with distinct identities for different types of work.*

- Define custom agent persona files in `skills/agents/` for core PAI agents:
  Engineer, Architect, QATester, Researcher, Designer
- Wire agent skills so @-mention loads the right persona context
- Validate persona context loads correctly when @-mentioned

---

## Milestone 11 — Hardening & Portability
*Make Holocron installable on a new machine in under 10 minutes.*

- Finalize `install.sh` with full setup (clone, symlink, env vars, plugin installs)
- Document setup in README
- Test clean install on a fresh shell
- Tag `v1.0.0`
