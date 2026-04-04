# Claude CLI Compatibility Plan

> **Status:** Implemented  
> **Goal:** Make Holocron work in both OpenCode and Claude CLI (Claude Code) with zero switching friction

---

## The Core Insight

Claude CLI does **not** read from `~/.config/opencode/` or any `~/.config/` subdirectory. Its config root is `~/.claude/`. All Holocron components are wired into `~/.claude/` explicitly via `install.sh` symlinks and a versioned `CLAUDE.md` + `settings.json` in `Holocron/config/claude/`. There is no shared directory between the two harnesses — each harness has its own wiring that points at the same Holocron source files.

> **Note:** A `~/.config/claude → ~/.config/opencode` symlink existed historically but was removed (2026-03-23) because Claude CLI never reads from that path. See `DECISIONS.md` for rationale.

---

## What Works in Claude CLI

| Component | Where Claude CLI reads it | How it gets there |
|-----------|--------------------------|-------------------|
| System instructions (`AGENTS.md`) | `~/.claude/CLAUDE.md` via `@` import | Symlink: `~/.claude/CLAUDE.md → Holocron/config/claude/CLAUDE.md` |
| Algorithm + steering rules | `~/.config/opencode/instructions/` | Resolved via `@` import in `AGENTS.md`; path uses `~/.config/opencode` (opencode's dir, not Claude's) |
| Memory (`MEMORY.md`) | `$HOLOCRON_MEMORY_DIR/memory/MEMORY.md` | `@` import in `CLAUDE.md`; path hardcoded to memory repo |
| Slash commands | `~/.claude/commands/` | Symlink: `~/.claude/commands → Holocron/commands/` |
| Skills | `~/.claude/skills/` | Symlink: `~/.claude/skills → Holocron/skills/` |
| Subagents | `~/.claude/agents/` | Symlink: `~/.claude/agents → agents/claude/` — 15 Claude Code schema agents, kept in behavioral sync with `agents/opencode/` |
| Hook scripts | `~/.config/opencode/scripts/hooks/` | Symlink via opencode install; referenced by absolute path in `settings.json` |
| `HOLOCRON_MEMORY_DIR` env var | `~/.claude/settings.json` `env` block | Symlink: `~/.claude/settings.json → Holocron/config/claude/settings.json` |
| Linear MCP server | `~/.claude/settings.json` `enabledMcpjsonServers` | Same settings.json symlink |
| Voice script (`voice.sh`) | `~/.config/opencode/scripts/voice.sh` | Works — pure bash, no harness dependency |

### Algorithm & Steering Rules

`AGENTS.md` uses `@` imports to load `instructions/algorithm.md` and `instructions/steering-rules.md`. The import paths reference `~/.config/opencode/instructions/` — opencode's config directory, not Claude CLI's. This works because the files are accessed via their absolute symlink targets at read time, not via any Claude CLI config discovery mechanism.

### Subagents

Claude CLI reads user subagents from `~/.claude/agents/`. Holocron maintains a parallel set of Claude Code schema agent files at `agents/claude/`, symlinked from `~/.claude/agents/` via `install.sh`. All 15 agents are present.

The two directories (`agents/opencode/` and `agents/claude/`) are kept in behavioral sync — same `name`, `description`, and body content. Only the frontmatter differs: opencode agents carry `color`, `voiceId`, `voice`, `persona`, and `permission`; Claude Code agents use `model`, `tools`, and optionally `skills`. See `agents/VERIFY_AGENTS.md` for the dual-maintenance rule.

### Skills

Claude CLI reads personal skills from `~/.claude/skills/<name>/SKILL.md`. The symlink `~/.claude/skills → Holocron/skills/` exposes all skills. This symlink is created by `install.sh`.

### Commands

`/reflect` and `/compound` work once `~/.claude/commands/` is symlinked to `Holocron/commands/`. Both use `!cmd` shell injection and `$ARGUMENTS` substitution, which Claude CLI supports natively. This symlink is created by `install.sh`.

---

## The Automation Gap

Holocron has six OpenCode TypeScript plugins that have no direct equivalent in Claude CLI. Each maps to a specific Claude CLI hook event. The section below gives the exact mapping, informed by how PAI (Personal AI Infrastructure) implements the same patterns in their production `settings.json`.

### OpenCode Plugin → Claude CLI Hook Event Mapping

| OpenCode plugin | OpenCode hook | Claude CLI equivalent | Status |
|---|---|---|---|
| `holocron-context-loader` | `session.created` + `tui.prompt.append` | `SessionStart` → `additionalContext` + `CLAUDE.md` imports | Portable |
| `holocron-prd` | `tool.execute.after` on `edit`/`write` | `PostToolUse` matcher `Write\|Edit` | Portable |
| `holocron-agents-loader` | `tool.execute.after` on `read` | Native Claude CLI behavior | Already covered |
| `holocron-learning-capture` | `chat.message` | `UserPromptSubmit` — stdin `.prompt` field | Portable |
| `holocron-memory-feed` | `file.edited` event | `PostToolUse` matcher `Write\|Edit` (second hook) | Portable |
| `holocron-ralph-loop` | `experimental.text.complete` + `tui.submitPrompt` | `Stop` hook (PRD-state only — partial) | Partial |
| `holocron-glob-rules` | `tool.execute.after` on `read` | `PostToolUse` matcher `Read` — shell glob matching | Portable |
| `opencode-claude-auth` | Auth plugin — OpenCode-specific | Not applicable | OpenCode-only |

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
  session-start.sh                               ← New (Claude CLI equivalent of session.created)
  learning-capture.sh                            ← New (Claude CLI equivalent of chat.message)
  prd-sync.sh                                    ← New (Claude CLI equivalent of tool.execute.after on edit/write)
  memory-feed.sh                                 ← New (Claude CLI equivalent of file.edited)
  stop-guard.sh                                  ← New (partial Claude CLI equivalent of Ralph Loop)
  glob-rules.sh                                  ← New (Claude CLI equivalent of holocron-glob-rules)
```

> These shell scripts are **Claude CLI-only additions**. The OpenCode TypeScript plugins continue to run unchanged when using OpenCode. Both automation layers coexist — each harness runs its own against the same `$HOLOCRON_MEMORY_DIR`.

## Files NOT Modified

```
~/.config/opencode/plugins/          ← TypeScript plugins untouched
~/.config/opencode/AGENTS.md         ← Untouched
~/.config/opencode/agents/           ← Untouched
~/.config/opencode/commands/         ← Untouched
~/.config/opencode/skills/           ← Untouched
```

> **Note:** `~/.config/claude` was a symlink to `~/.config/opencode` that was removed 2026-03-23. Claude CLI does not read from `~/.config/` paths; all Claude CLI wiring goes through `~/.claude/`.

---

## Component Implementation Plans

### 1. `~/.claude/settings.json` — Foundation

This is the only Claude CLI-specific config file required. It injects `HOLOCRON_MEMORY_DIR` into every session and wires all hooks.

```json
{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "env": {
    "HOLOCRON_MEMORY_DIR": "/path/to/your/holocron-context"
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
      },
      {
        "matcher": "Read",
        "hooks": [
          {
            "type": "command",
            "command": "bash ~/.config/opencode/scripts/hooks/glob-rules.sh",
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

Claude CLI equivalent of the OpenCode `session.created` + `tui.prompt.append` static context injection. Claude CLI natively loads files referenced with `@path` syntax at every session start. The OpenCode plugin continues to run when using OpenCode.

```markdown
@~/.config/opencode/AGENTS.md

@$HOLOCRON_MEMORY_DIR/memory/MEMORY.md
```

This gives Claude CLI the Holocron behavioral rules and curated memory on every session without any hook code. The `session-start.sh` hook (below) handles the dynamic component (active PRD).

> **Why two mechanisms?** CLAUDE.md `@` imports are loaded before any tool use and survive context compaction. The hook adds the dynamic active-work summary that changes per session.

**Effort:** 10 minutes.

---

### 3. `scripts/hooks/session-start.sh` — Active Work Context

> **DUAL-MAINTENANCE:** Keep in sync with `plugins/holocron-context-loader/src/index.ts`. The PRD discovery logic (find most recent `PRD.md`, extract frontmatter fields) must stay equivalent between both files.

**Claude CLI equivalent of:** `session.created` → `tui.prompt.append` in `holocron-context-loader` (OpenCode plugin unchanged)  
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

> **DUAL-MAINTENANCE:** Keep in sync with `plugins/holocron-learning-capture/src/index.ts`. Detection regexes, rating thresholds (explicit patterns, implicit keywords, low-rating threshold ≤4), JSONL field names in `ratings.jsonl`, and the capture `.md` file format in `LEARNING/CAPTURES/` must all match between both files.

**Claude CLI equivalent of:** `chat.message` in `holocron-learning-capture` (OpenCode plugin unchanged)  
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

> **DUAL-MAINTENANCE:** Keep in sync with `plugins/holocron-prd/src/index.ts`. The set of frontmatter fields extracted and the shape of entries written to `STATE/work.json` must be identical between both files. If a new field is added to the PRD format, add it to both the TS plugin and this script.

**Claude CLI equivalent of:** `tool.execute.after` on `edit`/`write` in `holocron-prd` (OpenCode plugin unchanged)  
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

> **DUAL-MAINTENANCE:** Keep in sync with `plugins/holocron-memory-feed.ts`. Path classification labels (`WORK`, `SIGNAL`, `CAPTURE`, etc.) and the log line format written to `/tmp/holocron-memory-feed.log` must match exactly — `scripts/memory-feed.sh` (the tail renderer) parses both harnesses' output identically.

**Claude CLI equivalent of:** `file.edited` event in `holocron-memory-feed` (OpenCode plugin unchanged)  
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

> **DUAL-MAINTENANCE (asymmetric):** Loosely paired with `plugins/holocron-ralph-loop/src/index.ts`. These files are intentionally different in capability (see limitation note below) and will never be fully equivalent. Only sync if: the PRD phase names change, the checkbox pattern (`- [ ]`) changes, or the sentinel string that guards against infinite loops changes.

**Partial Claude CLI equivalent of:** `experimental.text.complete` + `client.tui.submitPrompt` in `holocron-ralph-loop` (OpenCode plugin unchanged)  
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

### 8. `scripts/hooks/glob-rules.sh` — Conditional Glob Rules

> **DUAL-MAINTENANCE:** Keep in sync with `plugins/holocron-glob-rules/src/index.ts`. The rules directory path (`.opencode/rules/*.md`), the frontmatter `globs:` field name, and the dedup behavior (inject once per file per session) must match between both files.

**Claude CLI equivalent of:** `tool.execute.after` on `read` in `holocron-glob-rules` (OpenCode plugin unchanged)  
**Claude CLI hook:** `PostToolUse`, `matcher: "Read"`, `async: true`

The OpenCode plugin reads `.opencode/rules/*.md` files at init, then appends matching rule bodies to file-read tool output when a file's path matches a rule's `globs:` pattern. The Claude CLI equivalent uses the same rule directory and the same `globs:` frontmatter field, but performs glob matching in bash using `extglob` or a simple `case` pattern, and writes the rule content to a session-scoped temp file to track deduplication.

**Stdin schema** (same as other PostToolUse hooks):
```json
{
  "session_id": "...",
  "tool_name": "Read",
  "tool_input": { "file_path": "/path/to/file" },
  "hook_event_name": "PostToolUse"
}
```

**Script sketch** (full implementation deferred — lower priority than the five core hooks):
```bash
#!/usr/bin/env bash
# Apply conditional glob rules when a file is read
# Equivalent to holocron-glob-rules TypeScript plugin

input=$(cat)
file_path=$(echo "$input" | jq -r '.tool_input.file_path // ""')
session_id=$(echo "$input" | jq -r '.session_id // "unknown"')
[ -z "$file_path" ] && exit 0

rules_dir="$(pwd)/.opencode/rules"
[ ! -d "$rules_dir" ] && exit 0

dedup_file="/tmp/holocron-glob-rules-${session_id}.seen"

for rule_file in "$rules_dir"/*.md; do
  [ -f "$rule_file" ] || continue

  # Extract globs: field from YAML frontmatter
  globs=$(awk '/^---/{n++; next} n==1 && /^globs:/{gsub(/^globs: */,""); print; exit}' "$rule_file")
  [ -z "$globs" ] && continue

  # Check if file_path matches any glob (simplified — extend for full glob support)
  matched=false
  for pattern in $globs; do
    pattern="${pattern//[\[\]]/}"  # strip YAML list brackets if present
    case "$file_path" in
      $pattern) matched=true; break ;;
    esac
  done

  "$matched" || continue

  # Dedup: skip if this rule was already injected this session
  rule_key="${rule_file}:${session_id}"
  grep -qF "$rule_key" "$dedup_file" 2>/dev/null && continue
  echo "$rule_key" >> "$dedup_file"

  # Output rule body (strip frontmatter)
  awk '/^---/{n++; next} n>=2{print}' "$rule_file"
done

exit 0
```

> **Note:** The glob-rules hook output appended to stdout is visible to Claude CLI as additional tool context, matching the OpenCode plugin's `output.output` mutation behavior.

**Effort:** 45 minutes.

---

### 9. `opencode-claude-auth` — OpenCode-Only, No Action Required

This plugin is registered in `opencode.json` and handles authentication for Claude models within OpenCode. Claude CLI manages its own authentication natively via `~/.claude/` credentials — it does not use or need this plugin. No equivalent is needed.

---

### 10. Context Compaction — Partial Gap

**OpenCode:** `experimental.session.compacting` hook in `holocron-context-loader` re-injects memory context when OpenCode compacts the context window.  
**Claude CLI:** `PreCompact` hook exists but is not yet configured. Without it, memory context injected at `SessionStart` may be lost after a context compaction in a long session.

**Mitigation:** `CLAUDE.md` `@` imports are re-evaluated on each compaction by Claude CLI natively — `MEMORY.md` and `AGENTS.md` survive compaction without a hook. The active PRD summary from `session-start.sh` does not survive compaction.

**Future work:** Add a `PreCompact` hook entry to `~/.claude/settings.json` that re-runs `session-start.sh` to re-inject the active PRD context after compaction.

---

### 11. `holocron-agents-loader` — No Work Required

> **DUAL-MAINTENANCE (monitor only):** No shell script to maintain. If `plugins/holocron-agents-loader/src/index.ts` changes its walk depth, dedup logic, or the files it looks for (currently `AGENTS.md`), verify that Claude CLI's native hierarchical loading behavior still covers the same scope. No code change required unless Claude CLI's native behavior diverges.

**OpenCode plugin:** `holocron-agents-loader` (`tool.execute.after` on `read`) continues to run in OpenCode unchanged.  
**Claude CLI behavior:** Native. Claude CLI walks up the directory tree looking for `CLAUDE.md` and `AGENTS.md` files when reading from any directory. This is built-in behavior — no additional shell script needed.

No shell hook script needed for this capability.

---

## Dual-Maintenance Registry

These are the file pairs that implement the **same logical behavior** across both harnesses. Whenever you change the logic in one file, you must apply the equivalent change to its paired file. They are never identical (different languages, different event APIs) but must stay **semantically in sync**.

> **Rule:** Any PR or commit that touches a file in the left column should also touch the file in the right column — and vice versa. If you intentionally update only one side, explain why in the commit message.

| Behavior | OpenCode file | Claude CLI file | Sync notes |
|---|---|---|---|
| Context injection at session start | `plugins/holocron-context-loader/src/index.ts` | `~/.claude/CLAUDE.md` + `scripts/hooks/session-start.sh` | Logic that picks the active PRD lives in the TS plugin and `session-start.sh`. CLAUDE.md imports are static; only the dynamic PRD summary needs to stay in sync. |
| Rating & sentiment capture | `plugins/holocron-learning-capture/src/index.ts` | `scripts/hooks/learning-capture.sh` | Detection regexes, rating thresholds, JSONL schema, and `LEARNING/CAPTURES/` file format must match exactly. |
| PRD frontmatter → work.json sync | `plugins/holocron-prd/src/index.ts` | `scripts/hooks/prd-sync.sh` | Fields written to `STATE/work.json` and the frontmatter keys parsed must stay identical. |
| Memory write feed log | `plugins/holocron-memory-feed.ts` | `scripts/hooks/memory-feed.sh` | Path classification labels (`WORK`, `SIGNAL`, etc.) and log format (`/tmp/holocron-memory-feed.log`) must match so `scripts/memory-feed.sh` renders both harnesses identically. |
| Incomplete-work continuation | `plugins/holocron-ralph-loop/src/index.ts` | `scripts/hooks/stop-guard.sh` | **Asymmetric by design** — the Ralph Loop scans live response text; the stop-guard only checks PRD state. These will never be identical. Only sync PRD phase names and checkbox pattern (`- [ ]`) if those change. |
| Conditional glob rules | `plugins/holocron-glob-rules/src/index.ts` | `scripts/hooks/glob-rules.sh` | Rules directory (`.opencode/rules/`), `globs:` frontmatter field name, and dedup behavior (once per file per session) must match. If a new frontmatter field is added to rule files, update both. |
| Hierarchical context injection | `plugins/holocron-agents-loader/src/index.ts` | Native Claude CLI behavior | No shell script. If the OpenCode plugin's walk depth, dedup logic, or AGENTS.md path changes, verify Claude CLI's native behavior still covers it. |

### How to apply a logic change

1. Identify which row in the table the changed behavior belongs to.
2. Open both files in the same PR.
3. Apply the equivalent logic change to the paired file using the hook event reference below as a translation guide.
4. Add a commit message note: `sync: updated learning-capture.sh to match holocron-learning-capture changes`.

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

Both read from and write to `$HOLOCRON_MEMORY_DIR`. Both share the same Holocron source files (skills, commands, instructions, scripts) via their respective symlinks. The only behavioral difference is the Ralph Loop — OpenCode has the full live-text scanner; Claude CLI has the weaker PRD-state stop guard.

---

## Implementation Status

All items below are **complete**. This table is retained for historical reference.

| # | Task | Status |
|---|------|--------|
| 1 | Create `~/.claude/settings.json` with `env` and hook wiring | ✓ Done |
| 2 | Create `~/.claude/CLAUDE.md` with `@` imports | ✓ Done |
| 3 | Write `learning-capture.sh` | ✓ Done |
| 4 | Write `prd-sync.sh` | ✓ Done |
| 5 | Write `session-start.sh` | ✓ Done |
| 6 | Write `stop-guard.sh` | ✓ Done |
| 7 | Write `memory-feed.sh` | ✓ Done |
| 8 | Write `glob-rules.sh` | ✓ Done |
| 9 | `PreCompact` hook to re-inject active PRD | ✓ Done |
| — | Agents loader | ✓ Native Claude CLI behavior |
| — | `opencode-claude-auth` | ✓ OpenCode-only, no equivalent needed |
| — | MCP (linear) | ✓ Configured in settings.json |
| — | Algorithm, steering rules | ✓ Loaded via `AGENTS.md` `@` imports |
| — | Skills (`~/.claude/skills/` symlink) | ✓ install.sh |
| — | Commands (`~/.claude/commands/` symlink) | ✓ install.sh |
| — | Subagents (`~/.claude/agents/`) | ✓ `agents/claude/` — 15 agents, Claude Code schema, symlinked by install.sh |

To verify the current state, run: `bash docs/validate-claude-cli.sh`

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
- Holocron DECISIONS.md: `DECISIONS.md` (see 2026-03-23 entries for symlink decisions)
- Validation script: `docs/validate-claude-cli.sh`
- Validation playbook: `docs/ValidateClaudeCLI.md`
