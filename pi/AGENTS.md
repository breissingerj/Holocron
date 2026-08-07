# Global Agent Instructions

These instructions apply to every pi session, regardless of project or working directory.

---

## Memory — Graphiti Knowledge Graph

**Graphiti is the persistent memory store for this agent.** All facts, preferences, decisions, and context worth retaining across sessions must be written to and read from Graphiti.

### Backend Toggle — `HOLOCRON_MEMORY_BACKEND`

Graphiti (`graphiti-mcp.breissinger.dev`) is home-hosted. On networks that block resolving or routing to it (e.g. a locked-down corp network), set:
```bash
export HOLOCRON_MEMORY_BACKEND=files
```
With this set, the `graphiti-memory` extension registers **no** `graphiti_*` tools for the session — so don't attempt to call them; they won't exist. Instead, **`$HOLOCRON_MEMORY_DIR` becomes the source of truth**:

- **Reading context / "what did we decide about X"** — If `obsidian` MCP tools are available, use `search_notes` first with a targeted query and small result limit, then inspect excerpts or metadata before reading only selected notes. Fall back to targeted `grep`/Read across `$HOLOCRON_MEMORY_DIR/memory/*.md` only when no memory MCP is available.
- **Writing a new fact/preference/decision** (in place of `graphiti_add`) — append it under the relevant `## heading` in `memory/MEMORY.md`, or to the most relevant topic file in `memory/*.md` if one exists (e.g. `lahzo-org.md`, `behavioral-corrections.md`). Keep entries in the same terse bullet style already used in those files. `memory/MEMORY.md` is auto-primed into every session's system prompt by `holocron-memory.ts`, so writes there are immediately visible next session with no extra query step.
- **Correcting a fact** (in place of `graphiti_delete_entity_edge` / `graphiti_delete_episode`) — edit or remove the bullet directly in the markdown file.
- Commit memory file changes per the `MEMORY_CONTRACT.md` convention (`git add -A && git commit -m "session memory $(date +%Y-%m-%d)" && git push` in `$HOLOCRON_MEMORY_DIR`) so nothing is lost across machines.

Unset `HOLOCRON_MEMORY_BACKEND` (or set it to `graphiti`) and run `/reload` once the Graphiti endpoint is reachable again to restore normal Graphiti-backed operation — nothing about the Graphiti setup itself is removed by toggling this off.

**Mid-session fallback:** if a `graphiti_*` tool call fails with a network/fetch error while the backend is nominally enabled (var unset), don't keep retrying — tell the user Graphiti appears unreachable, suggest `export HOLOCRON_MEMORY_BACKEND=files`, and fall back to the file-based read/write behavior above for the rest of the session.

### When to Write (`graphiti_add`)

Always call `graphiti_add` when the user:
- Says "remember", "note that", "save this", or any explicit store request
- States a preference, rule, or workflow convention
- Makes a non-obvious architectural or design decision
- Establishes project context, team structure, or naming conventions
- Corrects a prior assumption or updates a previously stored fact

Also call `graphiti_add` proactively when you discover something worth retaining:
- Key facts about the codebase or infrastructure
- Recurring patterns in how the user wants work done
- Important constraints or gotchas uncovered during execution

**Default group:** `jbreissinger` (omit `group` parameter to use it).

**Always include:**
- `source_description` — brief provenance, e.g. `"user conversation"`, `"code review"`, `"standup notes 2026-06-16"`
- `name` — a short human-readable label for the episode

### When to Read (`graphiti_search` / `graphiti_search_nodes`)

Always query Graphiti **before** acting on requests that reference:
- Past decisions, preferences, or context ("like we discussed", "the way we do it")
- Project-specific conventions that may not be in the current repo
- People, teams, tools, or organizations the user mentions

Use **`graphiti_search`** for specific facts and events ("what did we decide about X?").
Use **`graphiti_search_nodes`** for entity summaries ("what do you know about X?").

Use targeted queries — `"Jack editor preference"` not `"preferences"`.

Facts have `valid_at` / `invalid_at` timestamps. A null `invalid_at` means the fact is currently true.

### Correcting Memory

- Use `graphiti_delete_entity_edge` for surgical removal of a single wrong fact.
- Use `graphiti_delete_episode` when an entire episode is incorrect (cascades to derived entities).
- Always inspect with `graphiti_get_entity_edge` or `graphiti_get_episodes` before deleting.
- When a retrieved fact contradicts the user, flag the conflict, ask for clarification, and update Graphiti accordingly.

---

## Task Tracking — TillDone

**TillDone is the task list tool for this agent.** Every session that involves tool use requires tasks to be defined before any other tool is called.

### Task Classification

A TillDone list is **always required** before any tool use. When creating a new list, classify the request into one of three execution modes (definitions in `Holocron/claude/CLAUDE.md` → Execution Modes) — the mode determines the **format** of the list:

| Mode | When | List format |
|------|------|-------------|
| **Minimal** | Pure acknowledgments, ratings, confirmations | No structural requirements |
| **Native** | Single-step, quick tasks (under ~2 minutes) | No structural requirements |
| **Extended** | Multi-step, complex, or difficult work | Required structure — see below |

### Extended Mode — Required List Structure

For Extended tasks, the TillDone list must follow this structure:

1. **Memory prime** — Query Graphiti for relevant context before any work begins (see Graphiti → When to Read)
2. **Plan** — Determine the full set of steps needed; populate the remainder of the list from this step's output
3. *(work tasks derived from the plan)*
4. **Learn** — Final step: write any new facts, decisions, or preferences discovered during execution to Graphiti (see Graphiti → When to Write)

Extended tasks are also the appropriate place to invoke the Algorithm (see `Holocron/claude/CLAUDE.md` → ALGORITHM MODE).

### List Lifecycle

- **New request / new topic** → call `tilldone new-list` with a short title and description to start a fresh list. Use this when the user's request represents a discrete unit of work that doesn't belong to whatever was being tracked before.
- **Follow-on tasks or questions within the same topic** → call `tilldone add` (or `tilldone add` with `texts[]` for batch) to append to the existing list. Do **not** create a new list just because a new sub-task appeared.
- **Rule of thumb:** one list per coherent goal. If the user asks a follow-up, clarification, or extension of what's already in progress, add to the list. If the conversation pivots to a clearly different topic or project, start a new list.

### Task State

- Toggle a task to `inprogress` before starting work on it.
- Toggle it to `done` when finished.
- Never call a tool on behalf of a task without first marking it `inprogress`.

---

### Index Maintenance

After the **first** `graphiti_add` to any new group, immediately call `graphiti_build_indices` with that group name. This is idempotent — safe to re-run.
