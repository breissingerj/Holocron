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

mem_dir="${HOLOCRON_MEMORY_DIR:-}"
[ -z "$mem_dir" ] && exit 0

# Find most recently modified PRD
[[ "$(uname)" == "Darwin" ]] && _stat_fmt="-f %m %N" || _stat_fmt="-c %Y %n"
prd=$(find "$mem_dir/WORK" -name "PRD.md" -exec stat $_stat_fmt {} \; 2>/dev/null \
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
