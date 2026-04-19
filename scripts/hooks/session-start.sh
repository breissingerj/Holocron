#!/usr/bin/env bash
# session-start.sh — Inject active PRD context at session start
#
# Claude CLI equivalent of: session.created + tui.prompt.append in holocron-context-loader
# Hook event: SessionStart (matcher: startup)
# Returns: additionalContext JSON consumed by Claude CLI as system context
#
# DUAL-MAINTENANCE: Keep in sync with plugins/holocron-context-loader/src/index.ts
# The PRD discovery logic (find most recent PRD.md, extract frontmatter fields) must
# stay equivalent between both files.

mem_dir="${HOLOCRON_MEMORY_DIR:-}"
[ -z "$mem_dir" ] && exit 0

# Find the most recently modified PRD.md
[[ "$(uname)" == "Darwin" ]] && _stat_fmt="-f %m %N" || _stat_fmt="-c %Y %n"
prd=$(find "$mem_dir/WORK" -name "PRD.md" -exec stat $_stat_fmt {} \; 2>/dev/null \
  | sort -rn | head -1 | awk '{print $2}')
[ -z "$prd" ] && exit 0

# Extract frontmatter fields (between first two --- delimiters)
extract_field() {
  local field="$1"
  awk -v f="$field" '/^---/{n++; next} n==1 && $0 ~ "^"f":"{sub(/^[^:]+: */,""); print; exit}' "$prd" 2>/dev/null
}

task=$(extract_field "task")
phase=$(extract_field "phase")
progress=$(extract_field "progress")
slug=$(extract_field "slug")

[ -z "$task" ] && exit 0

# Escape double quotes for JSON safety
task_escaped="${task//\"/\\\"}"

cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "Active Holocron work: \"${task_escaped}\" (phase: ${phase}, progress: ${progress}, slug: ${slug})"
  }
}
EOF
