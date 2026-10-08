# Implementation Plan: Instinct-Style Memory Backend

**Spec**: [spec.md](spec.md) | **Branch**: `instinct-memory-backend`

## Summary
One TypeScript/bun core CLI (`tools/instinct/instinct.ts`) implementing seed, assemble, recap, capture, consolidate, recall, status. Thin adapters: pi extension (`pi/extensions/instinct-memory.ts`) and Claude hooks (`claude/scripts/hooks/instinct-*.sh`). Legacy `holocron-memory.ts` yields when backend=instinct.

## Technical Context
Bun + TypeScript (no new deps; node:fs/child_process). Storage: markdown + JSONL in private memory repo (git). LLM: Haiku via `tools/Inference.ts` (claude CLI, subscription). Tests: `bun test` fixtures. Target: macOS + Linux.

## Constitution Check
- I Harness-agnostic core: PASS — logic in `tools/instinct/`, adapters in `pi/` and `claude/`.
- II Algorithm/PRD: PASS — design PRD in memory WORK/.
- III Capability commitment: PASS — Haiku extraction actually invoked & tested.
- No new infra/secrets; no vector DB (MEMORY_CONTRACT deferral respected).

## Structure
```
tools/instinct/{instinct.ts, instinct.test.ts}
pi/extensions/instinct-memory.ts
claude/scripts/hooks/{instinct-session-start.sh, instinct-prompt.sh, instinct-stop.sh}
MEMORY_CONTRACT.md (+instinct/ section), DECISIONS.md, instructions/AGENTS.md (backend rule), README/ROADMAP note
```

## Design decisions
- Injection tiers: T1 session start (hook), T2 per-prompt retrieval (UserPromptSubmit / pi before_agent_start), T3 `recall` tool fallback.
- Capture: explicit → inbox; hook-driven Haiku extraction at Stop/SessionEnd over transcript delta (checkpoint per session id); consolidator backstop sweep.
- Recursion guard: `INSTINCT_INTERNAL=1` env on spawned claude; adapters exit early when set.
- Fuzzy: Damerau-Levenshtein ≤ 1 for tokens ≥ 4 chars against alias/filename tokens.
