#!/usr/bin/env bash
# stop-guard.sh — Block stopping if the active PRD has unchecked ISC criteria
#
# Claude CLI equivalent of: experimental.text.complete + tui.submitPrompt in holocron-ralph-loop
# Hook event: Stop
#
# CRITICAL LIMITATION: The Ralph Loop scans live assistant response text mid-stream
# and injects a follow-up user turn programmatically. Claude CLI's Stop hook receives
# no response text and cannot inject prompts. This script checks PRD state on disk only.
# Consider the Ralph Loop an OpenCode-exclusive feature.
#
# DUAL-MAINTENANCE (asymmetric): Loosely paired with plugins/holocron-ralph-loop/src/index.ts
# Only sync if: PRD phase names change, checkbox pattern changes, or sentinel string changes.
#
# SESSION SCOPING: Multiple Claude CLI sessions can run concurrently, each working its
# own PRD under $HOLOCRON_MEMORY_DIR/WORK. A global "most recently modified PRD.md on
# disk" scan picks up other sessions' in-progress work and blocks this session on
# criteria it has no way to satisfy. Instead, resolve the PRD from this session's own
# transcript (transcript_path is unique per session): find the last PRD.md path this
# session's own Write/Edit tool calls touched, and check only that one.

mem_dir="${HOLOCRON_MEMORY_DIR:-}"
mem_dir="${mem_dir%/}"
[ -z "$mem_dir" ] && exit 0

input=$(cat)
transcript_path=$(echo "$input" | jq -r '.transcript_path // ""' 2>/dev/null)
[ -z "$transcript_path" ] && exit 0
[ -f "$transcript_path" ] || exit 0

prd=$(jq -r --arg wd "$mem_dir/WORK/" '
  select(.type=="assistant") | .message.content[]?
  | select(.type=="tool_use" and (.name=="Write" or .name=="Edit"))
  | (.input.file_path // .input.path // "")
  | select(startswith($wd) and endswith("/PRD.md"))
' "$transcript_path" 2>/dev/null | tail -1)
[ -z "$prd" ] && exit 0
[ ! -f "$prd" ] && exit 0

phase=$(awk '/^---/{n++} n==1 && /^phase:/{print $2; exit}' "$prd" 2>/dev/null)

# Only enforce during active execution phases
[[ "$phase" != "execute" && "$phase" != "verify" ]] && exit 0

# Check for unchecked ISC items
if grep -q '^- \[ \]' "$prd" 2>/dev/null; then
  echo "Incomplete ISC criteria remain in the active PRD (phase: ${phase}). Continue working until all checkboxes are checked." >&2
  exit 2
fi

exit 0
