#!/usr/bin/env bash
# glob-rules.sh — Apply conditional glob rules when a file is read
#
# Claude CLI equivalent of: tool.execute.after on read in holocron-glob-rules
# Hook event: PostToolUse, matcher: Read, async: true
#
# DUAL-MAINTENANCE: Keep in sync with plugins/holocron-glob-rules/src/index.ts
# Rules directory (.opencode/rules/), globs: frontmatter field name, and dedup
# behavior (inject once per file per session) must match between both files.
#
# Output appended to stdout is visible to Claude CLI as additional tool context,
# matching the OpenCode plugin's output.output mutation behavior.

input=$(cat)
file_path=$(echo "$input" | jq -r '.tool_input.file_path // ""' 2>/dev/null)
session_id=$(echo "$input" | jq -r '.session_id // "unknown"' 2>/dev/null)

[ -z "$file_path" ] && exit 0

# Look for rules relative to the project root (walk up from file_path)
# First try CWD, then the directory containing the file
rules_dir="$(pwd)/.opencode/rules"
[ ! -d "$rules_dir" ] && exit 0

dedup_file="/tmp/holocron-glob-rules-${session_id}.seen"

for rule_file in "$rules_dir"/*.md; do
  [ -f "$rule_file" ] || continue

  # Extract globs: field from YAML frontmatter
  globs=$(awk '/^---/{n++; next} n==1 && /^globs:/{sub(/^globs:[[:space:]]*/,""); print; exit}' "$rule_file")
  [ -z "$globs" ] && continue

  # Strip YAML list brackets if present: ["*.ts", "*.tsx"] → *.ts *.tsx
  globs="${globs//[\[\]\"\']/}"
  globs="${globs//,/ }"

  # Check if file_path matches any glob pattern
  matched=false
  for pattern in $globs; do
    # Use bash extglob-style case matching
    case "$file_path" in
      $pattern) matched=true; break ;;
      */$pattern) matched=true; break ;;
    esac
  done

  "$matched" || continue

  # Dedup: skip if this rule was already injected this session
  rule_key="${rule_file}:${session_id}"
  grep -qF "$rule_key" "$dedup_file" 2>/dev/null && continue
  echo "$rule_key" >> "$dedup_file"

  # Output rule body (strip YAML frontmatter, i.e. content after second ---)
  awk '/^---/{n++; next} n>=2{print}' "$rule_file"
done

exit 0
