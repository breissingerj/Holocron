#!/usr/bin/env bash
# Holocron memory feed — live sidebar renderer for Ghostty split pane
#
# Producer (2026-09-01, spec 001 follow-up): `claude/scripts/hooks/memory-feed.sh`
# is the Claude Code equivalent of the retired OpenCode `holocron-memory-feed`
# plugin — a PostToolUse (Write|Edit) hook that appends the same classified,
# timestamped lines to $HOLOCRON_MEMORY_FEED_LOG. It already existed in the
# public settings.json template; it just wasn't wired into this machine's
# live $HOLOCRON_MEMORY_DIR/settings.json until now. No pi equivalent exists yet.
#
# Tails /tmp/holocron-memory-feed.log and renders each memory write as a
# formatted, color-coded line. Run this in a narrow Ghostty split alongside
# your AI coding tool to get a live view of every file the agent writes to
# $HOLOCRON_MEMORY_DIR.
#
# Usage:
#   bash $HOLOCRON_DIR/scripts/memory-feed.sh
#
# Ghostty split keybind (add to ~/.config/ghostty/config):
#   keybind = ctrl+shift+m=new_split:right,bash -c 'bash $HOLOCRON_DIR/scripts/memory-feed.sh'
#
# Log format written by the holocron-memory-feed plugin:
#   <ISO timestamp> TAB <label> TAB <absolute path>

LOG_FILE="${HOLOCRON_MEMORY_FEED_LOG:-/tmp/holocron-memory-feed.log}"
MEM_DIR="${HOLOCRON_MEMORY_DIR:-}"

# ── ANSI colors ───────────────────────────────────────────────────────────────
RESET="\033[0m"
BOLD="\033[1m"
DIM="\033[2m"

C_WORK="\033[38;5;75m"       # blue
C_CAPTURE="\033[38;5;213m"   # pink
C_REFLECT="\033[38;5;141m"   # purple
C_SIGNAL="\033[38;5;222m"    # yellow
C_LEARN="\033[38;5;183m"     # light purple
C_MEMORY="\033[38;5;120m"    # green
C_STATE="\033[38;5;245m"     # grey
C_RESEARCH="\033[38;5;215m"  # orange
C_DEFAULT="\033[38;5;252m"   # near-white

label_color() {
  case "$1" in
    WORK)     echo -e "${C_WORK}" ;;
    CAPTURE)  echo -e "${C_CAPTURE}" ;;
    REFLECT)  echo -e "${C_REFLECT}" ;;
    SIGNAL)   echo -e "${C_SIGNAL}" ;;
    LEARN)    echo -e "${C_LEARN}" ;;
    MEMORY)   echo -e "${C_MEMORY}" ;;
    STATE)    echo -e "${C_STATE}" ;;
    RESEARCH) echo -e "${C_RESEARCH}" ;;
    *)        echo -e "${C_DEFAULT}" ;;
  esac
}

# Shorten absolute path: strip $HOLOCRON_MEMORY_DIR prefix if set
shorten_path() {
  local p="$1"
  if [[ -n "$MEM_DIR" ]]; then
    p="${p#$MEM_DIR/}"
  fi
  # Truncate to last 3 path components for narrow panes
  echo "$p" | awk -F'/' '{
    n = NF
    if (n > 3) print "…/" $(n-2) "/" $(n-1) "/" $n
    else print $0
  }'
}

render_line() {
  local raw="$1"
  # Tab-separated: timestamp <TAB> label <TAB> path
  local ts label path
  IFS=$'\t' read -r ts label path <<< "$raw"

  # Skip malformed lines
  [[ -z "$ts" || -z "$label" || -z "$path" ]] && return

  # Format time as HH:MM:SS
  local time_short
  time_short=$(echo "$ts" | grep -oE '[0-9]{2}:[0-9]{2}:[0-9]{2}' | head -1)
  time_short="${time_short:-??:??:??}"

  local short_path
  short_path=$(shorten_path "$path")

  local color
  color=$(label_color "$label")

  printf "${DIM}%s${RESET}  ${BOLD}${color}%-8s${RESET}  ${DIM}%s${RESET}\n" \
    "$time_short" "$label" "$short_path"
}

# ── Header ────────────────────────────────────────────────────────────────────
clear
printf "${BOLD}${C_MEMORY}  Holocron Memory Feed${RESET}\n"
printf "${DIM}  watching: %s${RESET}\n" "$LOG_FILE"
printf "${DIM}  %s${RESET}\n" "$(date '+%Y-%m-%d')"
printf "${DIM}%s${RESET}\n" "─────────────────────────────────"

# ── Create log file if it doesn't exist yet ───────────────────────────────────
touch "$LOG_FILE" 2>/dev/null || {
  printf "${C_CAPTURE}  Cannot create log file: %s${RESET}\n" "$LOG_FILE"
  printf "${DIM}  Is HOLOCRON_MEMORY_DIR set, and is claude/scripts/hooks/memory-feed.sh wired into your settings.json?${RESET}\n"
  exit 1
}

# ── Replay existing lines then follow new ones ────────────────────────────────
tail -n 50 -f "$LOG_FILE" | while IFS= read -r line; do
  render_line "$line"
done
