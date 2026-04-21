# hooks/pi/ — pi.dev Extensions

TypeScript extensions for [pi.dev](https://pi.dev/) that port Holocron's Claude-Code hooks and OpenCode plugins to pi's ExtensionAPI.

See [../../docs/M16-pi-extensions-plan.md](../../docs/M16-pi-extensions-plan.md) for the full porting plan.

## Structure

Each extension is a directory (or single `.ts` file for trivial ones):

```
hooks/pi/
├── _lib/                        # Shared helpers (PRD parsing, STATE paths, tool-name mapping)
├── holocron-load-context/       # session_start: inject memory + active PRD
├── holocron-prd-sync/           # tool_result: sync PRD.md → work.json
├── holocron-voice-completion/   # turn_end: voice announcement
├── holocron-security-validator/ # tool_call: block dangerous commands
├── holocron-skill-guard/        # tool_call: block false-positive skill invocations
└── ...
```

## Install

`install.sh` symlinks `hooks/pi/*` → `~/.pi/agent/extensions/*`. pi discovers extensions automatically.

## Development

pi loads TypeScript via [jiti](https://github.com/unjs/jiti) — no build step. But extensions with npm deps still need `bun install` in the extension directory so `node_modules/` is populated.

Each extension exports a default factory function receiving `ExtensionAPI`:

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (event, ctx) => {
    // ...
  });
}
```

## Status

Scaffolding only — no extensions ported yet. Phase 1 of the M16 plan is the first PR target.
