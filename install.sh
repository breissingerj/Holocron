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

# merge_link_skills — links skill subdirectories from src into dest.
# If a skill subdir exists in both public and private sources, the subdir becomes
# a real directory with individual file symlinks from both (file-level merge).
# Skills only in one source get a plain directory symlink.
merge_link_skills() {
  local public_src="$1"   # Holocron/skills/
  local private_src="$2"  # $HOLOCRON_MEMORY_DIR/skills/ (may be empty/nonexistent)
  local dest="$3"
  local label="$4"

  # Convert directory symlink → real directory
  if [[ -L "$dest" ]]; then
    echo "  ✦  $label: converting directory symlink to real directory…"
    rm "$dest"
    mkdir -p "$dest"
  else
    mkdir -p "$dest"
  fi

  # Link each public skill dir — merge at file level if private counterpart exists
  for skill_dir in "$public_src"/*/; do
    [[ -d "$skill_dir" ]] || continue
    local skill_name dest_skill
    skill_name="$(basename "$skill_dir")"
    dest_skill="$dest/$skill_name"

    if [[ -n "$private_src" && -d "$private_src/$skill_name" ]]; then
      # Merge: real dir + file-level symlinks from both sources
      if [[ -L "$dest_skill" ]]; then rm "$dest_skill"; fi
      mkdir -p "$dest_skill"
      for f in "$skill_dir"/*; do
        [[ -e "$f" ]] || continue
        local fname; fname="$(basename "$f")"
        [[ ! -L "$dest_skill/$fname" && ! -e "$dest_skill/$fname" ]] && ln -s "$f" "$dest_skill/$fname"
      done
      for f in "$private_src/$skill_name"/*; do
        [[ -e "$f" ]] || continue
        local fname; fname="$(basename "$f")"
        if [[ -L "$dest_skill/$fname" ]]; then :
        elif [[ -e "$dest_skill/$fname" ]]; then echo "  ⚠  $label/$skill_name/$fname exists — skipping"
        else ln -s "$f" "$dest_skill/$fname"; echo "  ✓  $label/$skill_name/$fname (private)"
        fi
      done
    else
      link_dir "$skill_dir" "$dest_skill" "$label/$skill_name"
    fi
  done

  # Link any skills that exist ONLY in the private source
  if [[ -n "$private_src" && -d "$private_src" ]]; then
    for skill_dir in "$private_src"/*/; do
      [[ -d "$skill_dir" ]] || continue
      local skill_name; skill_name="$(basename "$skill_dir")"
      local dest_skill="$dest/$skill_name"
      if [[ ! -e "$dest_skill" && ! -L "$dest_skill" ]]; then
        link_dir "$skill_dir" "$dest_skill" "$label/$skill_name (private-only)"
      fi
    done
  fi
}

# merge_link_agents — links individual agent .md files from src into dest.
# If dest is a directory symlink, it is converted to a real directory first.
# Supports merging agents from multiple source directories (public + private).
merge_link_agents() {
  local src="$1"
  local dest="$2"
  local label="$3"

  [[ -d "$src" ]] || return

  # Convert directory symlink → real directory so we can merge multiple sources
  if [[ -L "$dest" ]]; then
    echo "  ✦  $label: converting directory symlink to real directory…"
    rm "$dest"
    mkdir -p "$dest"
  else
    mkdir -p "$dest"
  fi

  local linked=0
  for f in "$src"/*.md; do
    [[ -e "$f" ]] || continue
    local fname
    fname="$(basename "$f")"
    if [[ -L "$dest/$fname" ]]; then
      : # already linked — skip silently
    elif [[ -e "$dest/$fname" ]]; then
      echo "  ⚠  $label/$fname exists as a real file — skipping"
    else
      ln -s "$f" "$dest/$fname"
      linked=$((linked + 1))
    fi
  done
  echo "  ✓  $label → $dest ($linked linked)"
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
  for plugin_dir in "$HOLOCRON_DIR/opencode/plugins"/*/; do
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
# agents is harness-specific: opencode reads opencode/agents/, Claude CLI reads claude/agents/
DIRS=("skills" "commands" "plugins" "instructions" "scripts")

for harness in "${!HARNESSES[@]}"; do
  target="${HARNESSES[$harness]}"
  echo "Harness: $harness ($target)"
  mkdir -p "$target"
  for dir in "${DIRS[@]}"; do
    if [[ "$dir" == "skills" ]]; then
      private_skills=""
      [[ -n "$HOLOCRON_MEMORY_DIR" && -d "$HOLOCRON_MEMORY_DIR/skills" ]] && private_skills="$HOLOCRON_MEMORY_DIR/skills"
      merge_link_skills "$HOLOCRON_DIR/skills" "$private_skills" "$target/skills" "skills"
    elif [[ "$dir" == "plugins" ]]; then
      link_dir "$HOLOCRON_DIR/opencode/plugins" "$target/plugins" "plugins"
    else
      link_dir "$HOLOCRON_DIR/$dir" "$target/$dir" "$dir"
    fi
  done
  # opencode agents: merge public + private agent files into a real directory
  merge_link_agents "$HOLOCRON_DIR/opencode/agents" "$target/agents" "agents (opencode)"
  if [[ -n "$HOLOCRON_MEMORY_DIR" && -d "$HOLOCRON_MEMORY_DIR/agents/opencode" ]]; then
    merge_link_agents "$HOLOCRON_MEMORY_DIR/agents/opencode" "$target/agents" "agents (opencode, private)"
  fi
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
# Claude CLI reads from ~/.claude/ directly. Skills, commands, agents, settings, and
# CLAUDE.md are all symlinked explicitly from their Holocron source locations.
#
# Claude CLI agent discovery: ~/.claude/agents/<name>.md (Claude-schema frontmatter)
# Claude CLI skill discovery: ~/.claude/skills/<name>/SKILL.md
# Claude CLI command discovery: ~/.claude/commands/<name>.md

echo "Claude CLI harness (~/.claude/)"
CLAUDE_DIR="$HOME/.claude"
mkdir -p "$CLAUDE_DIR"

# commands/ — point directly at Holocron source
link_dir "$HOLOCRON_DIR/commands" "$CLAUDE_DIR/commands" "claude/commands"
# skills/ — merge public + private skill dirs into a real directory
PRIVATE_SKILLS=""
[[ -n "$HOLOCRON_MEMORY_DIR" && -d "$HOLOCRON_MEMORY_DIR/skills" ]] && PRIVATE_SKILLS="$HOLOCRON_MEMORY_DIR/skills"
merge_link_skills "$HOLOCRON_DIR/skills" "$PRIVATE_SKILLS" "$CLAUDE_DIR/skills" "claude/skills"
# agents/ — merge public + private agent files into a real directory
merge_link_agents "$HOLOCRON_DIR/claude/agents" "$CLAUDE_DIR/agents" "claude/agents"
if [[ -n "$HOLOCRON_MEMORY_DIR" && -d "$HOLOCRON_MEMORY_DIR/agents/claude" ]]; then
  merge_link_agents "$HOLOCRON_MEMORY_DIR/agents/claude" "$CLAUDE_DIR/agents" "claude/agents (private)"
fi

# settings.json — prefer private copy from memory repo (has real env values);
# fall back to the template in claude/ for fresh installs without a private copy.
if [[ -n "$HOLOCRON_MEMORY_DIR" && -f "$HOLOCRON_MEMORY_DIR/settings.json" ]]; then
  link_file "$HOLOCRON_MEMORY_DIR/settings.json" "$CLAUDE_DIR/settings.json" "settings.json (from memory repo)"
else
  link_file "$HOLOCRON_DIR/claude/settings.json" "$CLAUDE_DIR/settings.json" "settings.json (template — set real values in \$HOLOCRON_MEMORY_DIR/settings.json)"
fi
link_file "$HOLOCRON_DIR/claude/CLAUDE.md"     "$CLAUDE_DIR/CLAUDE.md"     "claude/CLAUDE.md"

# Claude-specific instructions and scripts (harness-split from OpenCode equivalents)
link_dir "$HOLOCRON_DIR/claude/instructions" "$CLAUDE_DIR/instructions" "claude/instructions"
link_dir "$HOLOCRON_DIR/claude/scripts"      "$CLAUDE_DIR/scripts"      "claude/scripts"

echo ""

# ── Pi CLI harness symlinks ──────────────────────────────────────────────────
# Pi.dev (https://pi.dev) reads from ~/.pi/agent/ directly. Its conventions:
#   - AGENTS.md            — auto-loaded as context file (no @file imports)
#   - skills/<name>/SKILL.md — Agent Skills standard, recursive discovery
#   - prompts/*.md         — prompt templates (non-recursive, top-level only)
#   - extensions/*.ts      — TypeScript extensions (different API from OpenCode plugins)
#   - settings.json        — user-configured; install.sh does NOT touch it
#
# Pi enforces the Agent Skills spec strictly: skill names must be lowercase a-z, 0-9,
# hyphens only, and must match the parent directory name. Skills with invalid names
# still load but produce startup warnings. To avoid warnings, pi uses harness-specific
# SKILL.md wrappers in pi/skills/<slug>/ with compliant frontmatter, while
# supporting files are symlinked from the canonical skills/<OriginalName>/ directory.
#
# Holocron commands/ map to pi prompts/ (both are flat .md files).
# Pi extensions live in extensions/ (top-level). Each subdir is symlinked into
# ~/.pi/agent/extensions/ by the extensions/ block below. See extensions/PORTING-PLAN.md.

# link_pi_skill — creates a pi-compliant skill dir by merging a pi-specific SKILL.md
# (compliant name/description) with supporting files from the original skill directory.
#
# Usage: link_pi_skill <original_name> <pi_slug> <pi_wrapper_dir> <public_skill_dir> <private_src> <dest_root> <label>
#   original_name    e.g. "Agents"
#   pi_slug          e.g. "agents"
#   pi_wrapper_dir   e.g. "$HOLOCRON_DIR/pi/skills"
#   public_skill_dir e.g. "$HOLOCRON_DIR/skills/Agents"
#   private_src      e.g. "$HOLOCRON_MEMORY_DIR/skills/Agents" (or "" if none)
#   dest_root        e.g. "$PI_DIR/skills"
#   label            e.g. "pi/skills"
link_pi_skill() {
  local original_name="$1"
  local pi_slug="$2"
  local pi_wrapper_dir="$3"
  local public_skill_dir="$4"
  local private_src="$5"
  local dest_root="$6"
  local label="$7"

  local dest="$dest_root/$pi_slug"

  # Remove legacy CamelCase symlink/dir at the original name (migration cleanup)
  local legacy="$dest_root/$original_name"
  if [[ -L "$legacy" ]]; then
    rm "$legacy"
    echo "  ✓  $label: removed legacy symlink $original_name → replaced by $pi_slug"
  elif [[ -d "$legacy" && "$legacy" != "$dest" ]]; then
    rm -rf "$legacy"
    echo "  ✓  $label: removed legacy dir $original_name → replaced by $pi_slug"
  fi

  # Convert any existing symlink at the slug path to a real directory
  if [[ -L "$dest" ]]; then
    rm "$dest"
  fi
  mkdir -p "$dest"

  # Symlink the pi-compliant SKILL.md from the wrapper
  local wrapper_skill="$pi_wrapper_dir/$pi_slug/SKILL.md"
  if [[ -f "$wrapper_skill" ]]; then
    if [[ ! -L "$dest/SKILL.md" && ! -e "$dest/SKILL.md" ]]; then
      ln -s "$wrapper_skill" "$dest/SKILL.md"
      echo "  ✓  $label/$pi_slug/SKILL.md (pi wrapper)"
    fi
  else
    echo "  ⚠  $label/$pi_slug: no pi wrapper found at $wrapper_skill"
  fi

  # Symlink all supporting files from the original public skill dir (skip SKILL.md)
  if [[ -d "$public_skill_dir" ]]; then
    for f in "$public_skill_dir"/*; do
      [[ -e "$f" || -L "$f" ]] || continue
      local fname; fname="$(basename "$f")"
      [[ "$fname" == "SKILL.md" ]] && continue
      if [[ ! -L "$dest/$fname" && ! -e "$dest/$fname" ]]; then
        ln -s "$f" "$dest/$fname"
      fi
    done
  fi

  # Merge private skill files (if any) — private SKILL.md is skipped (pi wrapper takes precedence)
  if [[ -n "$private_src" && -d "$private_src" ]]; then
    for f in "$private_src"/*; do
      [[ -e "$f" || -L "$f" ]] || continue
      local fname; fname="$(basename "$f")"
      [[ "$fname" == "SKILL.md" ]] && continue
      if [[ -L "$dest/$fname" ]]; then
        :
      elif [[ -e "$dest/$fname" ]]; then
        echo "  ⚠  $label/$pi_slug/$fname exists — skipping"
      else
        ln -s "$f" "$dest/$fname"
        echo "  ✓  $label/$pi_slug/$fname (private)"
      fi
    done
  fi
}

echo "Pi CLI harness (~/.pi/agent/)"
PI_DIR="$HOME/.pi/agent"
mkdir -p "$PI_DIR"

# AGENTS.md — pi-specific top-level context file
link_file "$HOLOCRON_DIR/pi/AGENTS.md" "$PI_DIR/AGENTS.md" "pi/AGENTS.md"

# instructions/ — algorithm.md + steering-rules.md are referenced by absolute path in AGENTS.md
link_dir "$HOLOCRON_DIR/instructions" "$PI_DIR/instructions" "pi/instructions"

# scripts/ — voice.sh and other Holocron scripts
link_dir "$HOLOCRON_DIR/scripts" "$PI_DIR/scripts" "pi/scripts"

# commands/ → pi prompts/
link_dir "$HOLOCRON_DIR/commands" "$PI_DIR/prompts" "pi/prompts (from commands)"

# skills/ — pi uses harness-specific SKILL.md wrappers for skills with CamelCase names
# (Agent Skills spec requires lowercase names matching the directory name).
# Compliant skills (already lowercase) are linked directly.
mkdir -p "$PI_DIR/skills"
PI_WRAPPER_DIR="$HOLOCRON_DIR/pi/skills"

# Skills that need pi-compliant wrappers: CamelCase original → lowercase slug
declare -a PI_SKILL_MAPPINGS=(
  "Agents:agents"
  "ContentAnalysis:content-analysis"
  "Investigation:investigation"
  "Media:media"
  "RedisCloud:redis-cloud"
  "Research:research"
  "Scraping:scraping"
  "Security:security"
  "Telos:telos"
  "Thinking:thinking"
  "USMetrics:us-metrics"
  "Utilities:utilities"
)

for mapping in "${PI_SKILL_MAPPINGS[@]}"; do
  original="${mapping%%:*}"
  slug="${mapping##*:}"
  private_skill=""
  [[ -n "$HOLOCRON_MEMORY_DIR" && -d "$HOLOCRON_MEMORY_DIR/skills/$original" ]] && private_skill="$HOLOCRON_MEMORY_DIR/skills/$original"
  link_pi_skill "$original" "$slug" "$PI_WRAPPER_DIR" "$HOLOCRON_DIR/skills/$original" "$private_skill" "$PI_DIR/skills" "pi/skills"
done

# Compliant skills (already lowercase) — link directly
declare -a PI_COMPLIANT_SKILLS=("acli" "langsmith-cli" "mermaid" "op-1password" "playwright-cli" "volume")
for skill in "${PI_COMPLIANT_SKILLS[@]}"; do
  src="$HOLOCRON_DIR/skills/$skill"
  [[ -d "$src" ]] || continue
  dest="$PI_DIR/skills/$skill"
  private_skill=""
  [[ -n "$HOLOCRON_MEMORY_DIR" && -d "$HOLOCRON_MEMORY_DIR/skills/$skill" ]] && private_skill="$HOLOCRON_MEMORY_DIR/skills/$skill"
  if [[ -n "$private_skill" ]]; then
    # Merge public + private at file level
    if [[ -L "$dest" ]]; then rm "$dest"; fi
    mkdir -p "$dest"
    for f in "$src"/*; do
      [[ -e "$f" ]] || continue
      fname="$(basename "$f")"
      [[ ! -L "$dest/$fname" && ! -e "$dest/$fname" ]] && ln -s "$f" "$dest/$fname"
    done
    for f in "$private_skill"/*; do
      [[ -e "$f" ]] || continue
      fname="$(basename "$f")"
      if [[ -L "$dest/$fname" ]]; then :
      elif [[ -e "$dest/$fname" ]]; then echo "  ⚠  pi/skills/$skill/$fname exists — skipping"
      else ln -s "$f" "$dest/$fname"; echo "  ✓  pi/skills/$skill/$fname (private)"
      fi
    done
  else
    link_dir "$src" "$dest" "pi/skills/$skill"
  fi
done

# Also link any private-only skills (exist in memory repo but not in Holocron public skills)
if [[ -n "$HOLOCRON_MEMORY_DIR" && -d "$HOLOCRON_MEMORY_DIR/skills" ]]; then
  for skill_dir in "$HOLOCRON_MEMORY_DIR/skills"/*/; do
    [[ -d "$skill_dir" ]] || continue
    skill_name="$(basename "$skill_dir")"
    dest="$PI_DIR/skills/$skill_name"
    # Skip if already handled (mapped or compliant)
    [[ -e "$dest" || -L "$dest" ]] && continue
    link_dir "$skill_dir" "$dest" "pi/skills/$skill_name (private-only)"
  done
fi

# extensions/ → pi extensions
# Each subdirectory in extensions/ (except _lib/) is symlinked individually
# into ~/.pi/agent/extensions/ and gets bun install if it has a package.json.
mkdir -p "$PI_DIR/extensions"
for ext_dir in "$HOLOCRON_DIR/extensions"/*/; do
  [[ -d "$ext_dir" ]] || continue
  ext_name="$(basename "$ext_dir")"
  [[ "$ext_name" == "_lib" ]] && continue  # _lib is shared helpers, not a standalone extension
  link_dir "$ext_dir" "$PI_DIR/extensions/$ext_name" "pi/extensions/$ext_name"
done

# Install bun deps for any extension that has a package.json
if command -v bun &>/dev/null; then
  for ext_dir in "$HOLOCRON_DIR/extensions"/*/; do
    [[ -d "$ext_dir" ]] || continue
    ext_name="$(basename "$ext_dir")"
    [[ "$ext_name" == "_lib" ]] && continue
    if [[ -f "$ext_dir/package.json" ]]; then
      echo "  Installing $ext_name dependencies..."
      (cd "$ext_dir" && bun install --silent 2>&1 | tail -1)
      echo "  ✓  $ext_name"
    fi
  done
else
  echo "  ⚠  bun not found — skipping extension dependency install"
fi

# NOTE: ~/.pi/agent/settings.json is user-configured (provider defaults, auth).
# install.sh intentionally does not create or overwrite it. If you want to wire
# Holocron resources via settings.json instead of symlinks, see docs/settings.md
# in pi-mono and add entries manually.
echo "  ℹ  settings.json left untouched (user-configured)"

echo ""

echo "Done. Restart your agent harness to pick up the new config."
