# Agent Wiring Verification Prompt

## Dual-Harness Architecture

Holocron maintains **two parallel agent directories**, one per harness:

| Directory | Harness | Symlinked to | Schema |
|---|---|---|---|
| `agents/opencode/` | OpenCode | `~/.config/opencode/agents/` | OpenCode frontmatter (`color`, `voiceId`, `voice`, `persona`, `permission`) |
| `agents/claude/` | Claude Code | `~/.claude/agents/` | Claude Code frontmatter (`model`, `tools`, `skills`, `permissionMode`) |

**Both directories must stay in behavioral sync.** When you change an agent's description, system prompt, methodology, or core behavior in one directory, apply the equivalent change to the same agent in the other directory.

**What stays the same across both:**
- `name` — must match exactly (Claude Code uses it for delegation)
- `description` — must match exactly (used for routing in both harnesses)
- The entire body (character backstory, startup sequence, output format, methodology)

**What differs between the two:**
- Frontmatter only — OpenCode uses `color`/`voiceId`/`voice`/`persona`/`permission`; Claude Code uses `model`/`tools`/`skills`

**Dual-maintenance rule:** Any commit that touches a file in `agents/opencode/` should also touch the corresponding file in `agents/claude/` — and vice versa. If you intentionally update only one side, note it in the commit message.

---


Use this prompt in opencode after the agents are symlinked to confirm they are loaded and routing correctly.

---

## Verification Prompt

Paste this into an opencode session:

```
I want to verify that the named agents are correctly wired into this session. Please do the following:

1. List every agent you can see defined in your agents directory. For each one, tell me:
   - File name
   - `name` field from frontmatter
   - `description` field from frontmatter (first sentence only)
   - `model` field
   - Whether a `voiceId` is present (yes/no)
   - Whether `permissions` are defined (yes/no)

2. Confirm the following agents are present by name (these are required):
   - Architect (Serena Blackwood)
   - Engineer (Marcus Webb)
   - Designer
   - QATester
   - Pentester (Rook Blackburn)
   - ProductManager (Jordan Mercer)
   - ClaudeResearcher
   - GeminiResearcher
   - GrokResearcher
   - PerplexityResearcher
   - CodexResearcher
   - Artist
   - BrowserAgent
   - UIReviewer
   - Algorithm

3. Attempt to invoke the ProductManager agent for a trivial task: ask it to tell you the name of Jack's Linear team and the default ticket status. It should answer "Funnel Team (FUN)" and "Triage" without you providing that information.

4. Attempt to invoke the Engineer agent for a trivial task: ask it what testing philosophy it follows. It should mention TDD and the red-green-refactor cycle.

5. Report any agents that are missing, have malformed frontmatter, or failed to load correctly.
```

---

## What to look for

| Check | Pass | Fail |
|-------|------|------|
| All 15 agents listed | All names appear | Any missing → file wasn't copied or has a parse error |
| `description` readable | Meaningful text | Empty or `null` → frontmatter YAML parse error |
| `voiceId` present | `yes` for all except Algorithm | `no` → frontmatter stripped or file corrupted |
| ProductManager answers FUN/Triage | Correct | Wrong → loaded the old slim `pm.md` stub instead of `ProductManager.md` |
| Engineer answers TDD | Mentions red-green-refactor | Wrong → wrong file loaded or context file missing |

---

## Manual spot-check (bash)

If you want to verify the files are present before running the prompt:

```bash
ls -1 ~/.config/opencode/agents/
```

Expected output (15 files, no `pm.md`):
```
Algorithm.md
Architect.md
Artist.md
BrowserAgent.md
ClaudeResearcher.md
CodexResearcher.md
Designer.md
Engineer.md
GeminiResearcher.md
GrokResearcher.md
Pentester.md
PerplexityResearcher.md
ProductManager.md
QATester.md
UIReviewer.md
```

`pm.md` should NOT appear. If it does, the old stub is still present and will conflict.
