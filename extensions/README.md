# extensions/

> **Pi-specific.** Extensions are a [pi.dev](https://pi.dev) concept — TypeScript modules loaded via jiti that hook into pi's `ExtensionAPI`. Claude Code uses `hooks/claude/` for its lifecycle integrations; OpenCode uses `hooks/opencode/`. This directory is **only for pi**.

Pi extensions live in `~/.pi/agent/extensions/` and are auto-discovered at startup. `install.sh` symlinks each subdirectory here into that location.

---

## Structure

```
extensions/
├── _lib/                          # Shared helpers (not a standalone extension)
│   ├── paths.ts                   # HOLOCRON_MEMORY_DIR resolution
│   ├── prd-utils.ts               # PRD frontmatter parsing → work.json sync
│   ├── tool-names.ts              # Claude tool names (Bash/Edit) ↔ pi names (bash/edit)
│   └── block.ts                   # Blocking adapter: pi { block, reason } semantics
├── holocron-load-context/         # session_start: inject memory + active PRD
├── holocron-prd-sync/             # tool_result: sync PRD.md writes → STATE/work.json
├── holocron-voice-completion/     # agent_end: voice announcement via scripts/voice.sh
├── holocron-security-validator/   # tool_call: block dangerous bash/file operations
├── holocron-skill-guard/          # tool_call: block false-positive skill invocations
└── ...                            # See PORTING-PLAN.md for the full roadmap
```

## Writing an extension

Each extension exports a default factory function receiving `ExtensionAPI`:

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (event, ctx) => {
    // inject context, set up state, etc.
  });

  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName === "bash" && event.input.command?.includes("rm -rf /")) {
      return { block: true, reason: "Blocked by security validator" };
    }
  });
}
```

Pi loads extensions via [jiti](https://github.com/unjs/jiti) — no build step needed. Extensions with npm dependencies need a `package.json` and `bun install` (run automatically by `install.sh`).

## Install

`install.sh` symlinks each extension subdirectory into `~/.pi/agent/extensions/` and runs `bun install` per extension if a `package.json` is present. Run `bash install.sh` to pick up new extensions.

## Porting plan

See [PORTING-PLAN.md](./PORTING-PLAN.md) for the full plan mapping Claude Code hooks → pi extensions, including priority tiers and event mapping.
