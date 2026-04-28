# Holocron

> *A Jedi Holocron is a crystalline device that stores the knowledge and personality of its creator — accessible to any who know how to use it.*

Holocron is a personal agent configuration layer designed to work across any AI agent harness. It contains the skills, commands, plugins, and behavioral rules that make any agent feel like *mine* — not a generic assistant.

The goal is harness-agnostic personalization: the same knowledge, voice, and workflows should be loadable whether I'm running Claude Code, OpenCode, or whatever comes next.

---

## What's in here

- **Skills** — Domain-specific instruction files that activate on intent
- **Commands** — Custom slash commands for recurring workflows
- **Plugins** — OpenCode harness plugins (system prompt injection, context loading, memory sync)
- **Hooks** — Claude Code lifecycle hooks (context injection, PRD sync, security validation)
- **Instructions** — Behavioral rules and algorithm that govern how I want agents to think and respond

---

## Philosophy

Generic AI starts fresh every time with no memory of you or your goals. Holocron is the antidote — a personal artifact that carries your context, your preferences, and your way of working into any session.

The architecture is inspired by [Daniel Miessler's Personal AI Infrastructure](https://github.com/danielmiessler/Personal_AI_Infrastructure): a framework for building personal AI scaffolding that compounds intelligence across every interaction. Holocron adapts those ideas to be portable across agent harnesses rather than tied to a single tool.

---

## Structure

```
Holocron/
  skills/        # Markdown skill files loaded as agent context
  commands/      # Custom slash commands (map to pi prompts/)
  instructions/  # Behavioral rules, algorithm, steering rules (shared)
  skills/        # Agent skills (shared across harnesses)
  scripts/       # Shared scripts (voice.sh, etc.)
  claude/        # Claude CLI harness — agents/, CLAUDE.md, instructions/, scripts/, settings.json
  opencode/      # OpenCode harness — agents/, plugins/
  pi/            # Pi.dev harness — AGENTS.md, skills/ (wrappers)
  install.sh     # Symlinks config into the active harness (Mac/Linux)
  install.ps1    # Symlinks config into the active harness (Windows)
```

---

## Setup

**Mac/Linux:**
```bash
git clone git@github.com:breissingerj/Holocron.git
cd Holocron
bash install.sh
```

**Windows:**
```powershell
git clone git@github.com:breissingerj/Holocron.git
cd Holocron
.\install.ps1
```

The install scripts symlink `skills/`, `commands/`, `plugins/`, and `instructions/` into the target harness directory (e.g. `~/.opencode/`). Running it again is safe — existing links are skipped.

**Supported harnesses:** OpenCode (`~/.config/opencode/`), Claude CLI (`~/.claude/`), and pi.dev (`~/.pi/agent/`). The pi.dev branch maps `commands/` to pi's `prompts/` directory (prompt templates) and leaves the user-configured `~/.pi/agent/settings.json` untouched. Pi extensions will live in `pi/extensions/` when built; `install.sh` will auto-link them into `~/.pi/agent/extensions/`.

### Private memory repo

Holocron itself is public. Personal memory (learning signals, work tracking, relationship context) lives in a separate private repo. Point Holocron at it with an env var:

```bash
# Add to ~/.zshrc or ~/.bashrc
export HOLOCRON_MEMORY_DIR="/path/to/your/private/memory/repo"
```

```powershell
# Add to $PROFILE
$env:HOLOCRON_MEMORY_DIR = "C:\path\to\your\private\memory\repo"
```

### Adding a new harness

Each install script has a `HARNESSES` map at the top. To add support for a new tool, add one line:

```bash
# install.sh
HARNESSES["claude-code"]="$HOME/.claude"
```

```powershell
# install.ps1
$Harnesses["claude-code"] = "$env:USERPROFILE\.claude"
```

---

## Voice notifications

Agent phase announcements and notifications are spoken aloud via `scripts/voice.sh`. The script reads a volume level (0–4) from `$HOLOCRON_MEMORY_DIR/STATE/volume.level` and either stays silent, sends a desktop notification, or speaks the message.

### TTS backend: kokoro-fastapi

Voice is powered by [kokoro-fastapi](https://github.com/remsky/kokoro-fastapi) running locally via Docker — a high-quality neural TTS server with an OpenAI-compatible API. No API key required.

**Start the server:**
```bash
docker run --rm -d -p 8880:8880 ghcr.io/remsky/kokoro-fastapi-cpu:v0.2.1
```

The first run downloads the image (~1.5GB). The container exposes an OpenAI-compatible endpoint at `http://localhost:8880/v1/audio/speech`.

**Test it:**
```bash
curl -s -X POST http://localhost:8880/v1/audio/speech \
  -H "Content-Type: application/json" \
  -d '{"model":"kokoro","input":"Hello from Kokoro.","voice":"bm_daniel"}' \
  --output /tmp/test.mp3 && afplay /tmp/test.mp3
```

**Default voice:** `bm_daniel`. Override with `HOLOCRON_KOKORO_VOICE`:
```bash
export HOLOCRON_KOKORO_VOICE="af_heart"
```

**Available voices:** `af_heart`, `af_bella`, `af_nova`, `af_sky`, `am_adam`, `am_echo`, `bf_emma`, `bm_daniel`, `bm_george`

**Fallback:** if the Docker container is not running, `voice.sh` falls back to macOS `say` automatically.

### Volume control

```bash
vol 0   # silent — no TTS, no notifications
vol 1   # quiet  — notifications only
vol 2   # chime  — notifications with sound
vol 3   # focused — TTS on final message only
vol 4   # full   — TTS everywhere (default)
```

Add `vol()` to your shell by appending to `~/.zshrc` (see Setup below), or run `bun tools/ToggleMute.ts [0-4]` directly.

---

## Inspiration

- [Personal AI Infrastructure](https://github.com/danielmiessler/Personal_AI_Infrastructure) by Daniel Miessler — the foundational framework this is built on top of
- [awesome-opencode](https://github.com/awesome-opencode/awesome-opencode) — OpenCode plugin ecosystem reference
