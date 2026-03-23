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
#
# opencode  — granular: individual subdirs are symlinked into ~/.config/opencode

declare -A HARNESSES
HARNESSES["opencode"]="$HOME/.config/opencode"

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
  mkdir -p "$HOLOCRON_MEMORY_DIR/STATE"
  mkdir -p "$HOLOCRON_MEMORY_DIR/WORK"
  mkdir -p "$HOLOCRON_MEMORY_DIR/LEARNING/REFLECTIONS"
  mkdir -p "$HOLOCRON_MEMORY_DIR/LEARNING/SIGNALS"
  mkdir -p "$HOLOCRON_MEMORY_DIR/LEARNING/CAPTURES"
  mkdir -p "$HOLOCRON_MEMORY_DIR/LEARNING/PROCESSED"
  echo "  ✓  Memory directories scaffolded"

  # ── Settings file ─────────────────────────────────────────────────────────
  # Write a default holocron.settings.json only if one does not already exist.
  # This file controls feature flags (e.g. ralph_loop.enabled) and lives in
  # the private memory repo so it is personal and backed up.
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
echo ""

# ── Plugin dependencies ───────────────────────────────────────────────────────
# Install npm/bun dependencies for each plugin that has a package.json.
# Plugins are loaded by OpenCode directly from source (Bun TS runtime), so no
# build step is needed — but node_modules must be present for type resolution.

echo "Plugin dependencies"
if command -v bun &>/dev/null; then
  for plugin_dir in "$HOLOCRON_DIR/plugins"/*/; do
    if [[ -f "$plugin_dir/package.json" ]]; then
      plugin_name="$(basename "$plugin_dir")"
      echo "  Installing $plugin_name..."
      (cd "$plugin_dir" && bun install --silent 2>&1 | tail -1)
      echo "  ✓  $plugin_name"
    fi
  done
else
  echo "  ⚠  bun not found — skipping plugin dependency install"
  echo "     Install bun (https://bun.sh) and re-run install.sh"
fi
echo ""

# ── Symlink each harness ─────────────────────────────────────────────────────

# opencode: granular — symlink individual subdirs into ~/.config/opencode
DIRS=("skills" "commands" "agents" "plugins" "instructions" "scripts")

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
# global instruction file.
if [[ -n "${HARNESSES[opencode]+_}" ]]; then
  link_file "$HOLOCRON_DIR/instructions/AGENTS.md" "${HARNESSES[opencode]}/AGENTS.md" "opencode/AGENTS.md"
  # opencode.json lives in the private memory repo (machine-specific paths + commands).
  # Only symlink it if HOLOCRON_MEMORY_DIR is set and the file exists.
  if [[ -n "$HOLOCRON_MEMORY_DIR" && -f "$HOLOCRON_MEMORY_DIR/opencode.json" ]]; then
    link_file "$HOLOCRON_MEMORY_DIR/opencode.json" "${HARNESSES[opencode]}/opencode.json" "opencode.json (from memory repo)"
  else
    echo "  ℹ  opencode.json skipped — add it to \$HOLOCRON_MEMORY_DIR to enable"
  fi
fi

echo ""

# ── Claude CLI harness symlinks ───────────────────────────────────────────────
# Claude CLI reads from ~/.claude/ directly — the ~/.config/Claude → ~/.config/opencode
# symlink does NOT cover ~/.claude/commands/ or ~/.claude/skills/. These must be
# symlinked explicitly. Skills and commands are read from the Holocron repo source.
#
# Claude CLI skill discovery: ~/.claude/skills/<name>/SKILL.md (personal skills)
# Claude CLI command discovery: ~/.claude/commands/<name>.md

echo "Claude CLI harness (~/.claude/)"
CLAUDE_DIR="$HOME/.claude"
mkdir -p "$CLAUDE_DIR"

# commands/ and skills/ — point directly at Holocron source
link_dir "$HOLOCRON_DIR/commands" "$CLAUDE_DIR/commands" "claude/commands"
link_dir "$HOLOCRON_DIR/skills"   "$CLAUDE_DIR/skills"   "claude/skills"

# settings.json and CLAUDE.md — versioned in config/claude/, symlinked here
link_file "$HOLOCRON_DIR/config/claude/settings.json" "$CLAUDE_DIR/settings.json" "claude/settings.json"
link_file "$HOLOCRON_DIR/config/claude/CLAUDE.md"     "$CLAUDE_DIR/CLAUDE.md"     "claude/CLAUDE.md"

echo ""

echo "Done. Restart your agent harness to pick up the new config."
