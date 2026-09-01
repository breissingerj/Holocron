# Claude CLI Harness Validation Playbook

> **Superseded 2026-08-31 (spec 001):** several checks below (§4.4, the `~/.config/opencode/...` paths) validate the retired dual-harness OpenCode+Claude layout and will now report false failures. Use `bash install.sh --check` instead — it implements the same drift-detection intent for the current Claude Code + pi architecture (see `contracts/install-cli.md`). Kept for historical reference only.

Validates that the Claude Code harness has every Holocron component correctly wired.
Run this manually after `install.sh`, after any symlink changes, or when Claude Code
behavior seems off.

---

## How to run

Each check is a bash one-liner. Run them in order. A ✓ means pass; a ✗ means fix
required — the remedy is listed inline.

```bash
bash $HOLOCRON_REPO_ROOT/claude/validate-claude-cli.sh
```

Or run checks manually section by section below.

---

## Section 1 — Core config files

### 1.1 CLAUDE.md exists and is a symlink to the Holocron repo

```bash
[[ -L ~/.claude/CLAUDE.md ]] \
  && echo "✓ CLAUDE.md is a symlink" \
  || echo "✗ CLAUDE.md missing or not a symlink — run install.sh"
```

### 1.2 CLAUDE.md symlink resolves (target exists)

```bash
[[ -f ~/.claude/CLAUDE.md ]] \
  && echo "✓ CLAUDE.md target exists" \
  || echo "✗ CLAUDE.md symlink is broken — check Holocron/claude/CLAUDE.md"
```

### 1.3 CLAUDE.md imports AGENTS.md

```bash
grep -q "@.*AGENTS.md" ~/.claude/CLAUDE.md \
  && echo "✓ CLAUDE.md imports AGENTS.md" \
  || echo "✗ AGENTS.md import missing from CLAUDE.md"
```

### 1.4 CLAUDE.md imports MEMORY.md

```bash
grep -q "@.*MEMORY.md" ~/.claude/CLAUDE.md \
  && echo "✓ CLAUDE.md imports MEMORY.md" \
  || echo "✗ MEMORY.md import missing from CLAUDE.md"
```

### 1.5 settings.json exists and is a symlink

```bash
[[ -L ~/.claude/settings.json ]] \
  && echo "✓ settings.json is a symlink" \
  || echo "✗ settings.json missing or not a symlink — run install.sh"
```

### 1.6 settings.json is valid JSON

```bash
python3 -m json.tool ~/.claude/settings.json > /dev/null 2>&1 \
  && echo "✓ settings.json is valid JSON" \
  || echo "✗ settings.json is invalid JSON"
```

---

## Section 2 — @ import targets

### 2.1 AGENTS.md import path resolves

```bash
AGENTS_PATH=$(grep "@.*AGENTS.md" ~/.claude/CLAUDE.md | sed 's/^@//' | sed "s|~|$HOME|")
[[ -f "$AGENTS_PATH" ]] \
  && echo "✓ AGENTS.md import target exists: $AGENTS_PATH" \
  || echo "✗ AGENTS.md import target missing: $AGENTS_PATH"
```

### 2.2 MEMORY.md import path resolves

```bash
MEM_PATH=$(grep "@.*MEMORY.md" ~/.claude/CLAUDE.md | sed 's/^@//' | sed "s|~|$HOME|")
[[ -f "$MEM_PATH" ]] \
  && echo "✓ MEMORY.md import target exists: $MEM_PATH" \
  || echo "✗ MEMORY.md import target missing: $MEM_PATH — check \$HOLOCRON_MEMORY_DIR"
```

---

## Section 3 — Skills and commands

### 3.1 skills/ is a symlink

```bash
[[ -L ~/.claude/skills ]] \
  && echo "✓ ~/.claude/skills is a symlink" \
  || echo "✗ ~/.claude/skills is not a symlink — run install.sh"
```

### 3.2 skills/ symlink target exists

```bash
[[ -d ~/.claude/skills ]] \
  && echo "✓ ~/.claude/skills target exists" \
  || echo "✗ ~/.claude/skills symlink is broken"
```

### 3.3 At least one skill directory is present

```bash
SKILL_COUNT=$(ls ~/.claude/skills/ 2>/dev/null | grep -v .gitkeep | wc -l | tr -d ' ')
[[ "$SKILL_COUNT" -gt 0 ]] \
  && echo "✓ $SKILL_COUNT skill(s) found in ~/.claude/skills/" \
  || echo "✗ No skills found — check symlink target"
```

### 3.4 commands/ is a symlink

```bash
[[ -L ~/.claude/commands ]] \
  && echo "✓ ~/.claude/commands is a symlink" \
  || echo "✗ ~/.claude/commands is not a symlink — run install.sh"
```

### 3.5 commands/ symlink target exists

```bash
[[ -d ~/.claude/commands ]] \
  && echo "✓ ~/.claude/commands target exists" \
  || echo "✗ ~/.claude/commands symlink is broken"
```

### 3.6 At least one command file is present

```bash
CMD_COUNT=$(ls ~/.claude/commands/*.md 2>/dev/null | grep -v .gitkeep | wc -l | tr -d ' ')
[[ "$CMD_COUNT" -gt 0 ]] \
  && echo "✓ $CMD_COUNT command(s) found in ~/.claude/commands/" \
  || echo "✗ No command files found — check symlink target"
```

---

## Section 4 — Agents

Claude Code reads subagents from `~/.claude/agents/`. Holocron maintains Claude Code
schema agent files at `claude/agents/`, symlinked here by `install.sh`.

### 4.1 agents/ exists as a real directory (merged from public + private)

```bash
[[ -d ~/.claude/agents && ! -L ~/.claude/agents ]] \
  && echo "✓ ~/.claude/agents is a real directory (merge-linked)" \
  || echo "✗ ~/.claude/agents missing or still a symlink — run install.sh"
```

### 4.2 At least one agent symlink resolves

```bash
[[ -f "$(ls ~/.claude/agents/*.md 2>/dev/null | head -1)" ]] \
  && echo "✓ agent symlinks resolve" \
  || echo "✗ no agent .md files found in ~/.claude/agents/"
```

### 4.3 At least 15 agents present

```bash
AGENT_COUNT=$(ls ~/.claude/agents/*.md 2>/dev/null | wc -l | tr -d ' ')
[[ "$AGENT_COUNT" -ge 15 ]] \
  && echo "✓ $AGENT_COUNT agents found" \
  || echo "✗ Expected 15+, found $AGENT_COUNT — check claude/agents/ directory"
```

### 4.4 opencode agents/ exists as a real directory (merged from public + private)

```bash
[[ -d ~/.config/opencode/agents && ! -L ~/.config/opencode/agents ]] \
  && echo "✓ ~/.config/opencode/agents is a real directory (merge-linked)" \
  || echo "✗ ~/.config/opencode/agents missing or still a symlink — run install.sh"
```

---

## Section 5 — Environment variable

### 5.1 HOLOCRON_MEMORY_DIR is set in settings.json

```bash
python3 -c "
import json
d = json.load(open(open('$HOME/.claude/settings.json').name if True else ''))
v = d.get('env', {}).get('HOLOCRON_MEMORY_DIR', '')
print('✓ HOLOCRON_MEMORY_DIR set in settings.json: ' + v if v else '✗ HOLOCRON_MEMORY_DIR missing from settings.json env block')
" 2>/dev/null || python3 -c "
import json, os
d = json.load(open(os.path.expanduser('~/.claude/settings.json')))
v = d.get('env', {}).get('HOLOCRON_MEMORY_DIR', '')
print('✓ HOLOCRON_MEMORY_DIR set in settings.json: ' + v if v else '✗ HOLOCRON_MEMORY_DIR missing from settings.json env block')
"
```

### 5.2 HOLOCRON_MEMORY_DIR path exists on disk

```bash
python3 -c "
import json, os
d = json.load(open(os.path.expanduser('~/.claude/settings.json')))
v = d.get('env', {}).get('HOLOCRON_MEMORY_DIR', '')
if v and os.path.isdir(v):
    print('✓ HOLOCRON_MEMORY_DIR path exists: ' + v)
elif v:
    print('✗ HOLOCRON_MEMORY_DIR path does not exist: ' + v)
else:
    print('✗ HOLOCRON_MEMORY_DIR not set — cannot check path')
"
```

---

## Section 6 — Hook scripts

### 6.1 All six hook scripts exist

```bash
HOOKS_DIR="$HOME/.config/opencode/scripts/hooks"
for script in session-start.sh learning-capture.sh prd-sync.sh memory-feed.sh stop-guard.sh glob-rules.sh; do
  [[ -f "$HOOKS_DIR/$script" ]] \
    && echo "✓ $script exists" \
    || echo "✗ $script MISSING at $HOOKS_DIR/$script"
done
```

### 6.2 All hook scripts are executable

```bash
HOOKS_DIR="$HOME/.config/opencode/scripts/hooks"
for script in session-start.sh learning-capture.sh prd-sync.sh memory-feed.sh stop-guard.sh glob-rules.sh; do
  [[ -x "$HOOKS_DIR/$script" ]] \
    && echo "✓ $script is executable" \
    || echo "✗ $script is NOT executable — run: chmod +x $HOOKS_DIR/$script"
done
```

### 6.3 All hooks are wired in settings.json

```bash
python3 -c "
import json, os
d = json.load(open(os.path.expanduser('~/.claude/settings.json')))
hooks = d.get('hooks', {})
expected = ['SessionStart', 'UserPromptSubmit', 'PostToolUse', 'Stop', 'PreCompact']
for e in expected:
    if e in hooks:
        print('✓ ' + e + ' hook wired')
    else:
        print('✗ ' + e + ' hook MISSING from settings.json')
"
```

### 6.4 Hook scripts exit 0 on empty/nominal input

```bash
HOOKS_DIR="$HOME/.config/opencode/scripts/hooks"
# session-start.sh — no stdin needed, just needs HOLOCRON_MEMORY_DIR set.
# The var comes from your shell profile (see MEMORY_CONTRACT.md), not settings.json.
[[ -n "$HOLOCRON_MEMORY_DIR" ]] \
  && echo "✓ HOLOCRON_MEMORY_DIR=$HOLOCRON_MEMORY_DIR" \
  || echo "✗ HOLOCRON_MEMORY_DIR unset — export it in your shell profile first"

for script in session-start.sh stop-guard.sh; do
  echo '{}' | bash "$HOOKS_DIR/$script" > /dev/null 2>&1
  [[ $? -ne 1 ]] \
    && echo "✓ $script exits cleanly on empty input" \
    || echo "✗ $script exited with error on empty input"
done

for script in learning-capture.sh prd-sync.sh memory-feed.sh glob-rules.sh; do
  echo '{"session_id":"test","prompt":"hello","tool_name":"Read","tool_input":{"file_path":"/tmp/test"},"hook_event_name":"PostToolUse"}' \
    | bash "$HOOKS_DIR/$script" > /dev/null 2>&1
  [[ $? -ne 1 ]] \
    && echo "✓ $script exits cleanly on nominal input" \
    || echo "✗ $script exited with error on nominal input"
done
```

---

## Section 7 — No confusing ~/.config/claude symlink

### 7.1 ~/.config/claude does NOT exist

```bash
[[ ! -e ~/.config/claude ]] \
  && echo "✓ ~/.config/claude does not exist (correct)" \
  || echo "✗ ~/.config/claude exists — this is a stale symlink, remove it: rm ~/.config/claude"
```

---

## Section 8 — MCP

### 8.1 Linear MCP server is enabled in settings.json

```bash
python3 -c "
import json, os
d = json.load(open(os.path.expanduser('~/.claude/settings.json')))
servers = d.get('enabledMcpjsonServers', [])
if 'linear' in servers:
    print('✓ linear MCP server enabled')
else:
    print('✗ linear MCP server not in enabledMcpjsonServers')
"
```

---

## Section 9 — Algorithm and steering rules

AGENTS.md instructs Claude to read both files as mandatory first actions before
any response. If either is missing, the mode system silently falls back to
default Claude behavior.

### 9.1 algorithm.md exists

```bash
[[ -f ~/.config/opencode/instructions/algorithm.md ]] \
  && echo "✓ algorithm.md exists" \
  || echo "✗ algorithm.md MISSING at ~/.config/opencode/instructions/algorithm.md"
```

### 9.2 algorithm.md is non-empty

```bash
[[ -s ~/.config/opencode/instructions/algorithm.md ]] \
  && echo "✓ algorithm.md is non-empty" \
  || echo "✗ algorithm.md is empty"
```

### 9.3 steering-rules.md exists

```bash
[[ -f ~/.config/opencode/instructions/steering-rules.md ]] \
  && echo "✓ steering-rules.md exists" \
  || echo "✗ steering-rules.md MISSING at ~/.config/opencode/instructions/steering-rules.md"
```

### 9.4 steering-rules.md is non-empty

```bash
[[ -s ~/.config/opencode/instructions/steering-rules.md ]] \
  && echo "✓ steering-rules.md is non-empty" \
  || echo "✗ steering-rules.md is empty"
```

### 9.5 AGENTS.md references algorithm.md

```bash
grep -q "algorithm.md" ~/.config/opencode/AGENTS.md 2>/dev/null \
  && echo "✓ AGENTS.md references algorithm.md" \
  || echo "✗ AGENTS.md does not reference algorithm.md"
```

### 9.6 AGENTS.md references steering-rules.md

```bash
grep -q "steering-rules.md" ~/.config/opencode/AGENTS.md 2>/dev/null \
  && echo "✓ AGENTS.md references steering-rules.md" \
  || echo "✗ AGENTS.md does not reference steering-rules.md"
```

---

## Expected passing output

When all checks pass you should see only ✓ lines (plus the one ℹ for agents if
you have no user subagents configured). Any ✗ line requires action before the
Claude Code harness is fully operational.

---

## Known gaps vs. OpenCode

These capabilities exist in OpenCode but have no equivalent in Claude Code — they
are not failures, just documented limitations:

| Capability | OpenCode | Claude Code |
|---|---|---|
| Live response scanning (Ralph Loop) | Full | PRD-state stop-guard only |
| Context injection timing | Pre-response (plugin) | Post-session-start (hook) |
| Programmatic follow-up injection | Yes (`tui.submitPrompt`) | Not possible |
