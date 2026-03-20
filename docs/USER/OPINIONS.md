# User Opinions and Preferences

This file tracks explicit user preferences and high-confidence opinions. The system automatically loads opinions marked with a confidence of 0.85 or higher into the relationship context at session startup.

### GitHub CLI account routing

Personal (`personalProjects/`) repos require `gh` authenticated as `breissingerj`. All other repos (Lahzo, work) require `gh` authenticated as `jbreissinger`. Switch with `gh auth switch --user ...` before performing GitHub operations.
**Confidence:** 0.95
**Source:** memory/MEMORY.md

### Linear over Jira

We use Linear, not Jira. Use Linear for all issue tracking. Linear ticket descriptions must be concise (problem state + expected final state only), and implementation plans belong in the conversation, not the ticket body.
**Confidence:** 0.95
**Source:** memory/MEMORY.md

### Linear Ticket Format

Linear tickets must always include a `## Acceptance Criteria` section with testable criteria, and an `## Accepted By` section with checkboxes: `- [ ] Engineering`, `- [ ] PM`, `- [ ] Design`.
**Confidence:** 0.95
**Source:** memory/MEMORY.md

### PR Title Format

PR titles must follow the format: `[TICKET-123] Title` (e.g., `[FUN-16] feat(promeniq): validate clinic open/closed status`).
**Confidence:** 0.95
**Source:** memory/MEMORY.md

### Version bump PRs

Always run `pnpm i` after updating versions and include the resulting lockfile changes in the commit.
**Confidence:** 0.95
**Source:** memory/MEMORY.md

### Commits to work repos

Always review changes in code editor (VSCode) before committing. Do not auto-commit unless explicitly told to. Open modified repos in VSCode using `code /path/to/repo`.
**Confidence:** 0.90
**Source:** memory/MEMORY.md

### Pre-modification branching

Before making code changes, always pull latest main (`git checkout main && git pull`), then create a new branch (`git checkout -b branch-name`) — unless told otherwise.
**Confidence:** 0.95
**Source:** memory/MEMORY.md

### PR reviews

Present PR review findings in the conversation only — never post them directly to GitHub unless explicitly asked.
**Confidence:** 0.95
**Source:** memory/MEMORY.md

### Diagram Rendering

Use Mermaid CLI (`npx -p @mermaid-js/mermaid-cli mmdc -i diagram.mmd -o diagram.png`) instead of Figma for diagram requests. Always output the `.mmd` file first, then render.
**Confidence:** 0.90
**Source:** memory/MEMORY.md
