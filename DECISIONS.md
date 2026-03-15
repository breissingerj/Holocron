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
- Read from `~/.opencode/settings.json` — mirrors PAI's `~/.claude/settings.json` pattern but ties config to a specific harness
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
