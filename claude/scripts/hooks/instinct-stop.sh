#!/usr/bin/env bash
# instinct-stop.sh — capture: Haiku extraction + recap from the transcript delta
# Hook events: SessionEnd / PreCompact (NOT Stop — that fires every turn; the sweep backstops missed sessions). Reads hook JSON on stdin; runs detached so it never blocks the session.
[ "${HOLOCRON_MEMORY_BACKEND:-}" = "instinct" ] || exit 0
[ -n "${INSTINCT_INTERNAL:-}" ] && exit 0
input=$(cat)
core="${HOLOCRON_DIR:-${HOLOCRON_REPO_ROOT:-$(cd "$(dirname "$0")/../../.." && pwd)}}/tools/instinct/instinct.ts"
printf '%s' "$input" | nohup bun "$core" hook-stop >/dev/null 2>&1 &
exit 0
