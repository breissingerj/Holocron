#!/usr/bin/env bash
# prd-sync.sh — Sync PRD frontmatter to STATE/work.json on every PRD.md write or edit
#
# Claude CLI equivalent of: tool.execute.after on edit/write in holocron-prd
# Hook event: PostToolUse, matcher: Write|Edit, async: true
#
# DUAL-MAINTENANCE: Keep in sync with plugins/holocron-prd/src/index.ts
# The set of frontmatter fields extracted and the shape of entries written to
# STATE/work.json must be identical between both files. If a new field is added
# to the PRD format, add it to both the TS plugin and this script.
#
# NOTE on field names: Claude CLI PostToolUse stdin uses tool_input.file_path for
# both Write and Edit tools. Fall back to tool_input.path for safety.

mem_dir="${HOLOCRON_MEMORY_DIR:-}"
[ -z "$mem_dir" ] && exit 0

input=$(cat)
file_path=$(echo "$input" | jq -r '.tool_input.file_path // .tool_input.path // ""' 2>/dev/null)

# Only process PRD.md files inside WORK/
[[ "$file_path" != *"PRD.md" ]] && exit 0
[[ "$file_path" != "$mem_dir/WORK"* ]] && exit 0
[ ! -f "$file_path" ] && exit 0

# Extract YAML frontmatter fields (between first two --- delimiters)
extract() {
  local field="$1"
  awk -v f="$field" '/^---/{n++; next} n==1 && $0 ~ "^"f":"{sub(/^[^:]+: */,""); print; exit}' "$file_path"
}

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

# Read existing work.json or initialize as empty object
existing=$(cat "$work_json" 2>/dev/null || echo "{}")

# Upsert entry for this slug
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
