# Quickstart: Unified Config Store Validation (spec 001)

End-to-end validation scenarios. Run after the corresponding story lands (each is the story's Independent Test) and all together at the end (Polish). Machine: macOS, bash ≥ 4, `$HOLOCRON_DIR` = this repo, `$HOLOCRON_MEMORY_DIR` set.

## S0 — Baseline (before migration)

```bash
bash install.sh --check          # expect: drift table (settings PRECEDENCE, stale pointers), exit 1
```
Expected: today's known drift appears — `~/.claude/settings.json` → repo template while `$HOLOCRON_MEMORY_DIR/settings.json` exists; opencode pointers present.

## S1 — Apply + idempotency (US5, SC-004)

```bash
bash install.sh                  # expect: CREATED/REPAIRED lines for every converging pointer
bash install.sh                  # expect: "no changes"
```

## S2 — Drift drill (US5, SC-005)

```bash
mv ~/.pi/agent/APPEND_SYSTEM.md /tmp/   # or point one link at a stale file
bash install.sh --check          # expect: exit 1, table row MISSING (or STALE)
bash install.sh                  # expect: REPAIRED line for that pointer
bash install.sh --check          # expect: exit 0, CLEAN
```

## S3 — One file, two harnesses (US1, SC-002)

1. Add a unique marker line to `instructions/AGENTS.md`, e.g.
   `<!-- HOLocrON-MARKER-001: <random-8-chars> -->` (keep it — it is the permanent marker).
2. Claude Code: new session (or `/resume` + ask), prompt:
   *"What is the canonical location of the global instructions, and quote the line containing HOLocrON-MARKER-001 verbatim."*
   Expect: `instructions/AGENTS.md` + exact marker (proves `@`-import expansion).
3. pi: new session, same prompt.
   Expect: same answer + marker (proves the `~/.pi/agent/AGENTS.md` symlink).
4. One-harness-rule test: change a Claude-only rule in `claude/CLAUDE.md` and a pi-only rule in `pi/APPEND_SYSTEM.md`; confirm `instructions/AGENTS.md` is untouched and each change is visible only in its harness.

## S4 — Skill add drill (US2, SC-003, SC-006)

```bash
mkdir -p skills/demo-skill
printf -- '---\nname: demo-skill\ndescription: "Demo skill. USE WHEN demo validation."\n---\n\n# Demo\n' > skills/demo-skill/SKILL.md
bash install.sh                  # claude: whole-dir symlink; pi: extension path
```
- Claude session: skill listed (ask the agent to list skills / check `~/.claude/skills/demo-skill` is a dir symlink).
- pi session: skill listed; startup shows **zero** skill-name warnings (SC-006).
- `ls ~/.pi/agent/skills 2>/dev/null` → does not exist (FR-007).
- Cleanup: remove `skills/demo-skill` and the live symlink, re-run `install.sh`.

## S5 — Grep sweeps (SC-001, SC-007, SC-008)

```bash
# one canonical instruction file (SC-001)
grep -rln "Execution Modes" --include="*.md" . | grep -v specs/ | grep -v DECISIONS
# expect: only instructions/AGENTS.md (+ adapters may *reference*, not redefine)

# single algorithm.md (SC-001)
find . -name "algorithm.md" -not -path "./specs/*"
# expect: instructions/algorithm.md + commands/algorithm.md (prompt, not the doc) — no claude/instructions/

# agents at exactly one path (SC-001)
find . -name "Engineer.md" -not -path "./specs/*"
# expect: agents/Engineer.md only

# gone (SC-007)
ls pi/skills claude/instructions opencode ~/.pi/agent/skills 2>&1 | grep -c "No such file"   # expect 4

# resolves to one canonical file (SC-007)
head -1 ~/.claude/CLAUDE.md          # expect @…/instructions/AGENTS.md import
readlink ~/.pi/agent/AGENTS.md       # expect repo instructions/AGENTS.md

# OpenCode removal (SC-008)
grep -ri opencode --exclude-dir=.git . \
  | grep -v "specs/001-unified-config-store" | grep -v "DECISIONS.md" \
  | grep -v "constitution" | grep -vi "histor"
# expect: no live adapter content
ls -la ~/.config/opencode/           # expect: no Holocron symlinks (R8 result applied)
```

## S6 — Reflection round-trip (US3)

Run `/reflect` in either harness; confirm the updated learnings land in `instructions/algorithm.md` (the single file) and `claude/instructions/` does not exist to diverge.

## S7 — Fresh-clone dry run (US7 AS3)

```bash
SCRATCH=$(mktemp -d); export HOME=$SCRATCH        # sandboxed HOME
bash install.sh && bash install.sh --check        # expect: clean wiring, then CLEAN
# then run S3 marker prompts against both harnesses
rm -rf $SCRATCH
```
(Only needed for the final sign-off; optional during development.)
