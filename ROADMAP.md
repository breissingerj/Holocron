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

## Milestone 4 — The Algorithm ✅
*The core execution engine that governs how the agent approaches every task.*

- Port PAI Algorithm v3.7.0 into `instructions/algorithm.md` ✅
- Port behavioral steering rules into `instructions/steering-rules.md` ✅
- Update `instructions/AGENTS.md` with mode dispatch (NATIVE / ALGORITHM / MINIMAL) ✅
- Add `scripts` to install.sh harness symlinks so voice.sh is reachable ✅
- _(Deferred to M9)_ Write `pai-algorithm` plugin to inject algorithm + steering rules at session start

**Open items — apply back to algorithm.md when resolved:**
- _(M5 complete — still open)_ Capability invocation is described as "read skill's SKILL.md and follow the workflow." Skills are now ported (M5 ✅) but OpenCode has no tool-enforced invocation mechanism equivalent to PAI's. The `skill` tool in algorithm.md is the current mechanism. Revisit if a skills MCP server becomes available.
- _(Blocked on M6)_ "Address user by name" in steering-rules.md is generic. Once M6 injects user identity at session start, update steering-rules.md to reference the injected name.
- _(Blocked on M7)_ Reflection JSONL in LEARN phase writes to `$HOLOCRON_MEMORY_DIR/LEARNING/REFLECTIONS/` — this directory won't exist until M7 defines the MEMORY/ structure. Add `mkdir -p` guard or scaffold the path in M7 setup.

---

## Milestone 5 — Skills & Commands ✅
*Domain-specific capabilities and slash commands that give the agent leverage.*

- Port PAI skill files from `$HOLOCRON_DIR/skills/` into `skills/` ✅
- Adapt `USE WHEN` frontmatter for OpenCode's skill loading model ✅
- Substitute PAI-specific paths (`$HOLOCRON_DIR/` → `$HOLOCRON_DIR/`, `$HOLOCRON_MEMORY_DIR/` → `$HOLOCRON_MEMORY_DIR/`) ✅
- Remove `PAI/USER/SKILLCUSTOMIZATIONS` loading blocks (no Holocron equivalent yet) ✅

**Skills ported (11):** acli, ContentAnalysis, Investigation, mermaid, op-1password, playwright-cli, Research, Scraping, Security, Thinking, Utilities

**Skills removed post-port:** Media (Art + Remotion) — removed in commit `5f850b7`'s follow-up; not needed yet. Source is intact at `$HOLOCRON_DIR/skills/Media/` and can be re-ported from there when media creation workflows are needed.

**Skills deferred (PAI-specific):** Telos (private data repo dependency), USMetrics (FRED/EIA API tooling), Agents (PAI agent persona system)

**Deferred to later milestone:** Slash commands (`/commit`, `/review-pr`) — no source commands in `~/.config/opencode/commands/`; build from scratch when workflow patterns are established

---

## Milestone 6 — Personal Context Loading ✅
*What makes it personal — relationship memory, learning signals, and active work injected at session start.*

- Design `HOLOCRON_MEMORY_DIR` env var convention pointing to private memory repo ✅ _(M6 — convention already documented in MEMORY_CONTRACT.md; install.sh surfaces it)_
- Write `holocron-context-loader` plugin to read and inject at session start: ✅ _(M6 — `plugins/holocron-context-loader/holocron-context-loader.ts`)_
  - Relationship memory (`memory/MEMORY.md`) ✅
  - Active work summary (most recent PRD from `WORK/`) ✅
  - User identity / preferences (`memory/IDENTITY.md`) ✅
  - _(Learning signals deferred to M8 — requires `LEARNING/REFLECTIONS/` to exist)_
- Plugin auto-wired via `install.sh` plugin entry point symlink ✅ _(M6)_
- Validate context appears correctly in the agent's first response ✅ _(validated via local Node.js compilation and memory block injection test in session)_

---

## Milestone 7 — Memory & Work Tracking ✅
*Persistent capture of work, learning, and decisions across sessions.*

- Install Simple Memory plugin for learning/relationship captures ✅ _(lean on `holocron-context-loader` instead — Simple Memory plugin removed)_
- Write `pai-prd` plugin: PRD stub creation + frontmatter sync to `work.json` ✅ _(`plugins/holocron-prd/`)_
- Scaffold the `$HOLOCRON_MEMORY_DIR` directory structure per `MEMORY_CONTRACT.md` — create `WORK/`, `LEARNING/REFLECTIONS/`, `STATE/` in the private memory repo ✅
- Validate work sessions are tracked and retrievable ✅

---

## Milestone 7.5 — PRD ↔ OpenCode Todo Integration
*Sync ISC criteria from PRD.md into OpenCode's native Todo system so criteria show up as first-class tasks in the TUI.*

> **Blocked — no plugin write API for todos.** The OpenCode SDK exposes `client.session.todo()` as a GET-only endpoint. Plugins cannot create or update todos programmatically — only the AI's built-in `todowrite` tool can write them. The `todo.updated` event fires when the AI writes todos (observable via the `event` hook), but there is no inverse write path from plugin → todo store.
>
> **Viable approach when unblocked:** The only path forward without an upstream API change is prompt injection — `experimental.chat.system.transform` injects a directive telling the AI to call `todowrite` with the current PRD criteria at session start. This is prompt-based, not programmatic, and degrades gracefully (AI may not always comply). Gate behind `HOLOCRON_TODO_SYNC=true` in a config file.
>
> **Revisit when:** OpenCode adds a `todo.write` or `todo.upsert` SDK method, or exposes a `tool` hook that allows plugins to call `todowrite` directly.

- ~~Research the OpenCode Todo API~~ ✅ _(done — GET only, no plugin write path)_
- Update `holocron-prd` plugin to inject a prompt directive to sync PRD criteria as todos at session start _(deferred — prompt-only approach, low reliability)_
- Gate behind `HOLOCRON_TODO_SYNC` config variable, enabled by default
- Map ISC checkbox state to todo status: `- [ ]` → pending, `- [x]` → completed
- Preserve existing todos not owned by holocron-prd (match by a `holocron:` prefix or tag on the todo title)
- Validate: writing a PRD criterion in the agent results in a visible todo in the TUI
- Validate: checking off a criterion in the PRD marks the corresponding todo complete

---

## Milestone 8 — Learning Feedback Loop ✅
*Ratings, sentiment capture, and reflection — the flywheel that improves the system over time.*

- Write `holocron-learning-capture` plugin: ✅ _(`plugins/holocron-learning-capture/`)_
  - Explicit rating detection from user prompts ✅ _(regex matches `N/10`, `rate: N`, `rating: N`, `score: N`)_
  - In-process keyword heuristic for implicit sentiment ✅ _(correction → 3, positive → 8; no external API needed)_
  - Append to `LEARNING/SIGNALS/ratings.jsonl` ✅ _(JSONL format matching PAI schema)_
  - Learning write trigger on ratings ≤ 4 ✅ _(writes `.md` to `LEARNING/CAPTURES/YYYY-MM/`)_
- Port Algorithm reflection JSONL format ✅ _(already live in LEARN phase bash echo; `LEARNING/REFLECTIONS/` scaffolded in M7)_
- Validate signals accumulate across sessions ✅ _(verified live: `3/10` message produced correct JSONL entry and `.md` capture)_
- **Develop mechanism to apply learnings back to agent/memory structure** _(deferred — requires human review workflow; captured in DECISIONS.md for future milestone)_
- `install.sh` scaffolds `LEARNING/SIGNALS/` and `LEARNING/CAPTURES/` ✅
- `MEMORY_CONTRACT.md` updated with new paths ✅
- 21 unit tests, all passing ✅

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

---

## Milestone 3 — Safety Baseline
*Minimum security guardrails before any real work happens in the harness.*

> **Deferred:** Moved to end of queue. OpenCode's native confirmation prompts on destructive operations provide baseline safety. Revisit when real incidents surface a specific gap.

- Install CC Safety Net — intercepts destructive git/filesystem commands before execution
- Verify OpenCode launches cleanly with Holocron symlinked in ✅ _(already verified as part of M4 work)_

---

## Feature — Worktree Isolation & Background Delegation
*Parallel agent execution is native in OpenCode (multiple `agent` tool calls in one message). What's missing is worktree isolation for file-safe parallelism and true background/async delegation.*

- Evaluate `kdcokenny/opencode-worktree` — creates isolated git worktrees and auto-spawns terminals; assess fit for Algorithm BUILD phase when multiple agents need to edit different files simultaneously
- Evaluate `SpillwaveSolutions/parallel-worktrees` — runs subagents across worktrees then syncs; relevant for `/batch`-style multi-file work
- Evaluate `kdcokenny/opencode-background-agents` — async delegation with results persisted to `~/.local/share/opencode/delegations/` as markdown; assess UX for long-running tasks
- Update `algorithm.md` Platform Capabilities table once a worktree solution is installed
- _(Blocked on M9 plugin evaluation pass)_

---

## Feature — Code Review Agent (/simplify equivalent)
*PAI's /simplify runs 3 agents reviewing quality, reuse, and efficiency after code changes. No OpenCode equivalent exists.*

- Define a hidden custom agent `reviewer` in Holocron's agent config — read-only (Plan permissions), focused on code quality, reuse, and efficiency
- Trigger: primary agent invokes `@reviewer` after BUILD/EXECUTE phases on any code-producing Algorithm run
- Optionally add a `/review` custom command that wraps the agent invocation for user-facing use
- Update `algorithm.md` guidance to recommend invoking `@reviewer` as a near-default on code-producing runs (mirrors the `/simplify should be near-default` guidance from PAI)

---

## Feature — Cross-Platform Voice & Notifications
*`voice.sh` and VoiceServer are the canonical notification layer. Ensure they work everywhere.*

The algorithm leans on `voice.sh` for all phase announcements. Current state: Mac-only (ElevenLabs + macOS notification center). Before v1.0.0, harden for all target platforms:

- **Linux**: Verify ElevenLabs curl works; replace macOS notification call with `notify-send` or equivalent
- **Windows**: `install.ps1` exists but voice.sh is bash — port announcement logic to PowerShell or add a Windows-native wrapper script
- **No-server fallback**: When VoiceServer is not running, `voice.sh` should degrade gracefully (silent, no crash) rather than surfacing a curl error to the agent
- **Harness-agnostic path**: `algorithm.md` currently hardcodes `~/.opencode/scripts/voice.sh` — update to use `$HOLOCRON_DIR/scripts/voice.sh` once a `HOLOCRON_DIR` env var convention is established (avoids assuming `~/.opencode` is always the harness dir)
- **Test matrix**: Mac + ElevenLabs running, Mac + server down, Linux, Windows

---

## Milestone 13 — Memory Feed Sidebar
*Live memory write feed in a Ghostty split pane — a sidebar equivalent for the OpenCode TUI.*

> **Context:** The OpenCode TUI right-panel (Context / LSP) has no plugin extension API. The `LayoutConfig` type exists but only controls `"auto" | "stretch"` — no custom widget or panel injection is possible. This milestone implements the next best thing: a Ghostty split pane that renders a live feed of every file the agent writes to `$HOLOCRON_MEMORY_DIR`, giving the same visibility without waiting for upstream TUI API changes.

- Write `plugins/holocron-memory-feed.ts` — listens on `file.edited` events, appends a timestamped entry to `/tmp/holocron-memory-feed.log` for every write inside `$HOLOCRON_MEMORY_DIR` ✅
- Write `scripts/memory-feed.sh` — tail renderer: reads the log file, formats entries with color and short relative paths, suitable for a narrow Ghostty split ✅
- Ghostty split wiring: document the keybind / startup command to open the feed pane alongside opencode ✅ _(documented in script header)_
- Validate: writing a memory file inside an opencode session produces a visible, formatted line in the feed pane in real time

---

## Milestone 12 — Testing & CI
*Validating complex state manipulation independently of the harness APIs.*

- Introduce a monorepo setup (e.g. standard NPM workspaces or simple Lerna) for sub-projects inside `plugins/` ✅ _(root `package.json` with npm workspaces covering both plugins)_
- Set up **Vitest** as the global test runner for all typescript plugins ✅ _(Vitest in root devDeps + per-plugin test scripts)_
- Set up a testing harness to mock `$HOLOCRON_MEMORY_DIR` for memory interactions safely ✅ _(tests use `os.tmpdir()` + `randomUUID()` for isolated temp dirs)_
- Write unit tests for `holocron-prd` covering PRD stub creation and frontmatter sync logic ✅ _(`plugins/holocron-prd/tests/index.test.ts` — parseFrontmatter, generateSlug, buildPrdStub, syncToWorkJson)_
- Write unit tests for `holocron-context-loader` covering `buildContextBlock` extraction logic ✅ _(`plugins/holocron-context-loader/tests/index.test.ts` — buildContextBlock, getMostRecentPRD; required promoting to a proper package)_
- Create integration tests or bash-test validators for `scripts/voice.sh` and install scripts _(deferred — lower value than plugin tests)_
- Establish a GitHub Actions CI pipeline to run `npm run test` against all commits ✅ _(`.github/workflows/ci.yml` — ubuntu-latest, Node 20, push + PR on main)_

---

## Milestone 14 — Context Injection Upgrades (OMO Cherry-Picks)
*Three high-leverage features from Oh My OpenCode (OMO) that provide massive autonomy and surgical context injection without requiring a multi-model orchestration engine.*

- **The "Ralph Loop" (Session Continuation Enforcer):** ✅ Write a plugin that hooks into `experimental.text.complete`. When the agent completes a response, scan the text (outside code fences) for incomplete markdown checkboxes (`- [ ]`) or `in_progress` keywords. If found, silently inject a continuation prompt via `client.tui.appendPrompt` + `client.tui.submitPrompt` to force the agent to finish all tasks before stopping. Controlled by `$HOLOCRON_MEMORY_DIR/settings/holocron.settings.json` (`ralph_loop.enabled`). 20 unit tests. _(plugin: `plugins/holocron-ralph-loop/`)_
- **Hierarchical Context (`AGENTS.md` Injection):** ✅ Write a plugin that hooks into `tool.execute.after` for the `read` tool. When a file is read, walk up its directory tree looking for local `AGENTS.md` files. Append any found (not yet injected this session) to the tool output, giving the agent directory-specific rules only when it actually reads from that directory. Deduplication via session-scoped Set. Max walk depth 20. 19 unit tests. _(plugin: `plugins/holocron-agents-loader/`)_
- **Conditional Glob Rules:** ✅ Write a plugin that hooks into `tool.execute.after` for the `read` tool. Discovers rule files from `{projectRoot}/.opencode/rules/*.md` at init. Each rule file has YAML frontmatter with a `globs:` array. When the agent reads a file whose path matches any glob, the rule body is appended to the tool output. Deduplication via session-scoped Set. Glob matching via Node built-in `path.matchesGlob`. 29 unit tests. _(plugin: `plugins/holocron-glob-rules/`)_
