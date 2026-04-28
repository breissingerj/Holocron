#!/usr/bin/env bash
# Holocron — Claude Code harness validation script
# Runs all checks from claude/ValidateClaudeCLI.md and prints a summary.
# Usage: bash claude/validate-claude-cli.sh

set -uo pipefail

PASS=0
FAIL=0
INFO=0

ok()   { echo "  ✓  $1"; PASS=$((PASS+1)); }
fail() { echo "  ✗  $1"; FAIL=$((FAIL+1)); }
info() { echo "  ℹ  $1"; INFO=$((INFO+1)); }

section() { echo ""; echo "── $1 ──────────────────────────────────────────"; }

# ── 1. Core config files ─────────────────────────────────────────────────────

section "1. Core config files"

[[ -L ~/.claude/CLAUDE.md ]]      && ok "CLAUDE.md is a symlink"         || fail "CLAUDE.md missing or not a symlink — run install.sh"
[[ -f ~/.claude/CLAUDE.md ]]      && ok "CLAUDE.md target exists"         || fail "CLAUDE.md symlink is broken"
grep -q "@.*AGENTS.md"  ~/.claude/CLAUDE.md 2>/dev/null && ok "CLAUDE.md imports AGENTS.md"  || fail "AGENTS.md import missing from CLAUDE.md"
grep -q "@.*MEMORY.md"  ~/.claude/CLAUDE.md 2>/dev/null && ok "CLAUDE.md imports MEMORY.md"  || fail "MEMORY.md import missing from CLAUDE.md"
[[ -L ~/.claude/settings.json ]]  && ok "settings.json is a symlink"     || fail "settings.json missing or not a symlink — run install.sh"
python3 -m json.tool ~/.claude/settings.json > /dev/null 2>&1 && ok "settings.json is valid JSON" || fail "settings.json is invalid JSON"

# ── 2. @ import targets ───────────────────────────────────────────────────────

section "2. @ import targets"

AGENTS_PATH=$(grep "@.*AGENTS.md" ~/.claude/CLAUDE.md 2>/dev/null | sed 's/^@//' | sed "s|~|$HOME|" | tr -d '[:space:]')
if [[ -n "$AGENTS_PATH" ]]; then
  [[ -f "$AGENTS_PATH" ]] && ok "AGENTS.md import target exists" || fail "AGENTS.md import target missing: $AGENTS_PATH"
else
  fail "Could not parse AGENTS.md import path from CLAUDE.md"
fi

MEM_PATH=$(grep "@.*MEMORY.md" ~/.claude/CLAUDE.md 2>/dev/null | sed 's/^@//' | sed "s|~|$HOME|" | tr -d '[:space:]')
if [[ -n "$MEM_PATH" ]]; then
  [[ -f "$MEM_PATH" ]] && ok "MEMORY.md import target exists" || fail "MEMORY.md import target missing: $MEM_PATH"
else
  fail "Could not parse MEMORY.md import path from CLAUDE.md"
fi

# ── 3. Skills and commands ───────────────────────────────────────────────────

section "3. Skills and commands"

[[ -L ~/.claude/skills ]] && ok "~/.claude/skills is a symlink" || fail "~/.claude/skills is not a symlink — run install.sh"
[[ -d ~/.claude/skills ]] && ok "~/.claude/skills target exists" || fail "~/.claude/skills symlink is broken"

SKILL_COUNT=$(ls ~/.claude/skills/ 2>/dev/null | grep -vc ".gitkeep" || true)
[[ "$SKILL_COUNT" -gt 0 ]] && ok "$SKILL_COUNT skill(s) found" || fail "No skills found — check symlink target"

[[ -L ~/.claude/commands ]] && ok "~/.claude/commands is a symlink" || fail "~/.claude/commands is not a symlink — run install.sh"
[[ -d ~/.claude/commands ]] && ok "~/.claude/commands target exists" || fail "~/.claude/commands symlink is broken"

CMD_COUNT=$(ls ~/.claude/commands/*.md 2>/dev/null | grep -vc ".gitkeep" || true)
[[ "$CMD_COUNT" -gt 0 ]] && ok "$CMD_COUNT command(s) found" || fail "No command files found — check symlink target"

# ── 4. Agents ────────────────────────────────────────────────────────────────

section "4. Agents"

[[ -L ~/.claude/agents ]] \
  && ok "~/.claude/agents is a symlink" \
  || fail "~/.claude/agents is not a symlink — run install.sh"

[[ -d ~/.claude/agents ]] \
  && ok "~/.claude/agents target exists" \
  || fail "~/.claude/agents symlink is broken"

AGENT_COUNT=$(ls ~/.claude/agents/*.md 2>/dev/null | wc -l | tr -d ' ')
[[ "$AGENT_COUNT" -ge 15 ]] \
  && ok "$AGENT_COUNT agent(s) found in ~/.claude/agents/" \
  || fail "Expected 15+ agents, found $AGENT_COUNT — check claude/agents/ directory"

[[ "$(readlink ~/.config/opencode/agents 2>/dev/null)" == *"opencode/agents"* ]] \
  && ok "~/.config/opencode/agents → opencode/agents/ (correct)" \
  || fail "~/.config/opencode/agents does not point to opencode/agents/ — run install.sh"

# ── 5. Environment variable ───────────────────────────────────────────────────

section "5. Environment variable (HOLOCRON_MEMORY_DIR)"

MEM_DIR=$(python3 -c "
import json, os
try:
  d = json.load(open(os.path.expanduser('~/.claude/settings.json')))
  print(d.get('env', {}).get('HOLOCRON_MEMORY_DIR', ''))
except: pass
" 2>/dev/null)

if [[ -n "$MEM_DIR" ]]; then
  ok "HOLOCRON_MEMORY_DIR set in settings.json: $MEM_DIR"
  [[ -d "$MEM_DIR" ]] && ok "HOLOCRON_MEMORY_DIR path exists on disk" || fail "HOLOCRON_MEMORY_DIR path does not exist: $MEM_DIR"
else
  fail "HOLOCRON_MEMORY_DIR missing from settings.json env block"
fi

# ── 6. Hook scripts ───────────────────────────────────────────────────────────

section "6. Hook scripts"

HOOKS_DIR="$HOME/.config/opencode/scripts/hooks"
HOOK_SCRIPTS=(session-start.sh learning-capture.sh prd-sync.sh memory-feed.sh stop-guard.sh glob-rules.sh)

for script in "${HOOK_SCRIPTS[@]}"; do
  [[ -f "$HOOKS_DIR/$script" ]] && ok "$script exists"      || fail "$script MISSING at $HOOKS_DIR/$script"
  [[ -x "$HOOKS_DIR/$script" ]] && ok "$script executable"  || fail "$script NOT executable — run: chmod +x $HOOKS_DIR/$script"
done

EXPECTED_HOOKS=(SessionStart UserPromptSubmit PostToolUse Stop PreCompact)
for hook in "${EXPECTED_HOOKS[@]}"; do
  python3 -c "
import json, os, sys
d = json.load(open(os.path.expanduser('~/.claude/settings.json')))
sys.exit(0 if '$hook' in d.get('hooks', {}) else 1)
" 2>/dev/null && ok "$hook hook wired in settings.json" || fail "$hook hook MISSING from settings.json"
done

# nominal exit-code smoke test
export HOLOCRON_MEMORY_DIR="$MEM_DIR"
for script in session-start.sh stop-guard.sh; do
  echo '{}' | bash "$HOOKS_DIR/$script" > /dev/null 2>&1
  RC=$?
  [[ $RC -ne 1 ]] && ok "$script exits cleanly on empty input" || fail "$script exited 1 on empty input"
done

NOMINAL='{"session_id":"test","prompt":"hello","tool_name":"Read","tool_input":{"file_path":"/tmp/nonexistent"},"hook_event_name":"PostToolUse"}'
for script in learning-capture.sh prd-sync.sh memory-feed.sh glob-rules.sh; do
  echo "$NOMINAL" | bash "$HOOKS_DIR/$script" > /dev/null 2>&1
  RC=$?
  [[ $RC -ne 1 ]] && ok "$script exits cleanly on nominal input" || fail "$script exited 1 on nominal input"
done

# ── 7. No stale ~/.config/claude symlink ─────────────────────────────────────

section "7. No stale ~/.config/claude symlink"

[[ ! -e ~/.config/claude ]] \
  && ok "~/.config/claude does not exist (correct)" \
  || fail "~/.config/claude still exists — remove it: rm ~/.config/claude"

# ── 8. MCP ───────────────────────────────────────────────────────────────────

section "8. MCP"

python3 -c "
import json, os, sys
d = json.load(open(os.path.expanduser('~/.claude/settings.json')))
sys.exit(0 if 'linear' in d.get('enabledMcpjsonServers', []) else 1)
" 2>/dev/null && ok "linear MCP server enabled in settings.json" || fail "linear MCP server not in enabledMcpjsonServers"

# ── 9. Algorithm and steering rules ──────────────────────────────────────────

section "9. Algorithm and steering rules"

INSTRUCTIONS_DIR="$HOME/.config/opencode/instructions"

[[ -f "$INSTRUCTIONS_DIR/algorithm.md" ]]      && ok "algorithm.md exists"      || fail "algorithm.md MISSING at $INSTRUCTIONS_DIR/algorithm.md"
[[ -s "$INSTRUCTIONS_DIR/algorithm.md" ]]      && ok "algorithm.md is non-empty" || fail "algorithm.md is empty"
[[ -f "$INSTRUCTIONS_DIR/steering-rules.md" ]] && ok "steering-rules.md exists"      || fail "steering-rules.md MISSING at $INSTRUCTIONS_DIR/steering-rules.md"
[[ -s "$INSTRUCTIONS_DIR/steering-rules.md" ]] && ok "steering-rules.md is non-empty" || fail "steering-rules.md is empty"
grep -q "algorithm.md"     "$HOME/.config/opencode/AGENTS.md" 2>/dev/null && ok "AGENTS.md references algorithm.md"     || fail "AGENTS.md does not reference algorithm.md"
grep -q "steering-rules.md" "$HOME/.config/opencode/AGENTS.md" 2>/dev/null && ok "AGENTS.md references steering-rules.md" || fail "AGENTS.md does not reference steering-rules.md"

# ── Summary ───────────────────────────────────────────────────────────────────

echo ""
echo "════════════════════════════════════════════════════"
echo "  Results: $PASS passed  |  $FAIL failed  |  $INFO info"
echo "════════════════════════════════════════════════════"

[[ $FAIL -gt 0 ]] && exit 1 || exit 0
