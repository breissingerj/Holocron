#!/usr/bin/env bash
# memory-feed.sh — Append memory write events to /tmp/holocron-memory-feed.log
#
# Claude CLI equivalent of: file.edited event in holocron-memory-feed
# Hook event: PostToolUse, matcher: Write|Edit (runs alongside prd-sync.sh)
# Async: true
#
# DUAL-MAINTENANCE: Keep in sync with plugins/holocron-memory-feed.ts
# Path classification labels (WORK, SIGNAL, CAPTURE, REFLECT, MEMORY, STATE, MEM)
# and the log line format written to /tmp/holocron-memory-feed.log must match exactly
# so scripts/memory-feed.sh (the tail renderer) parses both harnesses identically.

mem_dir="${HOLOCRON_MEMORY_DIR:-}"
[ -z "$mem_dir" ] && exit 0

input=$(cat)
file_path=$(echo "$input" | jq -r '.tool_input.file_path // .tool_input.path // ""' 2>/dev/null)

# Only track writes inside the memory dir
[[ "$file_path" != "$mem_dir"* ]] && exit 0

# Classify path — order matters (more specific checks first)
label="MEM"
[[ "$file_path" == *"/WORK/"* ]]                                    && label="WORK"
[[ "$file_path" == *"/LEARNING/CAPTURES/"* ]]                       && label="CAPTURE"
[[ "$file_path" == *"/LEARNING/REFLECTIONS/"* ]]                    && label="REFLECT"
[[ "$file_path" == *"/LEARNING/SIGNALS/"* ]]                        && label="SIGNAL"
[[ "$file_path" == *"/RELATIONSHIP/"* ]] && label="MEMORY"
[[ "$file_path" == *"/memory/MEMORY"* ]] && label="MEMORY"
[[ "$file_path" == *"/STATE/"* ]]                                   && label="STATE"

printf "%s\t%s\t%s\n" "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)" "$label" "$file_path" \
  >> /tmp/holocron-memory-feed.log

exit 0
