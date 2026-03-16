# Decision Log

Key architectural and design decisions made while building Holocron. Captured so I can revisit the reasoning later and talk through the tradeoffs.

---

## Format

Each entry has:
- **Date** — when the decision was made
- **Decision** — what was decided
- **Options considered** — what else was on the table
- **Rationale** — why this one

---

## 2026-03-15

### Simple Memory Plugin OpenCode Entry Point

- **Decision** — Created `plugins/simple-memory/index.ts` to re-export the `@knikolov/opencode-plugin-simple-memory` package rather than adding the plugin as a flat file or expecting OpenCode to discover it from `node_modules` alone.
- **Options considered** — Changing the symlink structure in `install.sh`, using an OpenCode configuration for explicit loading, or using an `index.js`.
- **Rationale** — OpenCode plugin discovery from directories requires an entry file (`index.ts` or `index.js`) at the directory root. Since we bundle the plugin in `node_modules` inside `plugins/simple-memory`, this shim file is the most idiomatic way to expose the external npm package to the OpenCode engine.

---

## 2026-03-14


### Port voice server vs use OpenCode notification plugin

**Decision:** Port the full PAI VoiceServer (Bun/ElevenLabs TTS) into Holocron rather than relying on the OpenCode Smart Voice Notify plugin.

**Options considered:**
- Use Smart Voice Notify plugin — already exists, zero-effort integration, but limited to OS notifications with no TTS and no per-voice persona control
- Port PAI voice server — more work, but carries over the full 3-tier voice resolution, emotional presets, pronunciation system, and 5-level volume control

**Rationale:** The voice system is a core part of the PAI experience, not a nice-to-have. Smart Voice Notify handles OS banners but not ElevenLabs TTS, so it can't replicate the persona voice behavior (engineer vs architect vs default voice per agent). Porting the full server also keeps the voice system harness-agnostic — it runs as a standalone Bun service at `localhost:8888` that any harness can curl.

---

### Config isolation: config.json instead of settings.json

**Decision:** Voice config lives in `VoiceServer/config.json` (or `$HOLOCRON_VOICE_CONFIG`) rather than inside a settings.json file.

**Options considered:**
- Read from `~/.opencode/settings.json` — mirrors PAI's `~/.config/opencode/opencode.json` pattern but ties config to a specific harness
- Read from `~/.holocron/config.json` — harness-agnostic but adds another dotfolder
- Read from `VoiceServer/config.json` local to the repo — self-contained, ships with sensible defaults via `config.json.example`, overridable via env var

**Rationale:** Keeping config local to the `VoiceServer/` directory means the voice system is self-contained. No harness needs to know about it. The `config.json.example` pattern makes setup obvious on a new machine without leaking personal voice IDs into the public repo.

---

## 2026-03-15

### Plugin file structure — flat file in plugins/

**Decision:** Plugin source lives as a flat `.ts` file directly in `plugins/` (e.g., `plugins/holocron-context-loader.ts`), not in a subdirectory.

**Options considered:**
- Subdirectory per plugin (`plugins/holocron-context-loader/holocron-context-loader.ts`) — better organization for multi-file plugins, but OpenCode discovers plugins by scanning files directly in the plugins directory (not recursively), so subdirectory files are invisible without extra install.sh symlink logic
- Subdirectory + install.sh entry point symlink — works but creates a symlink inside the repo (because `~/.config/opencode/plugins/` is already symlinked to `Holocron/plugins/`), producing a confusing loop
- Flat file per plugin at `plugins/holocron-context-loader.ts` — simple, picked up automatically by the existing directory symlink, no extra wiring needed

**Rationale:** The existing `plugins/` directory symlink already makes all flat files in `plugins/` visible to OpenCode at `~/.config/opencode/plugins/`. Adding subdirectories and install.sh entry-point logic adds complexity that backfires (creates symlinks inside the repo). Flat files are the right fit for OpenCode's discovery model. If a plugin grows large enough to need multiple files, extract shared logic to a separate helper and import it.

---

### M6 context injection mechanism — session.created + tui.prompt.append

**Decision:** Use `session.created` to trigger context loading and `tui.prompt.append` to inject it into the user's first prompt. Use `experimental.session.compacting` to re-inject context on compaction.

**Options considered:**
- OpenCode Rules (context files) — simpler, but static; can't read from `$HOLOCRON_MEMORY_DIR` dynamically at session start
- `session.created` + custom tool — inject a tool the agent calls; more explicit but requires the agent to voluntarily call it
- `session.created` + `tui.prompt.append` — fires before first user message; context appears in the conversation without requiring agent action
- OpenViking MCP server — correct long-term answer but alpha-stage (see MEMORY_CONTRACT.md)

**Rationale:** `tui.prompt.append` is the least-friction injection point — context prepends to the user's first message automatically, so the agent sees it without any special instruction. The compaction hook ensures context survives context window resets. This matches the PAI pattern where CLAUDE.md is injected at every session start.

---

## 2026-03-13


### Two-repo structure: public config + private memory

**Decision:** Split into two repos — `Holocron` (public, shareable config) and a private memory repo — connected via symlinks and an `OPENCODE_MEMORY_DIR` env var.

**Options considered:**
- Single repo with `.gitignore` guarding private files — simpler but one accidental push exposes everything
- Monorepo with git submodule for private memory — works but submodules are painful
- Two fully separate repos, symlinked at install time — clean separation, same pattern PAI uses

**Rationale:** Mirrors the PAI pattern (`pai-context` private + `Personal_AI_Infrastructure` public) which has proven itself. Clean separation by design means there's no mechanism by which private memory can leak into the public repo. Symlinks keep the runtime experience seamless.

---

### Harness-agnostic design

**Decision:** Build Holocron to work across any agent harness, not tied to OpenCode specifically.

**Options considered:**
- OpenCode-specific — simpler to build, but becomes throwaway work if the tool changes
- Claude Code-specific — already have PAI for this; no point duplicating
- Harness-agnostic — more upfront design work, but the core (skills, commands, instructions) is portable by nature

**Rationale:** The agent harness landscape is moving fast. The valuable part of this system is the accumulated skills, context, and behavioral rules — not the plugin glue. Design the core to be portable so it survives tool changes. Plugin adapters for specific harnesses are thin wrappers around that core.

---

### PAI as foundation, not fork

**Decision:** Use Personal AI Infrastructure as inspiration and reference, not as a codebase to fork.

**Options considered:**
- Fork PAI and adapt it — starts with everything but carries PAI's Claude Code assumptions
- Rebuild from scratch ignoring PAI — wastes research; PAI has solved hard problems worth learning from
- Use PAI as a reference architecture, build Holocron independently — clean slate with informed decisions

**Rationale:** PAI is tightly coupled to Claude Code (hooks, `settings.json`, `CLAUDE.md` generation). Forking it means inheriting that coupling. Building independently while referencing PAI's architecture means Holocron can be genuinely harness-agnostic from day one, while still standing on PAI's shoulders for the hard design questions.

## 2026-03-15

### Context Loader Validation Approach

- **Decision** — Validated `holocron-context-loader.ts` via an isolated Node.js simulation script checking the logic of `buildContextBlock` and `getMostRecentPRD` against a scaffolded temporary test memory directory.
- **Options considered** — Booting a headless OpenCode session with a full test plugin configuration.
- **Rationale** — The logic of the context formatting and discovery was mostly pure JS, testing it using a standalone `fs` and `process.env` mock script correctly verified the behavior without the complex and brittle setup of a sub-harness integration test run within the same harness context.
## 2026-03-15

### Enforcing Absolute Paths for Memory

- **Decision** — The instructions in `algorithm.md` and `AGENTS.md` will be updated to explicitly demand the resolution of `$HOLOCRON_MEMORY_DIR` into an absolute path prior to filesystem operations.
- **Options considered** — Leaving it up to the agent's interpretation of environment variables.
- **Rationale** — The system prompt explicitly instructs the agent to construct absolute paths using the project root (`$PWD`). Without explicit overriding instructions to utilize the memory directory environment variable, agents will inherently write PRDs and learning JSONLs into the local repository being worked on.


## 2026-03-15

### holocron-prd plugin architecture

- **Decision** — The `holocron-prd` plugin is scaffolded as a TypeScript project in `plugins/holocron-prd/` with its own `package.json` rather than a flat file in `plugins/`.
- **Options considered** — Flat file like `holocron-context-loader.ts`.
- **Rationale** — This plugin requires more complex file I/O and state management. Giving it a proper structure allows for easier testing, dependencies (if needed later), and separation of concerns compared to a single monolithic flat file.

## 2026-03-15

### Testing Strategy

- **Decision** — Defer full unit testing and CI setup into a dedicated roadmap milestone (Milestone 12).
- **Options considered** — Immediate implementation using `ts-node` or `jest` on a per-plugin basis (e.g. just for `holocron-prd`).
- **Rationale** — Holocron is an amalgamation of bash scripts, a standalone TS application (`VoiceServer`), flat TS plugins (`holocron-context-loader`), and fully built TS projects (`holocron-prd`). An ad-hoc testing solution for just one of these ignores the repository architecture. A formal test runner setup (e.g., Vitest inside an NPM workspace) should be established universally so the entire stack can be verified locally and within GitHub Actions before releasing v1.0.0.

---

## 2026-03-15

### M12 monorepo tooling: npm workspaces + Vitest over Lerna/Jest

- **Decision** — Use a root `package.json` with npm workspaces pointing at `plugins/holocron-prd` and `plugins/holocron-context-loader`, with Vitest as the global test runner.
- **Options considered** — (1) Lerna monorepo: more features but significant overhead for 2 packages. (2) Jest: works but requires `ts-jest` transform config and slower cold start vs Vitest. (3) Per-package independent test setups with no root coordination: no `npm test` from root, harder to add CI.
- **Rationale** — npm workspaces is zero-dependency (built into npm 7+) and handles hoisting correctly for 2 packages. Vitest is ESM-native, requires no transform config for TypeScript via `skipLibCheck`, and is significantly faster than Jest. The root `npm test` running Vitest with `--reporter=verbose` gives a single command for both local dev and CI.

### M12 holocron-context-loader promoted to proper package

- **Decision** — Moved `plugins/holocron-context-loader.ts` (flat file) into `plugins/holocron-context-loader/src/index.ts` with its own `package.json`, matching the structure of `holocron-prd`.
- **Options considered** — Keep it as a flat file and test via a root-level barrel import; test only via integration (boot a real OpenCode session).
- **Rationale** — The flat file has no exports — `buildContextBlock` and `getMostRecentPRD` were unexported local functions. Without extracting them, unit testing is impossible. Promoting to a proper package with explicit exports is the minimal change that makes the logic testable without touching the OpenCode plugin interface. The install.sh `plugins/` symlink still works — OpenCode sees the directory the same way.

### M12 switched from npm + Vitest to bun install + bun test

- **Decision** — Use `bun install` for dependency resolution and `bun test` as the test runner across all packages. Vitest removed entirely.
- **Options considered** — (1) Keep Vitest + npm: ran into `@rollup/rollup-darwin-arm64` optional dep hoisting bug that npm workspaces doesn't resolve reliably on Apple Silicon. (2) Keep Vitest, switch to bun install only: would fix the install bug but Vitest still pulls rollup as a dependency. (3) Full bun switch: eliminates rollup entirely, `bun test` uses the same Jest-compatible `describe`/`it`/`expect` API so test code required only a one-line import swap (`from "vitest"` → `from "bun:test"`).
- **Rationale** — VoiceServer already runs on Bun — it's not a new tool. Bun's resolver handles platform-native optional deps correctly. `bun test` is faster (53ms for 24 tests vs ~1s+ cold start for Vitest), zero config, and the API is compatible. The CI switch to `oven-sh/setup-bun` is one-line. No downsides identified for a repo of this size.

---

## 2026-03-15

### M7.5 — OpenCode Todo write API is not available to plugins

- **Observation** — The OpenCode SDK (`@opencode-ai/plugin` v1.2.15, `@opencode-ai/sdk`) exposes `client.session.todo()` as a GET-only endpoint. There is no `todo.create`, `todo.update`, or `todo.upsert` method in either the v1 or v2 SDK. Todos are written exclusively by the AI's built-in `todowrite` tool. A plugin can observe changes via `event.type === "todo.updated"` but cannot initiate writes. Confirmed by exhaustive search of all `.d.ts` files in both SDK packages — no write path exists.
- **Implication** — M7.5 (PRD criteria → OpenCode Todo sync) cannot be implemented as a true bidirectional plugin. The only available approach is prompt injection: `experimental.chat.system.transform` injects a directive asking the AI to call `todowrite` with current PRD criteria — but this is prompt-based and not guaranteed.

### M7.5 — OpenCode TUI has no plugin extension API

- **Observation** — The full `Hooks` interface in `@opencode-ai/plugin` contains no panel, widget, sidebar, or layout extension point. TUI-related SDK types are limited to: `tui.prompt.append`, `tui.command.execute`, `tui.toast.show`, `tui.session.select` (v2 only). The `LayoutConfig` type exists but is deprecated and only covers `"auto" | "stretch"` for the existing layout — not custom panels. A plugin cannot render any custom UI element inside the OpenCode TUI.
- **Implication** — A live PRD criteria panel inside the OpenCode TUI is not buildable with the current plugin API surface.

### M13 — memory feed via generic `event` hook, not `file.edited` string key

- **Decision** — `holocron-memory-feed.ts` subscribes via the generic `event` hook (filtering `event.type === "file.edited"`) rather than a `"file.edited"` string key in the `Hooks` interface.
- **Options considered** — Using `"file.edited"` as a direct hook key (matches the docs example syntax); using the generic `event` hook.
- **Rationale** — The typed `Hooks` interface in `@opencode-ai/plugin` does not include `"file.edited"` as a named key. Only the generic `event` hook is in the type definition. Using the untyped string key compiles but produces a TS type error and could silently break across SDK upgrades. The `event` hook receives all event types; filtering by `event.type === "file.edited"` is type-safe against the `EventFileEdited` union member in `@opencode-ai/sdk`.

### M13 — `file.edited` event shape: `properties.file`, not `properties.filePath`

- **Decision** — The plugin reads the path from `event.properties.file` (not `filePath`).
- **Options considered** — `properties.filePath` (used in the docs example); `properties.file` (the actual SDK type).
- **Rationale** — `EventFileEdited` in `types.gen.d.ts` is `{ type: "file.edited"; properties: { file: string } }`. The docs example uses `filePath` which is incorrect or outdated. Verified against the generated types.

### Decision — Defer TUI extension and alternative frontend investigation to a future milestone

- **Decision** — Do not pursue a custom TUI panel or alternative frontend application for PRD tracking at this time. Defer to a future milestone once the OpenCode plugin surface matures or a standalone tool is warranted.
- **Options considered** — (1) External watcher script (`scripts/prd-watch.sh`) rendering a live criteria dashboard in a second terminal pane — viable but adds operational friction (must open a second pane manually). (2) Standalone web UI reading `WORK/` directly — decoupled but significant scope for marginal gain. (3) Wait for OpenCode to add a `tui.panel` hook — most elegant, zero Holocron code required.
- **Rationale** — The existing `STATE/work.json` sync (M7) and the agent's native TodoWrite tool already provide adequate work visibility within the current workflow. Building a parallel UI before the pain is felt concretely would be premature. Revisit when: (a) OpenCode adds a panel extension API, (b) the number of simultaneous PRDs makes terminal-only tracking genuinely painful, or (c) Holocron is used by more than one person.

---

## 2026-03-15

### Add Claude Code as a supported harness

- **Decision** — Added `claude-code` to the `HARNESSES` map in `install.sh` targeting `~/.config/Claude`, and added a `link_file` block to symlink `instructions/AGENTS.md` to `~/.config/Claude/AGENTS.md`.
- **Options considered** — (1) Keep Claude Code unsupported and maintain a separate manual copy of AGENTS.md. (2) Create a separate `install-claude-code.sh` script. (3) Add it directly to the existing `HARNESSES` map alongside opencode.
- **Rationale** — Claude Code reads its global instruction file from `~/.config/Claude/AGENTS.md` and injects it into every session via the system prompt. Without this symlink, Holocron's behavioral rules (execution modes, algorithm reference, memory location rules) are not loaded when using Claude Code. Adding it to the existing harness map keeps install.sh as the single source of truth for all harness targets — consistent with the harness-agnostic design principle.

---

## 2026-03-16

### Remove stale "Claude Code" references from skills

- **Decision** — Corrected all skill files that incorrectly attributed OpenCode-native tools and behaviors to Claude Code. Updated 9 files across BrightData, Recon, AudioEditor, Browser, Delegation, and Evals skills. Renamed `parseClaudeCodeTranscript` → `parseOpenCodeTranscript` in TranscriptCapture.ts. Did NOT change references in DECISIONS.md, README.md, MEMORY_CONTRACT.md, or install.sh, which legitimately discuss Claude Code as one of multiple supported harnesses.
- **Options considered** — (1) Change every occurrence of "Claude Code" including the legitimate multi-harness mentions. (2) Change only the incorrect skill-level references that imply OpenCode tools/behaviors belong to Claude Code.
- **Rationale** — The stale references mislead the agent about which harness it is running on, potentially causing incorrect tool invocations (e.g., `claude --chrome` does not exist in OpenCode). References describing Claude Code as a supported harness alongside OpenCode are accurate and intentional — those were preserved.

### Replace stale `~/.claude` paths with correct OpenCode/Holocron equivalents

- **Decision** — Replaced all `~/.claude/*` path references across 41 files with their correct equivalents based on the following mapping: `~/.claude/History/research/` → `$HOLOCRON_MEMORY_DIR/RESEARCH/`, `~/.claude/History/learnings/` → `$HOLOCRON_MEMORY_DIR/LEARNING/CAPTURES/`, `~/.claude/History/Backups/` → `$HOLOCRON_MEMORY_DIR/BACKUPS/`, `~/.claude/agents/` → `~/.config/opencode/agents/`, `~/.claude/MCPs/` → `$HOLOCRON_DIR/tools/MCPs/`, `~/.claude/Plugins/` → `~/.config/opencode/plugins/`, `~/.claude/filesystem-mcps/` → `$HOLOCRON_DIR/tools/filesystem-mcps/`, `~/.claude/Bin/` → `$HOLOCRON_DIR/tools/bin/`, `~/.claude/Templates/` → `$HOLOCRON_DIR/tools/templates/`, `~/.claude/Skills/` → `$HOLOCRON_DIR/skills/`, `~/.claude/commands/` → `~/.config/opencode/commands/`, `~/.claude/settings.json` → `~/.config/opencode/opencode.json`, `~/.claude/CLAUDE.md` → `~/.config/opencode/AGENTS.md`. Also updated `osint-api-tools.py` to prefer `$HOLOCRON_DIR` env var over legacy `$PAI_DIR` fallback.
- **Options considered** — (1) Leave paths as `~/.claude` and document that users must symlink. (2) Replace with `$HOLOCRON_DIR` / `$HOLOCRON_MEMORY_DIR` / `~/.config/opencode` per path type.
- **Rationale** — Skills are instructions given to the agent at runtime. A path like `~/.claude/agents/` points to a directory that does not exist on an OpenCode setup — the agent would fail to find or create the referenced files. Using `$HOLOCRON_DIR`, `$HOLOCRON_MEMORY_DIR`, and `~/.config/opencode` gives the agent the correct locations per Holocron's actual directory contract (see `MEMORY_CONTRACT.md`). The `filesystem-mcps/` and `tools/bin/` paths are not yet ported to Holocron; using `$HOLOCRON_DIR/tools/` as the target establishes where they should live when ported.

### Roadmap Milestone 14 — OMO Context Injection Cherry-Picks

- **Decision** — Added Milestone 14 to the roadmap targeting three specific features from Oh My OpenCode: the Ralph Loop (session continuation enforcer), Hierarchical `AGENTS.md` context injection, and Conditional Glob rules.
- **Options considered** — (1) Switch to OMO entirely. (2) Build an elaborate multi-model orchestration system in Holocron to match OMO. (3) Identify the highest-leverage single-agent UX improvements and port them via standard OpenCode plugins.
- **Rationale** — OMO's core value proposition (multi-model orchestration) requires a fundamentally different harness architecture and multiple provider API keys. However, its context injection and continuation features provide massive UX improvements without requiring multi-model routing. OpenCode's native Plugin API (`session.idle`, `tool.execute.before`, and `noReply` prompting) fully supports building these three features as standalone TS plugins that drop cleanly into Holocron's existing architecture.

### M14 Ralph Loop — hook choice and settings file location

- **Decision** — Use `experimental.text.complete` hook (not `session.idle`, which does not exist in the SDK Hooks interface). Settings live at `$HOLOCRON_MEMORY_DIR/settings/holocron.settings.json`, not in the Holocron repo itself.
- **Options considered** — (1) `session.idle` hook — does not exist in `@opencode-ai/plugin` Hooks interface as of v1.2.26. (2) `chat.message` hook — fires on user messages, not assistant completions; wrong direction. (3) `experimental.text.complete` — fires after each assistant response part completes; correct hook for post-response scanning. Settings location options: (a) `$HOLOCRON_DIR/holocron.settings.json` — version-controlled in the repo, not personal; (b) `$HOLOCRON_MEMORY_DIR/settings/holocron.settings.json` — personal, backed up in the private memory repo per user request.
- **Rationale** — `experimental.text.complete` is the only hook that fires after the assistant finishes a response and provides the completed text for scanning. Placing settings in `$HOLOCRON_MEMORY_DIR/settings/` keeps personal configuration out of the repo (appropriate for a multi-user config system) and co-locates it with other personal memory data where it will be included in backups.

### M14 Ralph Loop — infinite loop guard design

- **Decision** — Use a sentinel string `HOLOCRON_RALPH_LOOP` embedded in the continuation prompt. If the completed text contains the sentinel, skip re-triggering.
- **Options considered** — (1) Module-level boolean flag `lastWasRalphLoop` — unreliable across async turns; race conditions possible. (2) Per-session message ID tracking — requires stateful map, complex cleanup. (3) Sentinel in the injected prompt text — the continuation prompt itself contains the sentinel, so the next `text.complete` scan will detect it and skip. Zero shared state required.
- **Rationale** — The sentinel approach is stateless, deterministic, and self-documenting. The continuation prompt being scanned for incomplete work will always contain `HOLOCRON_RALPH_LOOP`, so the guard is guaranteed to fire correctly without any timing or state management concerns.

---

## 2026-03-16

### M14.2 Hierarchical AGENTS.md — hook strategy: `tool.execute.after` over `tool.execute.before`

- **Decision** — Use `tool.execute.after` (appending to `output.output`) instead of `tool.execute.before` with `noReply: true` injection.
- **Options considered** — (1) `tool.execute.before` with `noReply: true` — the ROADMAP described this, but `noReply` does not exist in the OpenCode Plugin SDK `Hooks` interface as of v1.2.26; `tool.execute.before` only exposes mutable `output.args`. (2) `experimental.chat.system.transform` — adds content to the system prompt on every request, not scoped to when specific files are read; would inject all discovered AGENTS.md globally rather than on-demand. (3) `tool.execute.after` with `output.output` mutation — the tool result string that the model sees; appending AGENTS.md content here gives the model the rules as part of the read result, exactly when it reads from that directory.
- **Rationale** — `tool.execute.after` output mutation is the correct semantic equivalent of `noReply: true` context injection: the content appears in the model's context as a tool result, not as a user message, with zero TUI visibility. It is on-demand (fires only when files are read) and file-scoped (only for the specific directory tree being accessed). The SDK surface confirms `output.output` is a mutable string in the `tool.execute.after` signature.

### M14.2 Hierarchical AGENTS.md — deduplication scope: session-level Set

- **Decision** — Use a module-level `Set<string>` keyed by absolute AGENTS.md path. Each unique path is injected at most once per session lifetime.
- **Options considered** — (1) Per-call dedup (no memory) — re-injects on every file read from the same directory; high token cost for busy sessions. (2) TTL-based cache — adds complexity without clear benefit; AGENTS.md content rarely changes mid-session. (3) Session-level Set — simple, zero overhead, correct: AGENTS.md for a directory is injected the first time the agent touches that directory, then never again.
- **Rationale** — Session-level dedup matches the expected UX: the agent learns the rules for a directory once, keeps them in context, and is not spammed with re-injections. The Set is cleared implicitly by process restart (new session = fresh process for plugins loaded by OpenCode).

---

## 2026-03-16 (M14.3)

### M14.3 Conditional Glob Rules — hook strategy: `tool.execute.after` over `tool.execute.before` + `noReply`

- **Decision** — Use `tool.execute.after` (appending to `output.output`) instead of `tool.execute.before` with `noReply: true`.
- **Options considered** — (1) `tool.execute.before` + `noReply: true` — the ROADMAP described this approach, but `noReply` does not exist in the OpenCode Plugin SDK `Hooks` interface as of v1.2.26; `tool.execute.before` only exposes mutable `output.args`, not an injection channel. (2) `experimental.chat.system.transform` — injects into the system prompt on every LLM request, not scoped to when specific file types are read; would always inject all matched rules rather than on-demand. (3) `tool.execute.after` with `output.output` mutation — appends to the tool result string the model sees; gives the agent the rules as part of the file read result, exactly when a matching file type is accessed.
- **Rationale** — Same as M14.2: `tool.execute.after` output mutation is the correct semantic equivalent of `noReply: true`. The content enters model context as a tool result without TUI visibility, is on-demand, and is file-scoped.

### M14.3 Conditional Glob Rules — glob matching: Node built-in `path.matchesGlob` over external library

- **Decision** — Use `path.matchesGlob(path, pattern)` from Node's built-in `path` module. Zero external dependencies.
- **Options considered** — (1) `minimatch` / `micromatch` / `picomatch` npm packages — battle-tested, widely used, but require an extra dep; none were pre-installed in the workspace. (2) `path.matchesGlob` — added in Node 22, available in Node 23.7.0 in use; supports `**` patterns correctly; marked experimental but stable enough for a local agent harness plugin. (3) Manual regex — fragile, error-prone for `**` semantics.
- **Rationale** — Zero external dependencies keeps the plugin lean and install-script-free. The experimental warning is acceptable given the controlled environment (personal harness, not a published npm package).

### M14.3 Conditional Glob Rules — rule discovery: init-time scan over per-read scan

- **Decision** — Discover and parse all rule files once at plugin init (`loadRules` called in plugin factory). Rules are held in memory for the session lifetime.
- **Options considered** — (1) Per-read scan — re-reads `rules/` on every file read; correct if rules change mid-session but high I/O cost. (2) Init-time scan — reads once; changes to rule files require harness restart to take effect, which is acceptable for a configuration artifact.
- **Rationale** — Rule files are configuration, not data. They change infrequently and deliberately. Init-time scanning trades mid-session mutability (not needed) for zero per-read overhead (always desirable).
