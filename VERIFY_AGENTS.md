# Agent Wiring Verification Prompt

## Single-Source Architecture

Holocron maintains **one canonical agent directory**, `agents/` (Claude Code frontmatter: `model`, `tools`, `skills`, `permissionMode`), symlinked per-file into `~/.claude/agents/` by `install.sh`. There is no per-harness variant, generator, or second copy — the old `claude/agents/` + `opencode/agents/` dual-maintenance rule is retired (spec 001, 2026-08-31). pi does not consume this directory; its native agent roster lives separately in `pi/agents/` (untouched, hand-maintained).

**Drift check:** `bash install.sh --check` reports any stale, dangling, or missing agent symlink under `~/.claude/agents/` without changing anything (exit 0 = clean, 1 = drift found).

---

Use this prompt in a Claude Code session after the agents are symlinked (`bash install.sh`) to confirm they are loaded and routing correctly.

---

## Verification Prompt

```
I want to verify that the named agents are correctly wired into this session. Please do the following:

1. List every agent you can see defined in your agents directory. For each one, tell me:
   - File name
   - `name` field from frontmatter
   - `description` field from frontmatter (first sentence only)
   - `model` field
   - Whether `tools` are defined (yes/no)

2. Confirm the following agents are present by name (these are required):
   - Architect
   - Engineer
   - Designer
   - QATester
   - Pentester
   - ClaudeResearcher
   - GeminiResearcher
   - GrokResearcher
   - PerplexityResearcher
   - CodexResearcher
   - Artist
   - BrowserAgent
   - UIReviewer
   - Algorithm
   - ContextEngineer

3. Attempt to invoke the Engineer agent for a trivial task: ask it what testing philosophy it follows. It should mention TDD and the red-green-refactor cycle.

4. Report any agents that are missing, have malformed frontmatter, or failed to load correctly.
```

---

## What to look for

| Check | Pass | Fail |
|-------|------|------|
| All 15 agents listed | All names appear | Any missing → symlink broken; run `install.sh --check` |
| `description` readable | Meaningful text | Empty or `null` → frontmatter YAML parse error |
| Engineer answers TDD | Mentions red-green-refactor | Wrong → wrong file loaded or context file missing |

---

## Manual spot-check (bash)

```bash
bash install.sh --check    # expect: no agent-related drift rows, exit 0
ls -1 ~/.claude/agents/
readlink ~/.claude/agents/Engineer.md   # expect: <repo>/agents/Engineer.md
```

Expected output (15 files):
```
Algorithm.md
Architect.md
Artist.md
BrowserAgent.md
ClaudeResearcher.md
CodexResearcher.md
ContextEngineer.md
Designer.md
Engineer.md
GeminiResearcher.md
GrokResearcher.md
Pentester.md
PerplexityResearcher.md
QATester.md
UIReviewer.md
```
