---
task: Deduplicate framework files between holocron and holocron-context
slug: 20260320-170000_dedup-holocron-docs
effort: standard
phase: observe
progress: 0/7
mode: interactive
started: 2026-03-20T17:00:00Z
updated: 2026-03-20T17:00:00Z
---

## Context
A recent migration task (`20260320-164000_migrate-pai-v4-0-3-to-holocron`) copied the entirety of the PAI v4.0.3 documentation, tools, and structural config into the local `holocron-context/Holocron/` directory.

However, an investigation reveals significant duplicate effort and broken file paths:
1. **Duplicate Effort**: The `Holocron` harness repository (`/Users/jbreissinger/Projects/personalProjects/Holocron`) already tracks these exact framework files in its `docs/` and `tools/` directories.
2. **Path Misalignment**: The migrated files in `holocron-context` were placed in `Holocron/` (not `PAI/`), but their content hardcodes `~/.config/opencode/PAI/` which leads to broken paths.
3. **Repository Responsibility Boundaries**: `holocron-context` is the active memory/state repository (for `WORK/`, `LEARNING/`, `STATE/`, and `USER/` config), while `Holocron` is the framework codebase (for `plugins/`, `skills/`, `tools/`, and framework `docs/`). Mixing framework code into the context repository creates a split-brain architecture.

### Risks
- Divergence of framework documentation between the `Holocron` harness and the `holocron-context` repository.
- Broken internal links causing ALGORITHM tools to fail (e.g., trying to read `~/.config/opencode/PAI/Tools/algorithm.ts` when it's actually in `/Users/jbreissinger/Projects/personalProjects/Holocron/tools/algorithm.ts`).
- Accidental deletion of user-specific files during deduplication.

## Criteria
- [ ] ISC-1: Delete duplicate framework `.md` files from `holocron-context/Holocron/` that already exist in `Holocron/docs/`
- [ ] ISC-2: Delete duplicate framework tools from `holocron-context/Holocron/Tools/` that belong in the harness `Holocron/tools/`
- [ ] ISC-3: Retain the `holocron-context/Holocron/USER/` directory as it contains valid user-specific context
- [ ] ISC-4: Update paths in `Holocron/docs/` to replace `PAI/` with `docs/` where referencing framework documentation
- [ ] ISC-5: Update paths in `Holocron/docs/` to replace `~/.config/opencode/PAI/Tools/` with `$HOLOCRON_DIR/tools/`
- [ ] ISC-6: Update `holocron-context/Holocron/README.md` to clarify the separation of concerns between the two repositories
- [ ] ISC-7: Verify that `holocron-context/MILESTONES.md` reflects this deduplication plan

## Decisions

## Verification
