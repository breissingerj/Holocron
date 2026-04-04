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
│   ├── REFLECTIONS/
│   │   └── algorithm-reflections.jsonl
│   ├── SIGNALS/
│   │   └── ratings.jsonl          ← Explicit + implicit rating signals (appended by M8 plugin)
│   └── CAPTURES/
│       └── YYYY-MM/
│           └── *_LEARNING_sentiment-rating-N.md  ← Per-session learning files for ratings ≤ 4
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
| `LEARNING/SIGNALS/ratings.jsonl` | `holocron-learning-capture` plugin (M8) | JSONL; one entry per detected rating signal |
| `LEARNING/CAPTURES/` | `holocron-learning-capture` plugin (M8) | Markdown learning files; written on ratings ≤ 4 |
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

## Future Upgrade Path — Queryable Memory

The current contract uses plain files with no semantic search. This works at small scale but becomes unwieldy as the `memory/` and `WORK/` directories grow — agents must read entire files to find relevant context.

**[OpenViking](https://github.com/volcengine/OpenViking)** (Apache 2.0, ByteDance/Volcengine, 11k+ stars, #1 trending on GitHub 2026-03-15) solves this with a hierarchical context database: a Go AGFS file server + Python VFS + C++17 vector index, exposing a `viking://` URI scheme with L0/L1/L2 tiered loading (auto-generated abstract → overview → full) and session-end memory extraction.

Both harnesses are supported first-party:
- **Claude Code** — official hooks plugin at `/examples/claude-memory-plugin/` (SessionStart, Stop, SessionEnd hooks; Stop parses transcript and appends to OpenViking session; SessionEnd triggers async memory extraction into `viking://user/memories/` and `viking://agent/memories/`)
- **OpenCode** — official TypeScript plugin at `/examples/opencode-memory-plugin/` (`memsearch`, `memread`, `membrowse`, `memcommit` tools)
- **MCP server** — first-party, documented in `/docs/en/guides/06-mcp-integration.md`; use **HTTP/SSE transport** (`http://localhost:1933/mcp`) for multi-harness setups — stdio transport has a documented file contention bug when Claude Code and OpenCode run simultaneously against the same data directory

**Viable as an optional layer:** OpenViking does not require exclusive ownership of the files it indexes. Running `add_resource` on `$HOLOCRON_MEMORY_DIR/memory/` would index existing markdown files into the `viking://` hierarchy for semantic search, while git remains the source of truth and versioning system. This is architecturally sound.

**Why not now:** Alpha-stage (0.2.x), requires an always-running HTTP server + external VLM/embedding API keys (zero-fallback queries fail without them), and has no built-in git commit/push for agents. A documented issue today: memory extraction returning 0 memories when VLM/embedding stack is misconfigured.

**When to revisit:** When OpenViking reaches a stable release OR when `memory/` grows large enough that full-file reads become a token cost problem. Scope to `memory/` only — `WORK/`, `LEARNING/`, and `STATE/` are Holocron-specific structures with no OpenViking equivalent.

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
