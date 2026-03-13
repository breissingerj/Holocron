# Holocron

> *A Jedi Holocron is a crystalline device that stores the knowledge and personality of its creator — accessible to any who know how to use it.*

Holocron is a personal agent configuration layer designed to work across any AI agent harness. It contains the skills, commands, plugins, and behavioral rules that make any agent feel like *mine* — not a generic assistant.

The goal is harness-agnostic personalization: the same knowledge, voice, and workflows should be loadable whether I'm running Claude Code, OpenCode, or whatever comes next.

---

## What's in here

- **Skills** — Domain-specific instruction files that activate on intent
- **Commands** — Custom slash commands for recurring workflows
- **Plugins** — Custom agent harness plugins (system prompt injection, context loading, memory sync)
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
  commands/      # Custom slash commands
  plugins/       # Agent harness plugins (OpenCode, etc.)
  instructions/  # Behavioral rules, algorithm, steering rules
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

## Inspiration

- [Personal AI Infrastructure](https://github.com/danielmiessler/Personal_AI_Infrastructure) by Daniel Miessler — the foundational framework this is built on top of
- [awesome-opencode](https://github.com/awesome-opencode/awesome-opencode) — OpenCode plugin ecosystem reference
