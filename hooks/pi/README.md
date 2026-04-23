# hooks/pi/ — moved

Pi extensions moved to [`extensions/`](../../extensions/) at the Holocron repo root.

**Why:** Pi extensions use a distinct enough API (`ExtensionAPI`) and directory convention that a top-level `extensions/` is cleaner than nesting under `hooks/`. The `hooks/` pattern makes more sense for Claude Code and OpenCode, which call their lifecycle integrations "hooks" and "plugins" respectively.

See [`extensions/README.md`](../../extensions/README.md) and [`extensions/PORTING-PLAN.md`](../../extensions/PORTING-PLAN.md).
