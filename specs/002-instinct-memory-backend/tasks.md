# Tasks: Instinct-Style Memory Backend

Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup
- [x] T001 Create `tools/instinct/` scaffold + `lib/{paths,tokens,store,index}.ts`
- [x] T002 [P] Add fixtures `tools/instinct/fixtures/` (store files, recall queries, transcript sample)

## Phase 2: US1 — Assembly (P1)
- [x] T003 [US1] `seed` command: derive profile/onepager/board from memory/ + PRDs (non-destructive)
- [x] T004 [US1] `assemble` command with budgets + sentinel; `status` command
- [x] T005 [US1] pi extension `instinct-memory.ts` (session_start cache, before_agent_start inject) + legacy yield when backend=instinct
- [x] T006 [US1] Claude SessionStart hook `instinct-session-start.sh` (additionalContext JSON)
- [x] T007 [US1] Tests: budgets, sentinel, backend-off no-op

## Phase 3: US2 — Recap (P1)
- [x] T008 [US2] `recap` command (LLM via Inference fast, with deterministic fallback from PRDs/transcript tail)
- [x] T009 [US2] Claude Stop/SessionEnd hook `instinct-stop.sh` + pi `agent_end`/`session_shutdown` handler; recursion guard
- [x] T010 [US2] Test: recap budget + resume injection

## Phase 4: US3 — Capture/consolidate/recall (P2)
- [x] T011 [US3] `capture` (explicit) + `extract` (Haiku over transcript delta → inbox, checkpointed)
- [x] T012 [US3] `consolidate` with `--dry-run`, alias dedupe, supersede, one-pager regen, git commit
- [x] T013 [US3] `recall` + index build + fuzzy; per-prompt hook `instinct-prompt.sh` + pi T2 injection
- [x] T014a [US3] Bullet metadata (asserted/conf/expires/src), archive dir, supersession judge (Haiku + Jaccard fallback), expiry sweep, staleness report (FR-011..016)
- [x] T014b [US3] `forget` command + recency-weighted recall ranking (FR-014, FR-015)
- [x] T014 [US3] Tests (incl. contradiction, expiry, forget, decay fixtures): dry-run no writes, recall eval 20 queries, extraction JSON parse

## Phase 5: Polish & Rollout
- [x] T015 MEMORY_CONTRACT.md `instinct/` section; AGENTS.md backend rule; DECISIONS.md entry; ROADMAP note
- [x] T016 (install.sh --check drift is pre-existing path-case staleness, unrelated; new extension auto-linked by existing *.ts glob) `install.sh --check` still passes; backend-unset parity check
- [ ] T017 Commit, push, PR, merge to main; pull main
- [ ] T018 Migration: seed live memory, wire hooks in memory repo settings, set `HOLOCRON_MEMORY_BACKEND=instinct`, verify injection live

## Phase 6: Quality fixes + prompt-change signals (follow-up, 2026-10-08)
- [x] T019 Sweep skips agent-* transcripts; sweep never writes recap.md (FR-017)
- [x] T020 Entity canonicalization (rare-token resolution, general files) + stricter extraction prompt (FR-018)
- [x] T021 Judge guards: deterministic dedupe first; supersede requires same-attribute overlap and not-newer (FR-019)
- [x] T022 Skill/agent signals: transcript markers, `skill_signals` extraction, `signals/` store (FR-020)
- [x] T023 `suggest` + `suggestions list|apply|reject`, evidence from ratings/reflections, Board pending count, consolidate integration (FR-021)
- [x] T024 Tests (16 new, 36 total) + live Haiku/Sonnet verification
- [ ] T025 Reprocess live memory with the fixed tooling (revert fa4e9cd, re-sweep, re-consolidate)

