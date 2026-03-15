# Memory Repo Contract

This document defines the interface between **Holocron** (harness-agnostic config) and the **private memory repo** pointed to by `$HOLOCRON_MEMORY_DIR`.

---

## What is `HOLOCRON_MEMORY_DIR`?

`HOLOCRON_MEMORY_DIR` is an environment variable pointing to the root of a private, version-controlled repository that stores all personal context and work history for Holocron sessions.

- Set in your shell profile: `export HOLOCRON_MEMORY_DIR="/path/to/your/private/memory/repo"`
- The repo is **private** — it contains personal notes, work history, and learning signals not suitable for a public repo
- The repo must be a **git repository** — agents commit and push memory updates to persist them across machines and sessions

The reference implementation is [holocron-context](https://github.com/breissingerj/holocron-context), which also contains Claude Code-specific config (PAI/, hooks/, settings.json). The memory contract covers only the subdirectories listed below — the rest of the repo's contents are the owner's concern.

---

## Required Directory Structure

Holocron components read and write to the following paths. All are relative to `$HOLOCRON_MEMORY_DIR`.

```
$HOLOCRON_MEMORY_DIR/
│
├── memory/                        ← Session notes (harness-specific)
│   ├── MEMORY.md                  ← Index of all memory files (kept under 200 lines)
│   └── *.md                       ← Individual memory files by topic
│
├── WORK/                          ← PRD files (harness-agnostic, scaffolded in M7)
│   └── {slug}/
│       └── PRD.md                 ← One PRD per Algorithm session
│
├── LEARNING/                      ← Learning signals (harness-agnostic, scaffolded in M7/M8)
│   └── REFLECTIONS/
│       └── algorithm-reflections.jsonl
│
└── STATE/                         ← Runtime state (harness-agnostic)
    ├── volume.level               ← Current voice volume level (0–5); read by voice.sh
    └── work.json                  ← PRD registry; written by PRD sync plugin (M7)
```

---

## Which Parts Are Harness-Specific?

| Path | Used By | Notes |
|------|---------|-------|
| `memory/` | Claude Code (PAI), future harnesses | Symlinked into Claude Code's projects dir by `holocron-context/setup.sh` |
| `WORK/` | Algorithm (all harnesses) | PRD files are harness-agnostic — plain markdown |
| `LEARNING/REFLECTIONS/` | Algorithm LEARN phase (all harnesses) | JSONL format; feeds upgrade and rating workflows |
| `STATE/volume.level` | `scripts/voice.sh` (all harnesses) | Integer 0–5; created by volume skill |
| `STATE/work.json` | PRD sync plugin (M7) | JSON registry of active/completed sessions |

`memory/` is the only harness-specific directory. All other paths under `$HOLOCRON_MEMORY_DIR` are harness-agnostic and owned by Holocron components.

---

## Scaffolding

The required directory structure is **not** committed to the private repo as empty directories. Instead:

- `STATE/volume.level` is created on first use by the volume skill
- `WORK/` and `LEARNING/REFLECTIONS/` are created by the `pai-prd` plugin during M7 setup
- `memory/` is expected to exist before `install.sh` runs (it's the owner's responsibility)

Until M7 ships, agents writing to `WORK/` or `LEARNING/` must create the directory if it doesn't exist:
```bash
mkdir -p "$HOLOCRON_MEMORY_DIR/WORK/{slug}/"
mkdir -p "$HOLOCRON_MEMORY_DIR/LEARNING/REFLECTIONS/"
```

---

## Commit Convention

Agents that write memory (session notes, PRDs, reflections) should commit and push using:

```bash
cd "$HOLOCRON_MEMORY_DIR"
git add -A
git commit -m "session memory $(date +%Y-%m-%d)"
git push
```

This ensures memory persists across machines. Agents should only commit when a session produces meaningful new state — not on every write.
