---
description: Extract a solved problem into a searchable solution card for future retrieval
---

You are running the Compound workflow. This command documents a problem that was just solved so future sessions can find and reuse the solution instead of re-deriving it from scratch.

Run this after completing any non-trivial task — especially after a bug fix, a tricky implementation, a design decision, or anything that required research to solve.

---

## PHASE 1 — UNDERSTAND THE PROBLEM

Read the current session's PRD (most recent in `$HOLOCRON_MEMORY_DIR/WORK/`) and the conversation transcript to understand:

- What was the original problem or question?
- What made it non-trivial? Where was the friction?
- What context was needed to solve it (codebase patterns, external docs, prior decisions)?

Output:

**Problem:** [1-2 sentence description of what was broken or unknown]
**Why it was hard:** [What made this non-trivial — ambiguity, missing context, tradeoffs]

---

## PHASE 2 — EXTRACT THE SOLUTION

Identify exactly what worked:

- What was the specific fix, approach, or decision?
- What alternatives were considered and rejected?
- What's the reusable insight — the part that will help next time?

Output:

**Solution:** [Concrete description of what was done]
**Alternatives rejected:** [What else was on the table and why it lost]
**Reusable insight:** [The part worth remembering — a pattern, a rule, a gotcha]

---

## PHASE 3 — CLASSIFY FOR DISCOVERY

Choose a category that will make this findable:

| Category | Use when |
|----------|----------|
| `architecture` | System design decisions, component structure, dependency choices |
| `debugging` | Bug fixes, root causes, error patterns |
| `integration` | Third-party services, APIs, external tools |
| `workflow` | Process improvements, agent patterns, command designs |
| `algorithm` | Algorithm changes, ISC patterns, phase improvements |
| `security` | Security findings, validation patterns, auth decisions |
| `performance` | Bottlenecks fixed, caching, query optimization |
| `tooling` | Build system, scripts, hooks, CI/CD |
| `data` | Schema decisions, migration patterns, data modeling |
| `other` | Doesn't fit above — use a descriptive tag |

Output:

**Category:** [chosen category]
**Tags:** [3-5 lowercase keywords for search, comma-separated]

---

## PHASE 4 — WRITE THE SOLUTION CARD

Write a solution card to:

```
$HOLOCRON_MEMORY_DIR/RESEARCH/solutions/{category}/{YYYYMMDD}_{kebab-problem-description}.md
```

Create the directory if it doesn't exist.

### Solution Card Format

```markdown
---
date: YYYY-MM-DD
category: {category}
tags: [tag1, tag2, tag3]
problem: {one-line problem description}
prd: {slug of source PRD if available}
---

# {Problem Title}

## Problem

{1-2 paragraphs describing the problem and why it was non-trivial}

## Solution

{Concrete description of what was done. Include code snippets, file paths, or commands if relevant.}

## Why This Works

{The underlying reason — the insight that makes this more than just a fix}

## Alternatives Considered

- **{Option A}** — {why it was rejected}
- **{Option B}** — {why it was rejected}

## Watch Out For

{Any gotchas, edge cases, or follow-up risks worth noting}
```

---

## PHASE 5 — VERIFY FINDABILITY

After writing the card, confirm:

- [ ] File written to the correct `solutions/{category}/` directory
- [ ] YAML frontmatter is valid (date, category, tags, problem, prd)
- [ ] Problem description is specific enough to match a future search
- [ ] Tags cover the likely search terms someone would use
- [ ] "Watch Out For" section exists if there are any gotchas

Output the file path of the written card.

---

## Usage Examples

After fixing a subtle auth bug:
```
/compound
```

After designing a new hook pattern:
```
/compound
```

After a tricky database migration:
```
/compound
```

The command reads context automatically from the current session — no arguments needed.
