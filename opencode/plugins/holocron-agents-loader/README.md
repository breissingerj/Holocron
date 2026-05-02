# holocron-agents-loader

> Hierarchical context injection — injects local `AGENTS.md` (or `CLAUDE.md`) rules into the agent's context window the moment it reads a file from that directory.

Part of [Holocron](../../README.md) — Milestone 14: Context Injection Upgrades.

---

## What it does

When the agent reads any file, this plugin walks upward through the file's directory tree looking for context rule files. Any found (that haven't been injected yet this session) are appended to the tool result, giving the agent directory-specific rules exactly when — and only when — it accesses that part of the codebase.

**Example:** reading `src/components/Button.tsx` will inject rules from:
1. `src/components/AGENTS.md` (or `CLAUDE.md`) if present
2. `src/AGENTS.md` (or `CLAUDE.md`) if present
3. `AGENTS.md` (or `CLAUDE.md`) at the project root if present

Each file is injected **at most once per session**, so re-reading files in the same directory doesn't repeat the rules.

---

## Context file priority

Two filenames are supported at each directory level, checked in this order:

| Priority | Filename | When used |
|----------|----------|-----------|
| 1 | `AGENTS.md` | Always preferred — used by OpenCode, Cursor, and other harnesses natively |
| 2 | `CLAUDE.md` | Fallback — used by teams that use Claude Code conventions |

**If both exist in the same directory, `AGENTS.md` wins and `CLAUDE.md` is ignored for that level.** This allows gradual migration: a repo using `CLAUDE.md` conventions works out of the box, and individual directories can be upgraded to `AGENTS.md` as needed.

---

## Walk behavior

- Starts at the directory containing the file being read
- Walks upward one level at a time toward the filesystem root
- Stops at root or after 20 levels (whichever comes first)
- Returns results bottom-up: most specific (deepest) directory first

---

## Deduplication

Each unique context file path is tracked in a module-level `Set`. Once injected, it won't fire again for the rest of the session — even if the agent reads many files from the same directory. This prevents rule spam on large sessions.

---

## Hook

Uses `tool.execute.after` on the OpenCode `read` tool. Appends content to `output.output` — the string the model sees as the tool result. This is semantically equivalent to `noReply: true` context injection: the content enters the model's context without appearing as a user message in the TUI.

---

## Tests

```bash
bun test tests/
```

27 tests covering: walk behavior, CLAUDE.md fallback, priority logic, deduplication, graceful error handling, and edge cases.
