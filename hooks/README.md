# hooks/

Harness-specific lifecycle integrations (hooks, plugins, extensions) organized by target harness.

## Pattern

Each harness has its own subdirectory; Holocron-level code that hooks into harness lifecycle events lives under the harness that runs it:

```
hooks/
├── claude/      # Claude Code hooks (.hook.ts, invoked via settings.json)
├── opencode/    # OpenCode plugins (Plugin interface, loaded from plugins/ at harness level)
└── pi/          # pi.dev extensions (ExtensionAPI, loaded from ~/.pi/agent/extensions/)
```

Shared helpers that multiple harnesses consume live in `hooks/_lib/`.

## Why this layout

Holocron's core promise is harness-agnostic configuration. Grouping by **capability** (hooks) first, then splitting by **harness** keeps the mental model consistent with the rest of the repo (`agents/claude/`, `agents/opencode/`, `config/claude/`, `config/pi/`).

Previously:
- Claude hooks lived in `$HOLOCRON_MEMORY_DIR/hooks/` (private memory repo — tightly coupled to user identity)
- OpenCode plugins lived in `Holocron/plugins/` (public)
- pi had no extensions

The new layout consolidates anything that can ship publicly. Claude hooks that are identity-coupled stay in the private memory repo; harness-agnostic lifecycle code moves here.

## Migration Status

| Harness | Source | Target | Status |
|---|---|---|---|
| claude | `$HOLOCRON_MEMORY_DIR/hooks/` | `hooks/claude/` (public portions only) | Pending — identity-coupled handlers stay private |
| opencode | `Holocron/plugins/` | `hooks/opencode/` | Pending — migrate on next plugin touch |
| pi | — | `hooks/pi/` | In progress — see [pi/README.md](pi/README.md) and [../docs/M16-pi-extensions-plan.md](../docs/M16-pi-extensions-plan.md) |

## Install

`install.sh` symlinks each harness subdirectory into the harness-native extension location:

- `hooks/claude/*.hook.ts` → referenced by `~/.claude/settings.json` hooks config
- `hooks/opencode/*` → `~/.config/opencode/plugins/*`
- `hooks/pi/*` → `~/.pi/agent/extensions/*`
