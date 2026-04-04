#!/usr/bin/env bash
# test-hooks.sh — Verify Claude Code Holocron hook wiring and config correctness
#
# Tests all ISC criteria from the Claude-native gap closure task:
# - Gap 1: CLAUDE.md is Claude-native (not importing OpenCode AGENTS.md)
# - Gap 2: All hooks are wired in settings.json
# - Gap 4: WorkCompletionLearning is on SessionEnd, not Stop
# - Gap 5: SessionEnd section exists with all required hooks
# - Gap 6: algorithm.md has Claude Code-specific platform capabilities
# - Directory split: ~/.claude/scripts/hooks/ and ~/.claude/instructions/ exist

set -euo pipefail

PASS=0
FAIL=0
ERRORS=()

pass() { echo "  ✅ $1"; PASS=$((PASS + 1)); }
fail() { echo "  ❌ $1"; FAIL=$((FAIL + 1)); ERRORS+=("$1"); }

check_file_exists() {
  local label="$1" path="$2"
  [[ -f "$path" ]] && pass "$label" || fail "$label: $path not found"
}

check_dir_exists() {
  local label="$1" path="$2"
  [[ -d "$path" ]] && pass "$label" || fail "$label: $path not found"
}

check_file_contains() {
  local label="$1" path="$2" pattern="$3"
  if grep -q "$pattern" "$path" 2>/dev/null; then
    pass "$label"
  else
    fail "$label: '$pattern' not found in $path"
  fi
}

check_file_not_contains() {
  local label="$1" path="$2" pattern="$3"
  if grep -q "$pattern" "$path" 2>/dev/null; then
    fail "$label: '$pattern' found in $path (should be absent)"
  else
    pass "$label"
  fi
}

check_json_contains() {
  local label="$1" file="$2" jq_expr="$3"
  local result
  result=$(jq -e "$jq_expr" "$file" 2>/dev/null) && pass "$label" || fail "$label: jq query failed — $jq_expr"
}

echo ""
echo "══════════════════════════════════════════════════"
echo "  Holocron Claude Code Hook & Config Test Suite"
echo "══════════════════════════════════════════════════"
echo ""

CLAUDE_DIR="$HOME/.claude"
OPENCODE_DIR="$HOME/.config/opencode"
HOOKS_DIR="$HOME/Projects/personalProjects/holocron-context/hooks"
SETTINGS="$CLAUDE_DIR/settings.json"
CLAUDE_MD="$CLAUDE_DIR/CLAUDE.md"
ALGO_CLAUDE="$CLAUDE_DIR/instructions/algorithm.md"

# ── Gap 1: CLAUDE.md is Claude-native ─────────────────────────────────────
echo "▶ Gap 1 — CLAUDE.md is Claude-native"
check_file_exists        "ISC-1a: CLAUDE.md exists" "$CLAUDE_MD"
check_file_not_contains  "ISC-1: CLAUDE.md does NOT import opencode AGENTS.md" \
  "$CLAUDE_MD" "@.*opencode/AGENTS.md"
check_file_contains      "ISC-2: CLAUDE.md has NATIVE mode definition" \
  "$CLAUDE_MD" "NATIVE MODE"
check_file_contains      "ISC-2b: CLAUDE.md has ALGORITHM mode definition" \
  "$CLAUDE_MD" "ALGORITHM MODE"
check_file_contains      "ISC-2c: CLAUDE.md has MINIMAL mode definition" \
  "$CLAUDE_MD" "MINIMAL MODE"
check_file_contains      "ISC-3: CLAUDE.md references ~/.claude/instructions/algorithm.md" \
  "$CLAUDE_MD" "~/.claude/instructions/algorithm.md"
check_file_contains      "ISC-4: CLAUDE.md imports steering-rules.md" \
  "$CLAUDE_MD" "steering-rules.md"
check_file_contains      "ISC-5: CLAUDE.md imports MEMORY.md from holocron-context" \
  "$CLAUDE_MD" "holocron-context/memory/MEMORY.md"

echo ""

# ── Gap 2: Hook wiring completeness ───────────────────────────────────────
echo "▶ Gap 2 — Hook wiring completeness in settings.json"
check_file_exists "settings.json exists" "$SETTINGS"

# SessionEnd section
check_json_contains "ISC-6: SessionEnd section exists" \
  "$SETTINGS" '.hooks.SessionEnd'

# SessionStart — KittyEnvPersist
check_json_contains "ISC-7: KittyEnvPersist in SessionStart" \
  "$SETTINGS" '[.hooks.SessionStart[].hooks[] | .command] | any(contains("KittyEnvPersist"))'

# Stop — VoiceCompletion, DocIntegrity, ResponseTabReset
check_json_contains "ISC-8: VoiceCompletion in Stop" \
  "$SETTINGS" '[.hooks.Stop[].hooks[] | .command] | any(contains("VoiceCompletion"))'
check_json_contains "ISC-9: DocIntegrity in Stop" \
  "$SETTINGS" '[.hooks.Stop[].hooks[] | .command] | any(contains("DocIntegrity"))'
check_json_contains "ISC-10: ResponseTabReset in Stop" \
  "$SETTINGS" '[.hooks.Stop[].hooks[] | .command] | any(contains("ResponseTabReset"))'

# UserPromptSubmit — SessionAutoName, UpdateTabTitle
check_json_contains "ISC-11: SessionAutoName in UserPromptSubmit" \
  "$SETTINGS" '[.hooks.UserPromptSubmit[].hooks[] | .command] | any(contains("SessionAutoName"))'
check_json_contains "ISC-12: UpdateTabTitle in UserPromptSubmit" \
  "$SETTINGS" '[.hooks.UserPromptSubmit[].hooks[] | .command] | any(contains("UpdateTabTitle"))'

# PreToolUse — SkillGuard, SetQuestionTab
check_json_contains "ISC-13: SkillGuard in PreToolUse (matcher Skill)" \
  "$SETTINGS" '[.hooks.PreToolUse[] | select(.matcher == "Skill") | .hooks[] | .command] | any(contains("SkillGuard"))'
check_json_contains "ISC-14: SetQuestionTab in PreToolUse (matcher AskUserQuestion)" \
  "$SETTINGS" '[.hooks.PreToolUse[] | select(.matcher == "AskUserQuestion") | .hooks[] | .command] | any(contains("SetQuestionTab"))'

# PostToolUse — QuestionAnswered
check_json_contains "ISC-15: QuestionAnswered in PostToolUse (matcher AskUserQuestion)" \
  "$SETTINGS" '[.hooks.PostToolUse[] | select(.matcher == "AskUserQuestion") | .hooks[] | .command] | any(contains("QuestionAnswered"))'

echo ""

# ── Gap 4 & 5: SessionEnd placement ───────────────────────────────────────
echo "▶ Gap 4 & 5 — SessionEnd hooks and WCL placement"

# WCL must NOT be in Stop
check_json_contains "ISC-16: WorkCompletionLearning NOT in Stop" \
  "$SETTINGS" '([.hooks.Stop[].hooks[] | .command] | any(contains("WorkCompletionLearning"))) | not'

# WCL must be in SessionEnd
check_json_contains "ISC-17: WorkCompletionLearning in SessionEnd" \
  "$SETTINGS" '[.hooks.SessionEnd[].hooks[] | .command] | any(contains("WorkCompletionLearning"))'

# RelationshipMemory in SessionEnd
check_json_contains "ISC-18: RelationshipMemory in SessionEnd" \
  "$SETTINGS" '[.hooks.SessionEnd[].hooks[] | .command] | any(contains("RelationshipMemory"))'

# SessionCleanup in SessionEnd
check_json_contains "ISC-19: SessionCleanup in SessionEnd" \
  "$SETTINGS" '[.hooks.SessionEnd[].hooks[] | .command] | any(contains("SessionCleanup"))'

# IntegrityCheck in SessionEnd
check_json_contains "ISC-20: IntegrityCheck in SessionEnd" \
  "$SETTINGS" '[.hooks.SessionEnd[].hooks[] | .command] | any(contains("IntegrityCheck"))'

# UpdateCounts in SessionEnd
check_json_contains "ISC-21: UpdateCounts in SessionEnd" \
  "$SETTINGS" '[.hooks.SessionEnd[].hooks[] | .command] | any(contains("UpdateCounts"))'

# WCL must be first in SessionEnd (before SessionCleanup)
check_json_contains "ISC-19b: SessionCleanup is LAST in SessionEnd (after WCL)" \
  "$SETTINGS" '
    (.hooks.SessionEnd[].hooks | map(.command) | flatten) as $cmds |
    (($cmds | index([ .[] | select(contains("WorkCompletionLearning")) ][0])) as $wcl_idx |
    ($cmds | index([ .[] | select(contains("SessionCleanup")) ][0])) as $sc_idx |
    $wcl_idx < $sc_idx)'

echo ""

# ── Gap 6: Claude Code algorithm.md ────────────────────────────────────────
echo "▶ Gap 6 — Claude Code algorithm.md Platform Capabilities"
check_file_exists       "ISC-22: ~/.claude/instructions/algorithm.md exists" "$ALGO_CLAUDE"
check_file_not_contains "ISC-23: No @plan TUI reference" \
  "$ALGO_CLAUDE" "@plan"
check_file_not_contains "ISC-24: No sourcegraph reference" \
  "$ALGO_CLAUDE" "sourcegraph"
check_file_contains     "ISC-25: Skill tool listed as first-class built-in" \
  "$ALGO_CLAUDE" "first-class Claude Code built-in"

echo ""

# ── Directory split ─────────────────────────────────────────────────────────
echo "▶ Directory split — ~/.claude/ harness-specific structure"
check_dir_exists  "ISC-26a: ~/.claude/scripts/hooks/ exists" "$CLAUDE_DIR/scripts/hooks"
check_file_exists "ISC-26b: prd-sync.sh rsynced" "$CLAUDE_DIR/scripts/hooks/prd-sync.sh"
check_file_exists "ISC-26c: memory-feed.sh rsynced" "$CLAUDE_DIR/scripts/hooks/memory-feed.sh"
check_file_exists "ISC-26d: glob-rules.sh rsynced" "$CLAUDE_DIR/scripts/hooks/glob-rules.sh"
check_file_exists "ISC-26e: stop-guard.sh rsynced" "$CLAUDE_DIR/scripts/hooks/stop-guard.sh"
check_file_exists "ISC-26f: session-start.sh rsynced" "$CLAUDE_DIR/scripts/hooks/session-start.sh"

check_json_contains "ISC-27a: prd-sync.sh path references ~/.claude/" \
  "$SETTINGS" '[.hooks.PostToolUse[].hooks[] | .command] | any(contains("~/.claude/scripts/hooks/prd-sync.sh"))'
check_json_contains "ISC-27b: memory-feed.sh path references ~/.claude/" \
  "$SETTINGS" '[.hooks.PostToolUse[].hooks[] | .command] | any(contains("~/.claude/scripts/hooks/memory-feed.sh"))'
check_json_contains "ISC-27c: glob-rules.sh path references ~/.claude/" \
  "$SETTINGS" '[.hooks.PostToolUse[].hooks[] | .command] | any(contains("~/.claude/scripts/hooks/glob-rules.sh"))'
check_json_contains "ISC-27d: stop-guard.sh path references ~/.claude/" \
  "$SETTINGS" '[.hooks.Stop[].hooks[] | .command] | any(contains("~/.claude/scripts/hooks/stop-guard.sh"))'
check_json_contains "ISC-27e: session-start.sh path references ~/.claude/" \
  "$SETTINGS" '[.hooks.PreCompact[].hooks[] | .command] | any(contains("~/.claude/scripts/hooks/session-start.sh"))'

echo ""

# ── Hook files exist ─────────────────────────────────────────────────────────
echo "▶ Sanity — all referenced hook .ts files exist"
for hook in KittyEnvPersist LoadContext AgentExecutionGuard SecurityValidator \
    SkillGuard SetQuestionTab RatingCapture SessionAutoName UpdateTabTitle \
    QuestionAnswered LastResponseCache VoiceCompletion DocIntegrity ResponseTabReset \
    WorkCompletionLearning RelationshipMemory IntegrityCheck UpdateCounts SessionCleanup; do
  check_file_exists "$hook.hook.ts" "$HOOKS_DIR/${hook}.hook.ts"
done

echo ""
echo "══════════════════════════════════════════════════"
echo "  Results: $PASS passed, $FAIL failed"
if [[ ${#ERRORS[@]} -gt 0 ]]; then
  echo ""
  echo "  Failed:"
  for e in "${ERRORS[@]}"; do echo "    • $e"; done
fi
echo "══════════════════════════════════════════════════"
echo ""
[[ $FAIL -eq 0 ]] && exit 0 || exit 1
