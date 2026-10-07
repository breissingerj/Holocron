#!/usr/bin/env bash
# Holocron install script — Mac & Linux
# Converges the live machine (~/.claude/, ~/.pi/agent/) to match this repo.
# Supported harnesses: Claude Code, pi. (OpenCode retired — see DECISIONS.md 2026-08-28.)
#
# Usage:
#   install.sh            apply mode (default): converge the live machine
#   install.sh --check    check mode: report drift, change nothing
#
# Exit codes: 0 = converged / clean. 1 = check found failure-class drift.
# 2 = usage error.

set -e

HOLOCRON_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

CHECK_MODE=false
for arg in "$@"; do
  case "$arg" in
    --check) CHECK_MODE=true ;;
    *)
      echo "Unknown option: $arg" >&2
      echo "Usage: install.sh [--check]" >&2
      exit 2
      ;;
  esac
done

echo "Holocron install$($CHECK_MODE && echo ' (--check)')"
echo "Source: $HOLOCRON_DIR"
echo ""

# ── Drift/change accounting ───────────────────────────────────────────────────

CHANGE_COUNT=0
FAIL_COUNT=0
INFO_COUNT=0

# report POINTER CLASS CURRENT EXPECTED ACTION
# CLASS one of: STALE DANGLING MISSING CHURNED PRECEDENCE (failure classes) |
#               EXTERNAL USER_LOCAL UNEXPECTED (informational classes)
report() {
  local pointer="$1" class="$2" current="$3" expected="$4" action="$5"
  case "$class" in
    STALE|DANGLING|MISSING|CHURNED|PRECEDENCE)
      if $CHECK_MODE; then FAIL_COUNT=$((FAIL_COUNT + 1)); else CHANGE_COUNT=$((CHANGE_COUNT + 1)); fi
      ;;
    *)
      INFO_COUNT=$((INFO_COUNT + 1))
      ;;
  esac
  printf "  %-9s %-42s %s → %s  [%s]\n" "$class" "$pointer" "$current" "$expected" "$action"
}

# ── Helpers ──────────────────────────────────────────────────────────────────

# find_case_insensitive_match DIR NAME — echoes the actual basename of an entry
# in DIR that case-insensitively matches NAME, or nothing if none exists.
# Explicit (not filesystem-reliant) so behavior is identical on case-sensitive
# (Linux) and case-insensitive (macOS APFS) filesystems (data-model.md §4).
find_case_insensitive_match() {
  local dir="$1" name="$2"
  [[ -d "$dir" ]] || return 0
  local entry base
  for entry in "$dir"/*; do
    [[ -e "$entry" || -L "$entry" ]] || continue
    base="$(basename "$entry")"
    if [[ "${base,,}" == "${name,,}" ]]; then
      echo "$base"
      return 0
    fi
  done
}

# find_renamed_match DIR NEW_SLUG — like find_case_insensitive_match but also
# matches across a CamelCase -> lowercase-hyphen rename (e.g. ContentAnalysis
# -> content-analysis), by comparing both names with case AND hyphens
# stripped. Used only to find legacy pre-rename entries to clean up.
find_renamed_match() {
  local dir="$1" new_slug="$2"
  [[ -d "$dir" ]] || return 0
  local entry base flat_new flat_base
  flat_new="${new_slug//-/}"; flat_new="${flat_new,,}"
  for entry in "$dir"/*; do
    [[ -e "$entry" || -L "$entry" ]] || continue
    base="$(basename "$entry")"
    flat_base="${base//-/}"; flat_base="${flat_base,,}"
    if [[ "$flat_base" == "$flat_new" && "$base" != "$new_slug" ]]; then
      echo "$base"
      return 0
    fi
  done
}

# converge_entry SRC DEST LABEL [CHURN_CHECK] [PRECEDENCE_AWARE]
# The core convergent primitive for a single file-or-directory pointer.
#   - absent            → CREATE
#   - symlink, correct   → silent, no drift
#   - symlink, dangling  → DANGLING → repair
#   - symlink, wrong tgt → STALE (or PRECEDENCE if PRECEDENCE_AWARE=true) → repair
#   - real file/dir      → CHURNED → reset (only if CHURN_CHECK=true)
#                        → USER_LOCAL, left untouched (otherwise)
# Apply mode performs the repair; --check only classifies and reports.
converge_entry() {
  local src="$1" dest="$2" label="$3" churn_check="${4:-false}" precedence_aware="${5:-false}"

  if [[ ! -e "$dest" && ! -L "$dest" ]]; then
    if $CHECK_MODE; then
      report "$dest" "MISSING" "(absent)" "$src" "would create"
    else
      ln -s "$src" "$dest"
      report "$dest" "MISSING" "(absent)" "$src" "CREATED"
    fi
    return 0
  fi

  if [[ -L "$dest" ]]; then
    local target; target="$(readlink "$dest")"
    if [[ "$target" == "$src" ]]; then
      return 0 # correct — no drift
    fi
    local class="STALE"
    if [[ ! -e "$target" ]]; then
      class="DANGLING"
    elif [[ "$precedence_aware" == "true" ]]; then
      class="PRECEDENCE"
    fi
    if $CHECK_MODE; then
      report "$dest" "$class" "$target" "$src" "would repair"
    else
      rm "$dest"; ln -s "$src" "$dest"
      report "$dest" "$class" "$target" "$src" "REPAIRED"
    fi
    return 0
  fi

  # real file or directory at $dest
  if [[ "$churn_check" == "true" ]]; then
    if $CHECK_MODE; then
      report "$dest" "CHURNED" "(real, unlinked)" "$src" "would reset"
    else
      rm -rf "$dest"; ln -s "$src" "$dest"
      report "$dest" "CHURNED" "(real, unlinked)" "$src" "RESET"
    fi
    return 0
  fi

  report "$dest" "USER_LOCAL" "(real $label, unmanaged)" "-" "SKIPPED"
  return 1
}

# install_claude_skills SKILLS_SRC
# Skills reach Claude Code through the `skills` CLI (npx skills add), one
# skill at a time, instead of being symlinked from the repo by hand.
#  1. Legacy cleanup: symlinks into $SKILLS_SRC (and the old merged real
#     directory) left in ~/.claude/skills by earlier installers are removed.
#  2. Each skill in $SKILLS_SRC with a SKILL.md is installed globally for the
#     claude-code agent. Already-installed skills are skipped (use
#     `npx skills update` to refresh them).
# Hand-added external skills are never touched.
install_claude_skills() {
  local src="$1" dest="$CLAUDE_DIR/skills" entry name target
  mkdir -p "$dest"

  for entry in "$dest"/*; do
    [[ -e "$entry" || -L "$entry" ]] || continue
    name="$(basename "$entry")"
    target=""
    if [[ -L "$entry" ]]; then
      target="$(readlink "$entry")"
      [[ "$target" == "$src"/* || "$target" == "$src" ]] || continue
    elif [[ -d "$entry" && -n "$(find_case_insensitive_match "$src" "$name")" ]] \
         && [[ -z "$(find "$entry" -mindepth 1 -maxdepth 1 ! -type l -print -quit)" ]]; then
      target="(merged symlink dir)"
    else
      continue
    fi
    if $CHECK_MODE; then
      report "$entry" "STALE" "$target" "npx skills add" "would remove legacy link"
    else
      rm -rf "$entry"
      report "$entry" "STALE" "$target" "npx skills add" "REMOVED (legacy link)"
    fi
  done

  local skill_dir skill_name
  for skill_dir in "$src"/*/; do
    [[ -f "$skill_dir/SKILL.md" ]] || continue
    skill_name="$(basename "$skill_dir")"
    [[ -e "$dest/$skill_name/SKILL.md" ]] && continue
    if $CHECK_MODE; then
      report "$dest/$skill_name" "MISSING" "(absent)" "npx skills add" "would install"
    elif npx --yes skills add "$HOLOCRON_DIR" -g -a claude-code -s "$skill_name" -y >/dev/null 2>&1; then
      report "$dest/$skill_name" "MISSING" "(absent)" "npx skills add" "INSTALLED"
    else
      report "$dest/$skill_name" "MISSING" "(absent)" "npx skills add" "FAILED — run: npx skills add $HOLOCRON_DIR -g -a claude-code -s $skill_name -y"
    fi
  done
}

# merge_link_agents SRC DEST LABEL — per-file symlinks for *.md agent
# definitions from SRC into DEST (converted to a real directory if needed).
# Also removes orphaned entries: dangling symlinks in DEST that don't
# correspond to any file currently in SRC (e.g. an agent deleted from the
# source, or a leftover link to a since-removed private-agent path) — a
# class of drift that isn't "STALE" (wrong target) or "DANGLING" against a
# still-expected pointer, so it would otherwise never get cleaned up.
merge_link_agents() {
  local src="$1" dest="$2" label="$3"
  [[ -d "$src" ]] || return 0
  if [[ -L "$dest" ]]; then rm "$dest"; fi
  mkdir -p "$dest"
  local f fname
  for f in "$src"/*.md; do
    [[ -e "$f" ]] || continue
    fname="$(basename "$f")"
    converge_entry "$f" "$dest/$fname" "$label/$fname" false
  done

  for f in "$dest"/*.md; do
    [[ -L "$f" ]] || continue
    fname="$(basename "$f")"
    [[ -e "$src/$fname" ]] && continue
    if [[ -e "$f" ]]; then
      report "$f" "UNEXPECTED" "$(readlink "$f")" "-" "left untouched (no matching source, but resolves)"
    else
      if $CHECK_MODE; then
        report "$f" "DANGLING" "$(readlink "$f")" "(no source — orphan)" "would remove"
      else
        rm "$f"
        report "$f" "DANGLING" "$(readlink "$f")" "(no source — orphan)" "REMOVED"
      fi
    fi
  done
}

# merge_link_chains SRC DEST LABEL — per-file symlinks for *.chain.md files.
# pi-subagents discovers chains from ~/.pi/agent/chains/, not agents/.
merge_link_chains() {
  local src="$1" dest="$2" label="$3"
  [[ -d "$src" ]] || return 0
  if [[ -L "$dest" ]]; then rm "$dest"; fi
  mkdir -p "$dest"
  local f fname
  for f in "$src"/*.chain.md; do
    [[ -e "$f" ]] || continue
    fname="$(basename "$f")"
    converge_entry "$f" "$dest/$fname" "$label/$fname" false
  done
}

# generate_claude_shim — claude/CLAUDE.md is NOT tracked in git (see
# .gitignore + DECISIONS.md 2026-08-28 R1). It is regenerated here as
# instructions/AGENTS.md + claude/claude-tail.md + a primed copy of
# $HOLOCRON_MEMORY_DIR/memory/MEMORY.md, so ~/.claude/CLAUDE.md (symlinked to
# it, unchanged) always resolves to current canonical + Claude-only content.
generate_claude_shim() {
  local out="$HOLOCRON_DIR/claude/CLAUDE.md"
  local tmp; tmp="$(mktemp)"
  {
    echo "<!-- GENERATED by install.sh — do not edit directly. Edit instructions/AGENTS.md, claude/claude-tail.md, or \$HOLOCRON_MEMORY_DIR/memory/MEMORY.md, then re-run install.sh. -->"
    echo ""
    cat "$HOLOCRON_DIR/instructions/AGENTS.md"
    echo ""
    echo "---"
    echo ""
    cat "$HOLOCRON_DIR/claude/claude-tail.md"
    if [[ -n "$HOLOCRON_MEMORY_DIR" && -f "$HOLOCRON_MEMORY_DIR/memory/MEMORY.md" ]]; then
      echo ""
      echo "---"
      echo ""
      echo "## Primed Memory (\$HOLOCRON_MEMORY_DIR/memory/MEMORY.md)"
      echo ""
      cat "$HOLOCRON_MEMORY_DIR/memory/MEMORY.md"
    fi
  } > "$tmp"

  if [[ -f "$out" ]] && cmp -s "$tmp" "$out"; then
    rm "$tmp"
    return 0 # already fresh
  fi

  if $CHECK_MODE; then
    rm "$tmp"
    report "$out" "STALE" "(needs regeneration)" "AGENTS.md+tail+MEMORY.md" "would regenerate"
  else
    mv "$tmp" "$out"
    report "$out" "STALE" "(regenerated)" "AGENTS.md+tail+MEMORY.md" "REGENERATED"
  fi
}

# ── Memory dir ───────────────────────────────────────────────────────────────

echo "Memory directory"
if [[ -z "$HOLOCRON_MEMORY_DIR" ]]; then
  echo "  ℹ  HOLOCRON_MEMORY_DIR is not set."
  echo "     Set it in your shell rc to point to your private memory repo:"
  echo "     export HOLOCRON_MEMORY_DIR=\"/path/to/your/private/memory\""
else
  echo "  ✓  HOLOCRON_MEMORY_DIR=$HOLOCRON_MEMORY_DIR"
  if ! $CHECK_MODE; then
    mkdir -p "$HOLOCRON_MEMORY_DIR/STATE"
    mkdir -p "$HOLOCRON_MEMORY_DIR/WORK"
    mkdir -p "$HOLOCRON_MEMORY_DIR/LEARNING/REFLECTIONS"
    mkdir -p "$HOLOCRON_MEMORY_DIR/LEARNING/SIGNALS"
    mkdir -p "$HOLOCRON_MEMORY_DIR/LEARNING/CAPTURES"
    mkdir -p "$HOLOCRON_MEMORY_DIR/LEARNING/PROCESSED"
    echo "  ✓  Memory directories scaffolded"

    # Settings feature-flag file — personal, lives in the private memory repo.
    SETTINGS_DIR="$HOLOCRON_MEMORY_DIR/settings"
    SETTINGS_FILE="$SETTINGS_DIR/holocron.settings.json"
    mkdir -p "$SETTINGS_DIR"
    if [[ ! -f "$SETTINGS_FILE" ]]; then
      cat > "$SETTINGS_FILE" <<'EOF'
{
  "ralph_loop": {
    "enabled": true
  }
}
EOF
      echo "  ✓  Settings scaffolded → $SETTINGS_FILE"
    else
      echo "  ✓  Settings already exist → $SETTINGS_FILE"
    fi
  fi
fi
echo ""

# ── MCPVault (Obsidian) ───────────────────────────────────────────────────────
if ! $CHECK_MODE; then
  echo "MCPVault (Obsidian)"
  if [[ -z "$HOLOCRON_MEMORY_DIR" ]]; then
    echo "  ℹ  MCPVault skipped — HOLOCRON_MEMORY_DIR is not set"
  elif ! command -v claude &>/dev/null; then
    echo "  ⚠  Claude CLI not found — MCPVault skipped"
  else
    _mcp_servers="$(claude mcp list 2>&1 || true)"
    if [[ "$_mcp_servers" == *"obsidian:"* ]]; then
      echo "  ✓  obsidian MCP server already configured — skipping"
    elif claude mcp add-json obsidian --scope user "{\"type\":\"stdio\",\"command\":\"npx\",\"args\":[\"@bitbonsai/mcpvault@latest\",\"$HOLOCRON_MEMORY_DIR\"]}"; then
      echo "  ✓  obsidian MCP server configured for $HOLOCRON_MEMORY_DIR"
    else
      echo "  ⚠  MCPVault registration failed — run 'claude mcp add-json obsidian --scope user …' manually"
    fi
  fi
  echo ""
fi

# ── Claude Code harness (~/.claude/) ─────────────────────────────────────────

echo "Claude Code harness (~/.claude/)"
CLAUDE_DIR="$HOME/.claude"
mkdir -p "$CLAUDE_DIR" 2>/dev/null || true

converge_entry "$HOLOCRON_DIR/commands" "$CLAUDE_DIR/commands" "claude/commands" false

# Skills: installed per-skill via `npx skills add` (no manual symlink sync).
install_claude_skills "$HOLOCRON_DIR/skills"

# Agents: single canonical source (repo agents/) — no private source exists
# (T008 retired 2026-08-31, see DECISIONS.md).
merge_link_agents "$HOLOCRON_DIR/agents" "$CLAUDE_DIR/agents" "claude/agents"

# instructions/ — repointed from the retired claude/instructions/ (US3, T017)
converge_entry "$HOLOCRON_DIR/instructions" "$CLAUDE_DIR/instructions" "claude/instructions" false
converge_entry "$HOLOCRON_DIR/claude/scripts" "$CLAUDE_DIR/scripts" "claude/scripts" false

# CLAUDE.md — generated shim (R1); the live symlink itself never changes.
generate_claude_shim
converge_entry "$HOLOCRON_DIR/claude/CLAUDE.md" "$CLAUDE_DIR/CLAUDE.md" "claude/CLAUDE.md" false

# settings.json — precedence: memory-repo override (OS-specific, else common)
# > repo template. ~/.claude/settings.local.json is a harness-local user file
# and is never referenced/touched here (R3, FR-013).
_os_settings="settings.json"
[[ "$(uname)" != "Darwin" ]] && _os_settings="settings.linux.json"

CLAUDE_SETTINGS_SRC="$HOLOCRON_DIR/claude/settings.json"
if [[ -n "$HOLOCRON_MEMORY_DIR" && -f "$HOLOCRON_MEMORY_DIR/$_os_settings" ]]; then
  CLAUDE_SETTINGS_SRC="$HOLOCRON_MEMORY_DIR/$_os_settings"
elif [[ -n "$HOLOCRON_MEMORY_DIR" && -f "$HOLOCRON_MEMORY_DIR/settings.json" ]]; then
  CLAUDE_SETTINGS_SRC="$HOLOCRON_MEMORY_DIR/settings.json"
fi
converge_entry "$CLAUDE_SETTINGS_SRC" "$CLAUDE_DIR/settings.json" "claude/settings.json" true true

echo ""

# ── Pi harness (~/.pi/agent/) ────────────────────────────────────────────────

echo "Pi harness (~/.pi/agent/)"
PI_DIR="$HOME/.pi/agent"
mkdir -p "$PI_DIR" 2>/dev/null || true

# AGENTS.md — the canonical file, directly (no pi/AGENTS.md adapter anymore).
converge_entry "$HOLOCRON_DIR/instructions/AGENTS.md" "$PI_DIR/AGENTS.md" "pi/AGENTS.md" false
# APPEND_SYSTEM.md — pi-only always-on overlay (TillDone, Graphiti, backend toggle).
converge_entry "$HOLOCRON_DIR/pi/APPEND_SYSTEM.md" "$PI_DIR/APPEND_SYSTEM.md" "pi/APPEND_SYSTEM.md" false

converge_entry "$HOLOCRON_DIR/instructions" "$PI_DIR/instructions" "pi/instructions" false
converge_entry "$HOLOCRON_DIR/scripts" "$PI_DIR/scripts" "pi/scripts" false
converge_entry "$HOLOCRON_DIR/commands" "$PI_DIR/prompts" "pi/prompts (from commands)" false

# skills/ — no fan-out anymore (FR-007); pi discovers skills via the
# skill-roots.ts resources_discover extension. Remove any leftover fan-out
# directory from the pre-migration layout (informational, not a failure —
# a real state to clean up rather than drift to repair).
if [[ -d "$PI_DIR/skills" && ! -L "$PI_DIR/skills" ]]; then
  if $CHECK_MODE; then
    report "$PI_DIR/skills" "UNEXPECTED" "(legacy fan-out dir)" "(removed by extension)" "would remove"
  else
    rm -rf "$PI_DIR/skills"
    report "$PI_DIR/skills" "UNEXPECTED" "(legacy fan-out dir)" "(removed by extension)" "REMOVED"
  fi
elif [[ -L "$PI_DIR/skills" ]]; then
  rm "$PI_DIR/skills"
fi

# extensions/ — link every subdir and flat .ts file (skip _-prefixed helpers).
# Machine-local opt-out: HOLOCRON_PI_DISABLED_EXTENSIONS="tilldone other" (names
# without .ts) skips linking and unlinks any existing Holocron-managed link. The
# source stays in the repo.
ext_disabled() {
  local n="${1%.ts}" d
  for d in $HOLOCRON_PI_DISABLED_EXTENSIONS; do [[ "$d" == "$n" ]] && return 0; done
  return 1
}
if [[ -d "$HOLOCRON_DIR/pi/extensions" ]]; then
  mkdir -p "$PI_DIR/extensions" 2>/dev/null || true
  for _link in "$PI_DIR/extensions"/*; do
    [[ -L "$_link" ]] || continue
    ext_disabled "$(basename "$_link")" || continue
    [[ "$(readlink "$_link")" == "$HOLOCRON_DIR"/* ]] || continue
    if $CHECK_MODE; then report "$_link" "UNEXPECTED" "(disabled locally)" "-" "would remove"
    else rm "$_link"; report "$_link" "UNEXPECTED" "(disabled locally)" "-" "REMOVED"; fi
  done
  for ext_dir in "$HOLOCRON_DIR/pi/extensions"/*/; do
    [[ -d "$ext_dir" ]] || continue
    ext_name="$(basename "$ext_dir")"
    [[ "$ext_name" == _* ]] && continue
    ext_disabled "$ext_name" && continue
    converge_entry "$ext_dir" "$PI_DIR/extensions/$ext_name" "pi/extensions/$ext_name" false
  done
  for ext_file in "$HOLOCRON_DIR/pi/extensions"/*.ts; do
    [[ -f "$ext_file" ]] || continue
    ext_name="$(basename "$ext_file")"
    ext_disabled "$ext_name" && continue
    converge_entry "$ext_file" "$PI_DIR/extensions/$ext_name" "pi/extensions/$ext_name" false
  done

  if ! $CHECK_MODE && command -v npm &>/dev/null; then
    for ext_dir in "$HOLOCRON_DIR/pi/extensions"/*/; do
      [[ -f "$ext_dir/package.json" ]] || continue
      ext_name="$(basename "$ext_dir")"
      if [[ ! -d "$ext_dir/node_modules" ]]; then
        echo "  Installing dependencies for pi/extensions/$ext_name..."
        (cd "$ext_dir" && npm install --silent 2>&1 | tail -3)
        echo "  ✓  pi/extensions/$ext_name dependencies installed"
      fi
    done
  elif ! $CHECK_MODE; then
    echo "  ⚠  npm not found — skipping pi extension dependency install"
  fi
fi

# pi/agents/ (native roster) + chains/ — untouched by FR-009/FR-010, still
# hand-maintained from pi/agents/.
merge_link_agents "$HOLOCRON_DIR/pi/agents" "$PI_DIR/agents" "pi/agents"
merge_link_chains "$HOLOCRON_DIR/pi/agents" "$PI_DIR/chains" "pi/chains"

# settings.json — only managed if the live path is ALREADY a Holocron-created
# symlink (or absent); a real file is a harness-local user file and is never
# converted to a symlink (R3, FR-013). Precedence: memory-repo override > template.
if [[ -L "$PI_DIR/settings.json" || ! -e "$PI_DIR/settings.json" ]]; then
  PI_SETTINGS_SRC="$HOLOCRON_DIR/pi/settings.json"
  [[ -n "$HOLOCRON_MEMORY_DIR" && -f "$HOLOCRON_MEMORY_DIR/pi-settings.json" ]] && PI_SETTINGS_SRC="$HOLOCRON_MEMORY_DIR/pi-settings.json"
  converge_entry "$PI_SETTINGS_SRC" "$PI_DIR/settings.json" "pi/settings.json" true true
else
  report "$PI_DIR/settings.json" "USER_LOCAL" "(real file, user-local)" "-" "SKIPPED"
fi

echo ""

# ── Summary ───────────────────────────────────────────────────────────────────

if $CHECK_MODE; then
  if [[ $FAIL_COUNT -gt 0 ]]; then
    echo "DRIFT: $FAIL_COUNT failure(s), $INFO_COUNT informational"
    exit 1
  else
    echo "CLEAN${INFO_COUNT:+ ($INFO_COUNT informational)}"
    exit 0
  fi
else
  if [[ $CHANGE_COUNT -gt 0 ]]; then
    echo "$CHANGE_COUNT changes"
  else
    echo "no changes"
  fi
  echo "Restart your agent harness to pick up the new config."
  exit 0
fi
