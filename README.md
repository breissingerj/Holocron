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
  install.sh     # Symlinks config into the active harness
```

---

## Inspiration

- [Personal AI Infrastructure](https://github.com/danielmiessler/Personal_AI_Infrastructure) by Daniel Miessler — the foundational framework this is built on top of
- [awesome-opencode](https://github.com/awesome-opencode/awesome-opencode) — OpenCode plugin ecosystem reference
