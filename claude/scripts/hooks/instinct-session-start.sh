#!/usr/bin/env bash
# instinct-session-start.sh — Tier 1 injection for the Instinct memory backend (specs/002)
# Hook event: SessionStart. Silent no-op unless HOLOCRON_MEMORY_BACKEND=instinct.
[ "${HOLOCRON_MEMORY_BACKEND:-}" = "instinct" ] || exit 0
exec bun "${HOLOCRON_DIR:-${HOLOCRON_REPO_ROOT:-$(cd "$(dirname "$0")/../../.." && pwd)}}/tools/instinct/instinct.ts" hook-session-start
