#!/usr/bin/env bash
# Holocron install script — Mac & Linux
# Symlinks Holocron config into the active agent harness directories.

set -e

HOLOCRON_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Holocron install"
echo "Source: $HOLOCRON_DIR"
echo ""

# ── Harness targets ──────────────────────────────────────────────────────────
# Add new harnesses here as they become supported.

declare -A HARNESSES
HARNESSES["opencode"]="$HOME/.opencode"
# HARNESSES["claude-code"]="$HOME/.claude"   # future

# ── Helpers ──────────────────────────────────────────────────────────────────

link_dir() {
  local src="$1"
  local dest="$2"
  local label="$3"

  if [[ -L "$dest" ]]; then
    echo "  ⚠  $label already symlinked — skipping"
  elif [[ -e "$dest" ]]; then
    echo "  ⚠  $label exists as a real directory — skipping (remove manually to replace)"
  else
    ln -s "$src" "$dest"
    echo "  ✓  $label → $dest"
  fi
}

link_file() {
  local src="$1"
  local dest="$2"
  local label="$3"

  if [[ -L "$dest" ]]; then
    echo "  ⚠  $label already symlinked — skipping"
  elif [[ -e "$dest" ]]; then
    echo "  ⚠  $label exists as a real file — skipping (remove manually to replace)"
  else
    ln -s "$src" "$dest"
    echo "  ✓  $label → $dest"
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
fi
echo ""

# ── Symlink each harness ─────────────────────────────────────────────────────

DIRS=("skills" "commands" "plugins" "instructions")

for harness in "${!HARNESSES[@]}"; do
  target="${HARNESSES[$harness]}"
  echo "Harness: $harness ($target)"
  mkdir -p "$target"
  for dir in "${DIRS[@]}"; do
    link_dir "$HOLOCRON_DIR/$dir" "$target/$dir" "$dir"
  done
  echo ""
done

# ── Harness-specific file symlinks ───────────────────────────────────────────
# Some harnesses read specific files from locations outside the main harness
# directory. These are symlinked individually.

echo "Harness config files"

# OpenCode reads AGENTS.md from ~/.config/opencode/AGENTS.md as its primary
# global instruction file (takes precedence over ~/.claude/CLAUDE.md fallback).
if [[ -n "${HARNESSES[opencode]+_}" ]]; then
  mkdir -p "$HOME/.config/opencode"
  link_file "$HOLOCRON_DIR/instructions/AGENTS.md" "$HOME/.config/opencode/AGENTS.md" "opencode/AGENTS.md"
fi
echo ""

echo "Done. Restart your agent harness to pick up the new config."
