#!/usr/bin/env bash
# Holocron voice announcement helper
# Usage: bash /path/to/Holocron/scripts/voice.sh "message text"
#
# Reads volume level from $HOLOCRON_MEMORY_DIR/STATE/volume.level
#   0-1: silent
#   2-3: desktop notification only (no speech)
#   4+:  full voice via macOS `say` + desktop notification
#
# TTS: macOS built-in `say` command (no server, no API key required).
# Voice: $HOLOCRON_SAY_VOICE (default: Evan (Enhanced))
#
# Set HOLOCRON_MEMORY_DIR to your private memory repo. Falls back to ~/.holocron/memory.

_msg="${1:-}"
_mem_dir="${HOLOCRON_MEMORY_DIR:-$HOME/.holocron/memory}"
_vol=$(cat "$_mem_dir/STATE/volume.level" 2>/dev/null || echo "4")
_voice="${HOLOCRON_SAY_VOICE:-Evan (Enhanced)}"
_icon="$HOME/.claude/assets/HK_face_logo.png"

[ "$_vol" -ge "2" ] && {
  # Desktop notification (terminal-notifier if available, otherwise silent)
  if command -v /opt/homebrew/bin/terminal-notifier &>/dev/null; then
    if [ -f "$_icon" ]; then
      /opt/homebrew/bin/terminal-notifier -title "PAI" -message "$_msg" -appIcon "$_icon" -sound default &>/dev/null &
    else
      /opt/homebrew/bin/terminal-notifier -title "PAI" -message "$_msg" -sound default &>/dev/null &
    fi
  fi

  # Voice (level 4+)
  [ "$_vol" -ge "4" ] && say -v "$_voice" "$_msg" &>/dev/null &
} || true
