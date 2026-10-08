#!/usr/bin/env bash
# instinct-prompt.sh — Tier 2 per-prompt retrieval (alias/keyword match → additionalContext)
# Hook event: UserPromptSubmit. Reads hook JSON on stdin. Silent no-op unless backend=instinct.
[ "${HOLOCRON_MEMORY_BACKEND:-}" = "instinct" ] || exit 0
exec bun "${HOLOCRON_DIR:-${HOLOCRON_REPO_ROOT:-$(cd "$(dirname "$0")/../../.." && pwd)}}/tools/instinct/instinct.ts" hook-prompt
