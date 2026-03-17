#!/usr/bin/env bash
# patch-anthropic-auth.sh
#
# Narrows the overly-broad /opencode/gi regex in opencode-anthropic-auth's
# fetch interceptor so it no longer corrupts filesystem paths like
# ~/.config/opencode/ → ~/.config/Claude/.
#
# The upstream bug: https://github.com/anomalyco/opencode/issues/17828
# Closed "not planned" — this patch is the local workaround.
#
# Run after every `brew upgrade opencode` or `opencode update`.
# Safe to run multiple times (idempotent — detects if already patched).

set -e

PLUGIN="$HOME/.cache/opencode/node_modules/opencode-anthropic-auth/index.mjs"

if [[ ! -f "$PLUGIN" ]]; then
  echo "  ⚠  opencode-anthropic-auth not found at $PLUGIN — skipping"
  exit 0
fi

# Check if already patched
if grep -q 'lookahead\|lookbehind\|\?<!\|(?!' "$PLUGIN" 2>/dev/null; then
  echo "  ✓  opencode-anthropic-auth already patched — nothing to do"
  exit 0
fi

# Apply the patch: replace blanket /opencode/gi with a word-boundary-aware version
# that does not match opencode when preceded or followed by / or a word character
sed -i.bak \
  's|\.replace(/opencode/gi, "Claude")|.replace(/(?<![\/\\w])opencode(?![\/\\w])/gi, "Claude")|g' \
  "$PLUGIN"

echo "  ✓  Patched opencode-anthropic-auth: /opencode/gi → word-boundary-safe regex"
echo "     Backup: ${PLUGIN}.bak"
