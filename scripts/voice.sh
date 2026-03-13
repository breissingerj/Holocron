#!/usr/bin/env bash
# Holocron voice announcement helper
# Usage: bash /path/to/Holocron/scripts/voice.sh "message text"
#
# Reads volume level from $HOLOCRON_MEMORY_DIR/STATE/volume.level
#   0-1: silent (no curl)
#   2-3: notification only (voice_enabled: false)
#   4+:  full voice (voice_enabled: true)
#
# Set HOLOCRON_MEMORY_DIR to your private memory repo. Falls back to ~/.holocron/memory.

_msg="${1:-}"
_mem_dir="${HOLOCRON_MEMORY_DIR:-$HOME/.holocron/memory}"
_vol=$(cat "$_mem_dir/STATE/volume.level" 2>/dev/null || echo "4")

[ "$_vol" -ge "2" ] && {
  _ve=false
  [ "$_vol" -ge "4" ] && _ve=true
  curl -s -X POST http://localhost:8888/notify \
    -H "Content-Type: application/json" \
    -d "{\"message\": \"$_msg\", \"voice_enabled\": $_ve, \"notification_sound\": true}"
} || true
