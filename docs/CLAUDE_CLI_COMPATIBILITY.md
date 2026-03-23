# Claude CLI Compatibility Plan

> **Status:** Planning — not yet implemented  
> **Goal:** Make Holocron work in both OpenCode and Claude CLI (Claude Code) with zero switching friction

---

## The Core Insight

`~/.config/Claude` is already a symlink pointing to `~/.config/opencode`. Claude CLI already reads your `AGENTS.md`, `agents/`, `commands/`, and `skills/` from the same directory OpenCode uses. The instruction layer is **already shared**. The only gap is the automation layer: OpenCode uses a TypeScript plugin API; Claude CLI uses shell-based hooks in `settings.json`.

---

## What Already Works in Claude CLI (Zero Work Required)

| Component | Where it lives | Status |
|-----------|---------------|--------|
| System instructions (`AGENTS.md`) | `~/.config/Claude/` → symlink | Works — Claude CLI reads `AGENTS.md` as equivalent to `CLAUDE.md` |
| Agent definitions | `~/.config/Claude/agents/` → symlink | Works — identical format |
| Slash commands | `~/.config/Claude/commands/` → symlink | Works — `!cmd`, `$ARGUMENTS`, `@file` all work |
| Skills | `~/.config/Claude/skills/` → symlink | Works — Claude CLI's skill system reads these |
| Voice script (`voice.sh`) | `scripts/voice.sh` | Works — pure bash, no harness dependency |
| `HOLOCRON_MEMORY_DIR` env var | Shell environment | Works — available in any shell session |
| Linear MCP server | `~/.claude.json` `mcpServers` | Works — already configured at the user level |

**Do not touch the symlink.** Everything in this table is free.

---

## The Automation Gap

Holocron has six OpenCode TypeScript plugins that have no direct equivalent in Claude CLI. Each maps to a specific Claude CLI hook event. The section below gives the exact mapping, informed by how PAI (Personal AI Infrastructure) implements the same patterns in their production `settings.json`.

### OpenCode Plugin → Claude CLI Hook Event Mapping

| OpenCode hook | Claude CLI equivalent | Confidence |
|---|---|---|
| `session.created` + `tui.prompt.append` | `SessionStart` → `additionalContext` in hookSpecificOutput | High |
| `tool.execute.after` on `edit`/`write` | `PostToolUse` with `matcher: "Write\|Edit"` | High (PAI uses `PRDSync.hook.ts` this way) |
| `tool.execute.after` on `read` | `PostToolUse` with `matcher: "Read"` | High (PAI uses `SecurityValidator.hook.ts` on Read) |
| `chat.message` | `UserPromptSubmit` — stdin JSON has `prompt` field | High (PAI uses `RatingCapture.hook.ts` this way) |
| `file.edited` event | `PostToolUse` with `matcher: "Write\|Edit"` | High |
| `experimental.text.complete` + `tui.submitPrompt` | **No equivalent** — cannot fully port | Confirmed limitation |

---

## Architecture

All Claude CLI hooks go in **`~/.claude/settings.json`** (user scope — applies everywhere). Hook scripts live in **`~/.config/opencode/scripts/hooks/`** — accessible from both harnesses via the existing symlink, version-controlled in this repo, never duplicated.

The OpenCode TypeScript plugins are **not modified**. They continue to run exactly as-is when using OpenCode.

---

## Files To Create

```
~/.claude/settings.json                          ← New (Claude CLI user-scope config)
~/.claude/CLAUDE.md                              ← New (context injection via @imports)
scripts/hooks/
  session-start.sh                               ← New (replaces session.created)
  learning-capture.sh                            ← New (replaces chat.message)
  prd-sync.sh                                    ← New (replaces tool.execute.after on edit/write)
  memory-feed.sh                                 ← New (replaces file.edited)
  stop-guard.sh                                  ← New (partial Ralph Loop approximation)
```

## Files NOT Modified

```
~/.config/opencode/plugins/          ← TypeScript plugins untouched
~/.config/opencode/AGENTS.md         ← Untouched
~/.config/opencode/agents/           ← Untouched
~/.config/opencode/commands/         ← Untouched
~/.config/opencode/skills/           ← Untouched
~/.config/Claude → ~/.config/opencode  ← Symlink untouched
```

---

## Component Implementation Plans

### 1. `~/.claude/settings.json` — Foundation

This is the only Claude CLI-specific config file required. It injects `HOLOCRON_MEMORY_DIR` into every session and wires all hooks.

```json
{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "env": {
    "HOLOCRON_MEMORY_DIR": "/Users/jbreissinger/Projects/personalProjects/holocron-context"
  },
  "permissions": {
    "allow": ["Bash", "Read", "Write", "Edit", "MultiEdit", "Glob", "Grep", "WebFetch", "Task"],
    "defaultMode": "default"
  },
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup",
        "hooks": [
          {
            "type": "command",
            "command": "bash ~/.config/opencode/scripts/hooks/session-start.sh"
          }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash ~/.config/opencode/scripts/hooks/learning-capture.sh",
            "async": true
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "bash ~/.config/opencode/scripts/hooks/prd-sync.sh",
            "async": true
          },
          {
            "type": "command",
            "command": "bash ~/.config/opencode/scripts/hooks/memory-feed.sh",
            "async": true
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash ~/.config/opencode/scripts/hooks/stop-guard.sh"
          }
        ]
      }
    ]
  },
  "enableAllProjectMcpServers": true,
  "enabledMcpjsonServers": ["linear"]
}
```

**Effort:** 5 minutes — one JSON file write.

---

### 2. `~/.claude/CLAUDE.md` — Context Injection

Replaces the OpenCode `session.created` + `tui.prompt.append` mechanism for static context. Claude CLI natively loads files referenced with `@path` syntax at every session start.

```markdown
@~/.config/opencode/AGENTS.md

@/Users/jbreissinger/Projects/personalProjects/holocron-context/memory/MEMORY.md
```

This gives Claude CLI the Holocron behavioral rules and curated memory on every session without any hook code. The `session-start.sh` hook (below) handles the dynamic component (active PRD).

> **Why two mechanisms?** CLAUDE.md `@` imports are loaded before any tool use and survive context compaction. The hook adds the dynamic active-work summary that changes per session.

**Effort:** 10 minutes.

---

### 3. `scripts/hooks/session-start.sh` — Active Work Context

**Replaces:** `session.created` → `tui.prompt.append` (dynamic PRD injection in `holocron-context-loader`)  
**PAI pattern:** `LoadContext.hook.ts` on `SessionStart` (returns `additionalContext` via `hookSpecificOutput`)  
**Claude CLI hook:** `SessionStart`, `matcher: "startup"`, returns JSON with `additionalContext`

**Stdin schema:**
```json
{ "session_id": "...", "transcript_path": "...", "hook_event_name": "SessionStart", "source": "startup" }
```

**Script:**
```bash
#!/usr/bin/env bash
# Inject active PRD context at session start
# Returns additionalContext JSON consumed by Claude CLI as system context

mem_dir="${HOLOCRON_MEMORY_DIR:-}"
[ -z "$mem_dir" ] && exit 0

# Find the most recently modified PRD
prd=$(find "$mem_dir/WORK" -name "PRD.md" -exec stat -f "%m %N" {} \; 2>/dev/null \
  | sort -rn | head -1 | awk '{print $2}')
[ -z "$prd" ] && exit 0

task=$(awk '/^---/{n++} n==1 && /^task:/{sub(/^task: /,""); print; exit}' "$prd" 2>/dev/null)
phase=$(awk '/^---/{n++} n==1 && /^phase:/{print $2; exit}' "$prd" 2>/dev/null)
progress=$(awk '/^---/{n++} n==1 && /^progress:/{print $2; exit}' "$prd" 2>/dev/null)
slug=$(awk '/^---/{n++} n==1 && /^slug:/{print $2; exit}' "$prd" 2>/dev/null)

[ -z "$task" ] && exit 0

cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "Active Holocron work: \"${task}\" (phase: ${phase}, progress: ${progress}, slug: ${slug})"
  }
}
EOF
```

**Effort:** 30 minutes.

---

### 4. `scripts/hooks/learning-capture.sh` — Rating & Sentiment Capture

**Replaces:** `chat.message` hook in `holocron-learning-capture`  
**PAI pattern:** `RatingCapture.hook.ts` on `UserPromptSubmit`  
**Claude CLI hook:** `UserPromptSubmit` — stdin has `prompt` field (confirmed in PAI's THEHOOKSYSTEM docs)

**Stdin schema:**
```json
{ "session_id": "...", "transcript_path": "...", "hook_event_name": "UserPromptSubmit", "prompt": "the user's text" }
```

**Script:**
```bash
#!/usr/bin/env bash
# Capture explicit ratings and implicit sentiment from user prompts
# Equivalent to holocron-learning-capture TypeScript plugin

mem_dir="${HOLOCRON_MEMORY_DIR:-}"
[ -z "$mem_dir" ] && exit 0

# Read prompt from stdin
prompt=$(jq -r '.prompt // ""' 2>/dev/null)
session_id=$(jq -r '.session_id // "unknown"' 2>/dev/null <<< "$(cat /dev/stdin)" || echo "unknown")
# Re-read since we consumed stdin above — use process substitution
input=$(cat)
prompt=$(echo "$input" | jq -r '.prompt // ""')
session_id=$(echo "$input" | jq -r '.session_id // "unknown"')

[ -z "$prompt" ] && exit 0

# Explicit rating detection: "7/10", "rating: 8", "score: 9", "rate: 6"
rating=$(echo "$prompt" | grep -oiE '(rating|score|rate)[: ]+([1-9]|10)(/10)?' \
  | grep -oE '[1-9]|10' | head -1)

if [ -z "$rating" ]; then
  # Pattern: bare "7/10" or "8 / 10"
  rating=$(echo "$prompt" | grep -oE '\b([1-9]|10)\s*/\s*10\b' | grep -oE '[1-9]|10' | head -1)
fi

if [ -n "$rating" ]; then
  source="explicit"
  summary="Explicit rating: ${rating}/10"
else
  # Implicit sentiment detection
  if echo "$prompt" | grep -qiE '\b(wrong|incorrect|fix that|you missed|not what i (asked|wanted|meant)|please redo|stop doing|thats wrong)\b'; then
    rating=3; source="implicit"; summary="Correction signal detected"
  elif echo "$prompt" | grep -qiE '\b(perfect|exactly|great work|well done|nice work|nailed it|thats it)\b'; then
    rating=8; source="implicit"; summary="Positive signal detected"
  fi
fi

[ -z "$rating" ] && exit 0

# Write signal to ratings.jsonl
signals_dir="$mem_dir/LEARNING/SIGNALS"
mkdir -p "$signals_dir"

ts=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)
preview=$(echo "$prompt" | head -c 300 | sed 's/"/\\"/g' | tr '\n' ' ')

printf '{"timestamp":"%s","rating":%s,"session_id":"%s","source":"%s","sentiment_summary":"%s","confidence":0.9,"response_preview":"%s"}\n' \
  "$ts" "$rating" "$session_id" "$source" "$summary" "$preview" \
  >> "$signals_dir/ratings.jsonl"

# Write learning capture for low ratings (≤4)
if [ "$rating" -le 4 ] 2>/dev/null; then
  mm=$(date -u +%Y-%m)
  captures_dir="$mem_dir/LEARNING/CAPTURES/$mm"
  mkdir -p "$captures_dir"
  fname="${ts//:/-}_LEARNING_sentiment-rating-${rating}.md"
  cat > "$captures_dir/$fname" <<MDEOF
---
capture_type: LEARNING
timestamp: $ts
rating: $rating
source: $source
auto_captured: true
tags: [sentiment-detected, ${source}-rating, improvement-opportunity]
---

# ${source^} Low Rating: ${rating}/10

**Date:** $(date -u +%Y-%m-%d)
**Rating:** ${rating}/10
**Feedback:** $summary

---

## Context

$(echo "$prompt" | head -c 2000)

---
MDEOF
fi

exit 0
```

> **Note on stdin reading:** Claude CLI sends hook input to stdin once. The script above needs to read stdin into a variable first, then extract fields with `jq`. The double-read pattern shown is a known gotcha — always buffer stdin into a variable before calling `jq` multiple times.

**Effort:** 60 minutes.

---

### 5. `scripts/hooks/prd-sync.sh` — PRD Frontmatter → work.json

**Replaces:** `tool.execute.after` on `edit`/`write` in `holocron-prd`  
**PAI pattern:** `PRDSync.hook.ts` on `PostToolUse` with `matcher: "Write|Edit"` (confirmed in PAI `settings.json`)  
**Claude CLI hook:** `PostToolUse`, `matcher: "Write|Edit"`, `async: true`

**Stdin schema:**
```json
{
  "session_id": "...",
  "tool_name": "Write",
  "tool_input": { "file_path": "/path/to/PRD.md", "content": "..." },
  "tool_output": "...",
  "hook_event_name": "PostToolUse"
}
```

> **Key difference from OpenCode:** Claude CLI's `PostToolUse` stdin field is `tool_input.file_path` for both Write and Edit tools. The OpenCode plugin checked `args.filePath || args.path || args.file_path`. Use `tool_input.file_path // tool_input.path // ""` to be safe.

```bash
#!/usr/bin/env bash
# Sync PRD frontmatter to STATE/work.json on every PRD.md write or edit
# Equivalent to holocron-prd PostToolUse handler

mem_dir="${HOLOCRON_MEMORY_DIR:-}"
[ -z "$mem_dir" ] && exit 0

input=$(cat)
file_path=$(echo "$input" | jq -r '.tool_input.file_path // .tool_input.path // ""')

# Only process PRD.md files inside WORK/
[[ "$file_path" != *"PRD.md" ]] && exit 0
[[ "$file_path" != "$mem_dir/WORK"* ]] && exit 0
[ ! -f "$file_path" ] && exit 0

# Parse YAML frontmatter fields (between first two --- delimiters)
extract() { awk -v field="$1" '/^---/{n++; next} n==1 && $0~"^"field":"{sub(/^[^:]+: */,""); print; exit}' "$file_path"; }

slug=$(extract "slug")
task=$(extract "task")
phase=$(extract "phase")
progress=$(extract "progress")
effort=$(extract "effort")
mode=$(extract "mode")
updated=$(extract "updated")

[ -z "$slug" ] && exit 0

state_dir="$mem_dir/STATE"
mkdir -p "$state_dir"
work_json="$state_dir/work.json"

# Read existing work.json or initialize
existing=$(cat "$work_json" 2>/dev/null || echo "{}")

# Upsert this entry (requires jq)
echo "$existing" | jq \
  --arg slug "$slug" \
  --arg task "$task" \
  --arg phase "$phase" \
  --arg progress "$progress" \
  --arg effort "$effort" \
  --arg mode "$mode" \
  --arg updated "$updated" \
  '.[$slug] = {slug: $slug, task: $task, phase: $phase, progress: $progress, effort: $effort, mode: $mode, updated: $updated}' \
  > "${work_json}.tmp" && mv "${work_json}.tmp" "$work_json"

exit 0
```

**Effort:** 45 minutes.

---

### 6. `scripts/hooks/memory-feed.sh` — Live Memory Write Log

**Replaces:** `file.edited` event in `holocron-memory-feed`  
**Claude CLI hook:** Piggybacked on the same `PostToolUse Write|Edit` matcher — runs alongside `prd-sync.sh`

```bash
#!/usr/bin/env bash
# Append memory write events to /tmp/holocron-memory-feed.log
# Works alongside prd-sync.sh (same PostToolUse Write|Edit trigger)

mem_dir="${HOLOCRON_MEMORY_DIR:-}"
[ -z "$mem_dir" ] && exit 0

input=$(cat)
file_path=$(echo "$input" | jq -r '.tool_input.file_path // .tool_input.path // ""')

# Only track writes inside the memory dir
[[ "$file_path" != "$mem_dir"* ]] && exit 0

# Classify path
label="MEM"
[[ "$file_path" == *"/WORK/"* ]]                                && label="WORK"
[[ "$file_path" == *"/LEARNING/CAPTURES/"* ]]                   && label="CAPTURE"
[[ "$file_path" == *"/LEARNING/REFLECTIONS/"* ]]                && label="REFLECT"
[[ "$file_path" == *"/LEARNING/SIGNALS/"* ]]                    && label="SIGNAL"
[[ "$file_path" == *"/RELATIONSHIP/"* || "$file_path" == *"/memory/MEMORY"* ]] && label="MEMORY"
[[ "$file_path" == *"/STATE/"* ]]                               && label="STATE"

printf "%s\t%s\t%s\n" "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)" "$label" "$file_path" \
  >> /tmp/holocron-memory-feed.log

exit 0
```

**Effort:** 20 minutes.

---

### 7. `scripts/hooks/stop-guard.sh` — Incomplete Work Guard

**Replaces (partially):** `experimental.text.complete` + `client.tui.submitPrompt` in `holocron-ralph-loop`  
**PAI pattern:** Several `Stop` hooks run post-response (see PAI's `Stop` section in `settings.json`)  
**Claude CLI hook:** `Stop` — exit code 2 blocks Claude from stopping; stderr text is shown to Claude as an error

> **Critical limitation:** The Ralph Loop scans live assistant response text mid-stream and injects a follow-up user turn programmatically. Claude CLI's `Stop` hook receives no response text and cannot inject prompts. This script can only check the PRD on disk for unchecked criteria — it does NOT replicate the live-text scanning behavior. Consider the Ralph Loop an OpenCode-exclusive feature and the Stop guard a useful but weaker complement.

```bash
#!/usr/bin/env bash
# Block stopping if the active PRD has unchecked ISC criteria in execute/verify phase
# Partial approximation of the Ralph Loop — PRD-state only, not live response text

mem_dir="${HOLOCRON_MEMORY_DIR:-}"
[ -z "$mem_dir" ] && exit 0

# Find most recently modified PRD
prd=$(find "$mem_dir/WORK" -name "PRD.md" -exec stat -f "%m %N" {} \; 2>/dev/null \
  | sort -rn | head -1 | awk '{print $2}')
[ -z "$prd" ] && exit 0

phase=$(awk '/^---/{n++} n==1 && /^phase:/{print $2; exit}' "$prd" 2>/dev/null)

# Only enforce during active execution phases
[[ "$phase" != "execute" && "$phase" != "verify" ]] && exit 0

# Check for unchecked ISC items
if grep -q '^- \[ \]' "$prd" 2>/dev/null; then
  echo "Incomplete ISC criteria remain in the active PRD (phase: ${phase}). Continue working until all checkboxes are checked." >&2
  exit 2
fi

exit 0
```

**Effort:** 30 minutes.

---

### 8. `holocron-agents-loader` — No Work Required

**Replaces:** The `tool.execute.after` on `read` in `holocron-agents-loader`  
**Claude CLI behavior:** Native. Claude CLI walks up the directory tree looking for `CLAUDE.md` and `AGENTS.md` files when reading from any directory. This is built-in behavior — the `holocron-agents-loader` plugin replicates what Claude CLI already does natively.

No shell hook script needed for this capability.

---

## Hook Event Reference: OpenCode vs Claude CLI

This table consolidates the key differences so hook scripts can be written correctly the first time.

| | OpenCode | Claude CLI |
|---|---|---|
| **Session start** | `session.created` | `SessionStart` (matcher: `startup`) |
| **Context injection** | `tui.prompt.append` output mutation | `hookSpecificOutput.additionalContext` in SessionStart response JSON |
| **User prompt** | `chat.message` — `output.parts[].text` | `UserPromptSubmit` — stdin `prompt` field (string) |
| **After file write** | `tool.execute.after` — `input.args.filePath` | `PostToolUse`, matcher `Write` — stdin `tool_input.file_path` |
| **After file edit** | `tool.execute.after` — `input.args.filePath` | `PostToolUse`, matcher `Edit` — stdin `tool_input.file_path` |
| **After file read** | `tool.execute.after` — `input.args.filePath` | `PostToolUse`, matcher `Read` — stdin `tool_input.file_path` |
| **File edited event** | `event` (filter `event.type === "file.edited"`) | No equivalent — use PostToolUse Write/Edit instead |
| **After response** | `experimental.text.complete` (text available) | `Stop` (no text in stdin) |
| **Inject follow-up prompt** | `client.tui.appendPrompt` + `client.tui.submitPrompt` | **Not possible** |
| **Block tool call** | Return `{ permissionDecision: "deny" }` | Exit code 2 on `PreToolUse` |
| **Async background** | Native (hooks are async by default) | `"async": true` in hook definition |
| **Config file** | OpenCode TypeScript plugin API | `~/.claude/settings.json` `hooks` key |
| **Env var injection** | `process.env` from shell | `settings.json` `env` key |

---

## Switching Between Harnesses

No file changes. Just use a different binary:

```bash
opencode   # Full TypeScript plugin automation
claude     # Shell hook automation
```

Both read from `~/.config/opencode/` (via the symlink). Both read from and write to `$HOLOCRON_MEMORY_DIR`. The only behavioral difference is the Ralph Loop — OpenCode has the full live-text scanner; Claude CLI has the weaker PRD-state stop guard.

---

## Implementation Priority

| # | Task | Effort | Blocks |
|---|------|--------|--------|
| 1 | Create `~/.claude/settings.json` with `env` and hook wiring | 5 min | Everything else |
| 2 | Create `~/.claude/CLAUDE.md` with `@` imports | 10 min | Core context |
| 3 | Write `learning-capture.sh` | 60 min | Rating signals in Claude CLI |
| 4 | Write `prd-sync.sh` | 45 min | PRD state tracking |
| 5 | Write `session-start.sh` | 30 min | Active work context injection |
| 6 | Write `stop-guard.sh` | 30 min | Weak Ralph Loop approximation |
| 7 | Write `memory-feed.sh` | 20 min | Live feed sidebar |
| — | Agents loader | 0 min | Native Claude CLI behavior |
| — | MCP (linear) | 0 min | Already configured in `~/.claude.json` |
| — | All instruction/skill/command files | 0 min | Already shared via symlink |

**Total estimated effort: ~3.5 hours for full parity.**

---

## What Cannot Be Ported

The **Ralph Loop** (`holocron-ralph-loop`) is an OpenCode-exclusive capability. It requires:
1. Reading live assistant response text as it completes (`experimental.text.complete`)
2. Programmatically appending and submitting a follow-up user turn (`client.tui.appendPrompt` / `client.tui.submitPrompt`)

Claude CLI's `Stop` hook fires after the response is complete, receives no text in stdin, and cannot inject prompts. The `stop-guard.sh` script above provides a partial approximation (PRD-state check) but does not replicate the live-response scanning behavior. Treat the Ralph Loop as a differentiating feature of the OpenCode harness.

---

## References

- PAI `settings.json` hook patterns: `Personal_AI_Infrastructure/Releases/v4.0.3/.claude/settings.json`
- PAI hook system documentation: `Personal_AI_Infrastructure/Releases/v4.0.0/.claude/PAI/docs/THEHOOKSYSTEM.md`
- Claude CLI hooks reference: https://docs.anthropic.com/en/docs/claude-code/hooks
- Claude CLI settings reference: https://docs.anthropic.com/en/docs/claude-code/settings
- Holocron MEMORY_CONTRACT: `MEMORY_CONTRACT.md`
- Holocron DECISIONS.md: `DECISIONS.md` (see 2026-03-16 entry for symlink decision)
