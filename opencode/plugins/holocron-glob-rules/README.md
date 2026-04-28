# holocron-glob-rules

> Conditional glob rules — injects file-type-specific behavioral standards into context the moment the agent reads a matching file.

Part of [Holocron](../../README.md) — Milestone 14: Context Injection Upgrades.

---

## What it does

At plugin init, discovers all rule files in `{projectRoot}/.opencode/rules/*.md`. Each rule file declares which file patterns it applies to via a `globs:` frontmatter array. When the agent reads any file, this plugin checks whether that file matches any rule's globs — and if so, appends the rule content to the tool result.

This gives the agent file-type-specific behavioral standards **lazily and surgically** — only when they're relevant — without bloating the root `AGENTS.md` with rules that only apply to one part of the codebase.

---

## Rule file format

Create `.md` files in `.opencode/rules/` with YAML frontmatter:

```markdown
---
globs:
  - "**/*.tsx"
  - "**/*.jsx"
description: React component standards
---

# React Component Standards

Always use functional components. Never use class components.
Export components as named exports, not default exports.
...
```

Both block list and inline array formats are supported:

```yaml
# Block list (recommended)
globs:
  - "**/*.tsx"
  - "**/*.jsx"

# Inline array
globs: ["**/*.tsx", "**/*.jsx"]
```

---

## Example rules

| Rule file | `globs:` | Fires when reading... |
|---|---|---|
| `react-standards.md` | `["**/*.tsx", "**/*.jsx"]` | Any React component |
| `api-conventions.md` | `["**/routes/**/*.ts"]` | Any route handler |
| `test-patterns.md` | `["**/*.test.ts", "**/*.spec.ts"]` | Any test file |
| `sql-safety.md` | `["**/*.sql", "**/migrations/**"]` | Any SQL or migration file |

---

## Deduplication

Each rule file is injected **at most once per session**, regardless of how many matching files the agent reads. A session-scoped `Set<string>` keyed by rule file path tracks what's been injected.

---

## Hook

Uses `tool.execute.after` on the OpenCode `read` tool. Appends matching rule content to `output.output` — the string the model sees as the tool result. This is semantically equivalent to `noReply: true` context injection: content enters the model's context without appearing as a user message in the TUI.

---

## Glob matching

Uses Node's built-in `path.matchesGlob()` (Node 22+) — zero external dependencies.

---

## Tests

```bash
bun test tests/
```

29 tests covering: frontmatter parsing (block list, inline array, missing, malformed), rule loading (missing dir, empty dir, no-globs skip, non-md skip), glob matching, formatting, and deduplication.
