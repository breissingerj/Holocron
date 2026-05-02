#!/usr/bin/env bash
# VoiceServer/platform.sh — Platform detection for VoiceServer management scripts
#
# Source this file from all VoiceServer management scripts. Provides:
#   PLATFORM        "darwin" or "linux"
#   SERVICE_NAME    service identifier (used as systemd unit name on Linux)
#   PLIST_PATH      macOS: ~/Library/LaunchAgents/*.plist
#                   Linux: ~/.config/systemd/user/*.service
#   LOG_PATH        macOS: ~/Library/Logs/
#                   Linux: ~/.local/share/holocron/
#   svc_is_running  exits 0 if service is active, non-zero otherwise
#   svc_start       start the service
#   svc_stop        stop the service
#   svc_enable      enable auto-start (no-op on Darwin — launchctl load already handles it)
#   svc_disable     disable auto-start (no-op on Darwin — removing plist handles it)

SERVICE_NAME="com.holocron.voice-server"

if [[ "$(uname)" == "Darwin" ]]; then
  PLATFORM="darwin"
  PLIST_PATH="$HOME/Library/LaunchAgents/${SERVICE_NAME}.plist"
  LOG_PATH="$HOME/Library/Logs/holocron-voice-server.log"

  svc_is_running() { launchctl list | grep -q "$SERVICE_NAME" 2>/dev/null; }
  svc_start()      { launchctl load "$PLIST_PATH" 2>/dev/null; }
  svc_stop()       { launchctl unload "$PLIST_PATH" 2>/dev/null; }
  svc_enable()     { : ; }
  svc_disable()    { : ; }
else
  PLATFORM="linux"
  PLIST_PATH="$HOME/.config/systemd/user/holocron-voice-server.service"
  LOG_PATH="$HOME/.local/share/holocron/voice-server.log"

  svc_is_running() { systemctl --user is-active --quiet holocron-voice-server 2>/dev/null; }
  svc_start()      { systemctl --user start holocron-voice-server 2>/dev/null; }
  svc_stop()       { systemctl --user stop holocron-voice-server 2>/dev/null; }
  svc_enable()     { systemctl --user enable holocron-voice-server 2>/dev/null; }
  svc_disable()    { systemctl --user disable holocron-voice-server 2>/dev/null; }
fi
