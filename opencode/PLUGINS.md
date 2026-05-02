# Plugin Reference

> **Rule:** Before building any capability from scratch, check whether a well-supported plugin already covers the scope. Install plugins just-in-time — when the work demands it, not speculatively.

Plugin research source: [awesome-opencode](https://github.com/awesome-opencode/awesome-opencode)

---

## Installed

| Plugin | Milestone | Why |
|--------|-----------|-----|
| CC Safety Net | M3 | Intercepts destructive git/filesystem commands before execution |

---

## Evaluated — Deferred

These have been researched and are worth installing when the right work comes up.

| Plugin | Install when... |
|--------|----------------|
| **Envsitter Guard** | Blocking agent `.env` access becomes a concern (security-sensitive projects) |
| **Dynamic Context Pruning** | Sessions consistently running long or hitting context limits |
| **opencode-snip** | Workflows are CLI-heavy and token costs on shell output are noticeable |
| **Oh My OpenCode Slim** | Pre-built subagent delegation (Explorer, Librarian, Designer) would save build time |
| **Worktree** | Frequent parallel branch work makes manual `git worktree` painful |
| **Morph Fast Apply** | Large-file edits are slow and the Morph API is available |
| **Direnv** | Working with Nix flakes or per-project env var isolation |
| **Simple Memory** | Persistent cross-session memory is needed before M7 custom solution is built |
| **Pilot** | Linear ticket auto-spawning would be useful (requires Linear integration) |
| **Tokenscope** | Token usage and cost tracking becomes important |
| **Opencode Ignore** | Working in a large monorepo where file noise is a problem |

---

## Evaluated — Skip

| Plugin | Reason |
|--------|--------|
| Oh My OpenCode (full) | Duplicates Slim at higher token cost — use Slim |
| Antigravity Auth / Gemini Auth | Superseded by Antigravity Multi-Auth |
| Agent Memory / Opencode Mem | Overlaps with Simple Memory — pick one |
| Opencode Notify / Smart Voice Notify / ntfy.sh | Covered by Holocron's own VoiceServer |
| Opencode Quota / Context Analysis / opencode-mystatus | Tokenscope is more comprehensive — use that |
| Agent Skills / Opencode Skills / Openskills | Native skills system is sufficient |
| open-plan-annotator + Plannotator | Duplicates; open-plan-annotator wins if needed |
| UNMOJI, Smart Title, Zellij Namer, Model Announcer | No functional value |
| Warcraft Notifications, Ring a Bell Example | Novelty only |
| Ralph Wiggum | Superseded by proper subagent orchestration |
| Agent Identity | Only useful for complex multi-agent debugging |
| Opencode Canvas | Terminal calendars, not a coding tool |
