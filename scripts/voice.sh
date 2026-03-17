#!/usr/bin/env bash
# Holocron voice announcement helper
# Usage: bash /path/to/Holocron/scripts/voice.sh "message text"
#
# Reads volume level from $HOLOCRON_MEMORY_DIR/STATE/volume.level
#   0-1: silent
#   2-3: desktop notification only (no speech)
#   4+:  full voice via kokoro-fastapi + desktop notification
#
# TTS: kokoro-fastapi at localhost:8880 (OpenAI-compatible endpoint)
# Voice: $HOLOCRON_KOKORO_VOICE (default: bm_daniel)
# Fallback: macOS `say` if kokoro is unreachable
#
# Set HOLOCRON_MEMORY_DIR to your private memory repo. Falls back to ~/.holocron/memory.

_msg="${1:-}"
_mem_dir="${HOLOCRON_MEMORY_DIR:-$HOME/.holocron/memory}"
_vol=$(cat "$_mem_dir/STATE/volume.level" 2>/dev/null || echo "4")
_voice="${HOLOCRON_KOKORO_VOICE:-bm_daniel}"
_icon="${HOLOCRON_MEMORY_DIR:-$HOME/Projects/personalProjects/holocron-context}/assets/HK_face_logo.png"
_kokoro="http://localhost:8880/v1/audio/speech"

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
  if [ "$_vol" -ge "4" ]; then
    _tmp="/tmp/pai-voice-$$.mp3"
    if curl -sf -X POST "$_kokoro" \
        -H "Content-Type: application/json" \
        -d "{\"model\":\"kokoro\",\"input\":\"$_msg\",\"voice\":\"$_voice\",\"response_format\":\"mp3\"}" \
        --output "$_tmp" --max-time 10 &>/dev/null; then
      afplay "$_tmp" &>/dev/null && rm -f "$_tmp" &
    else
      # Fallback: kokoro unreachable
      rm -f "$_tmp"
      say "$_msg" &>/dev/null &
    fi
  fi
} || true
