#!/usr/bin/env bash
set -euo pipefail

AUTH_SRC="${HOME}/.claude/.credentials.json"
AUTH_DST="${HOME}/.local/share/opencode/auth.json"

echo "[INFO] Generating auth.json from Claude credentials..."

command -v jq >/dev/null 2>&1 || { echo "[ERROR] jq not installed"; exit 1; }
[[ -f "$AUTH_SRC" ]] || { echo "[ERROR] Missing source file: $AUTH_SRC"; exit 1; }

mkdir -p "$(dirname "$AUTH_DST")"

jq '{
  anthropic: {
    type: "oauth",
    refresh: (.claudeAiOauth.refreshToken // error("missing refreshToken")),
    access: (.claudeAiOauth.accessToken // error("missing accessToken")),
    expires: (.claudeAiOauth.expiresAt // error("missing expiresAt"))
  }
}' "$AUTH_SRC" > "${AUTH_DST}.tmp"

echo "[INFO] Moving generated file into place..."
mv -v "${AUTH_DST}.tmp" "$AUTH_DST"

echo "[INFO] Done."
exec opencode "$@"
