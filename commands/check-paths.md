---
description: Verify holocron-path-corrector is working — report all config paths in context
---
Report the following exactly as you see them in your current context and system prompt:

1. What harness are you running in?
2. What is the path to your AGENTS.md instructions file?
3. What is the base config directory (e.g. ~/.config/opencode or ~/.config/Claude)?
4. List any skill or instruction file paths you can see in your context.

Answer each point with the literal path string — do not infer or guess. If you see `~/.config/Claude/` anywhere, report it explicitly. This is a diagnostic to verify the holocron-path-corrector plugin is rewriting corrupted paths correctly.
