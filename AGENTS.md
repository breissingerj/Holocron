# Holocron Repo — Agent Instructions

## Spec Before Work (MANDATORY)

This repo uses [GitHub spec-kit](https://github.com/github/spec-kit) for spec-driven development. Non-trivial work **must be specified before implementation commences.**

- Before starting a feature, refactor, or other non-trivial change, run `/speckit-specify` to create a baseline specification, then `/speckit-plan` and `/speckit-tasks` to derive an implementation plan and task list.
- Only skip this for trivial, single-file, low-risk changes (typo fixes, doc tweaks, config value bumps).
- spec-kit scaffolding lives in `.specify/` (templates, memory, scripts, workflows) and `.claude/skills/` (Claude-specific slash commands: `/speckit-constitution`, `/speckit-specify`, `/speckit-plan`, `/speckit-tasks`, `/speckit-implement`, `/speckit-converge`, plus optional `/speckit-clarify`, `/speckit-analyze`, `/speckit-checklist`).

## Decision Recording (MANDATORY)

Any non-trivial decision made while working in this repo **must be recorded in `DECISIONS.md`** before the work is considered complete.

A decision is non-trivial if any of the following apply:
- It involves a tradeoff between two or more viable approaches
- It changes the structure, format, or contract of an existing system
- It affects how other files, scripts, or agents reference or depend on this repo
- It could reasonably be questioned or revisited in the future

### Format

Append a new entry to `DECISIONS.md` using this structure:

```markdown
## YYYY-MM-DD

### [Short title of the decision]

- **Decision** — what was decided
- **Options considered** — what else was on the table
- **Rationale** — why this one
```

Do not skip this step. If you finish the work and have not written a DECISIONS.md entry for any non-trivial choice made during execution, go back and write it.
