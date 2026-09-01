# Holocron

> *A Jedi Holocron is a crystalline device that stores the knowledge and personality of its creator — accessible to any who know how to use it.*

Holocron is a personal agent configuration layer designed to work across any AI agent harness. It contains the skills, commands, plugins, and behavioral rules that make any agent feel like *mine* — not a generic assistant.

The goal is harness-agnostic personalization: the same knowledge, voice, and workflows should be loadable whether I'm running Claude Code, pi, or whatever comes next.

---

## What's in here

- **Skills** — Domain-specific instruction files that activate on intent
- **Commands** — Custom slash commands for recurring workflows
- **Pi extensions** — pi harness extensions (`pi/extensions/`): system prompt injection, memory context priming, task discipline, skill discovery
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
  instructions/  # AGENTS.md (canonical, shared), algorithm.md, steering-rules.md, etc.
  skills/        # Agent skills (shared across harnesses) — lowercase Agent-Skills slugs
  agents/        # Shared agent definitions, Claude Code frontmatter (single canonical copy)
  commands/      # Custom slash commands (map to pi prompts/)
  scripts/       # Shared scripts (voice.sh, etc.)
  claude/        # Claude Code adapter — CLAUDE.md (generated shim), claude-tail.md, scripts/, settings.json
  pi/            # pi adapter — APPEND_SYSTEM.md (pi-only overlay), extensions/, agents/ (native roster), skills/, settings.json
  install.sh     # Converges the live machine to match this repo (Mac/Linux); install.sh --check reports drift
  install.ps1    # Not yet updated for the Claude Code + pi layout (Windows)
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

### Pi packages

Install the following global pi packages after running `install.sh`:

```bash
# Structured ask-user questionnaire — lets the agent ask typed questions
# instead of guessing, with option lists instead of free-form replies.
pi package install https://pi.dev/packages/@juicesharp/rpiv-ask-user-question
```

`install.sh` symlinks `skills/`, `commands/`, `agents/`, and `instructions/` into each harness's home directory and converges the live machine to match the repo on every run — stale, dangling, or missing links are repaired and every change is printed. Run `install.sh --check` to see drift (if any) without changing anything; exit code 0 means clean, 1 means drift was found.

**Supported harnesses:** Claude Code (`~/.claude/`) and pi.dev (`~/.pi/agent/`). The pi branch maps `commands/` to pi's `prompts/` directory (prompt templates), discovers skills via the `skill-roots.ts` extension rather than a fan-out copy, and leaves a user-configured `~/.pi/agent/settings.json` (a real file, not a Holocron-managed symlink) untouched.

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

### Full installation: Obsidian vault and Git sync

For a full personal installation, open the private memory repository as an Obsidian vault. This gives you a local, human-friendly interface over the same Markdown files that Holocron agents use.

Install the [Obsidian Git](https://github.com/denolehov/obsidian-git/wiki/Installation) community plugin in that vault, then configure it to automatically commit and push vault changes. The repository must already have a writable Git remote and working authentication; `install.sh` does not install Obsidian, install community plugins, or configure Git credentials.

### Agent vault search

When `HOLOCRON_MEMORY_DIR` is configured, the macOS/Linux installer registers [MCPVault](https://github.com/bitbonsai/mcpvault) as the user-scoped Claude MCP server named `obsidian`. MCPVault exposes the private memory repository for agent search and note operations. The installer preserves an existing `obsidian` MCP configuration; remove it with `claude mcp remove obsidian -s user` before rerunning the installer if you want Holocron to register it again.

### Adding a new harness

Core skills, instructions, and agents are harness-agnostic by design (Constitution Principle I) — adding a new harness is scoped to one `install.sh` section plus one thin per-harness adapter directory, never a change to `instructions/`, `skills/`, `agents/`, or `commands/` themselves. Follow the existing Claude Code / pi sections in `install.sh` as the pattern: link the canonical `instructions/AGENTS.md` as the harness's context file, link `skills/` and `agents/` (or an equivalent discovery mechanism), and put anything genuinely harness-specific (always-on overlay content, settings template) in a new adapter directory at the repo root.

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
