---
name: memory-ingest
description: Promote durable knowledge into an Obsidian-backed Holocron memory vault through LLM-guided duplicate resolution, metadata, and linking. USE WHEN remember, note that, save this, ingest memory, promote memory, update memory, correct memory, store preference, store decision, or store project context.
---

# Memory Ingest

Use this skill to decide whether information belongs in durable memory and to write it safely. Markdown files under `$HOLOCRON_MEMORY_DIR` remain canonical; MCPVault provides search and note-edit primitives.

## Promotion Gate

Ingest only confirmed, durable preferences, standing rules, architecture decisions, project invariants, procedures, ownership facts, recurring gotchas, or explicit user memory requests.

Do not ingest task progress, raw transcript content, temporary environment state, unverified claims, or one-off debugging observations. Keep those in `WORK/` or `LEARNING/`.

## Ingest Workflow

1. Classify the candidate as a preference, decision, procedure, project context, or reference fact. Reject non-durable candidates without writing.
2. Search for existing memory before writing. Use Graphiti when available; otherwise use `obsidian.search_notes` with a targeted query and small limit. Read only relevant candidates.
3. Choose exactly one outcome: patch an existing note, supersede an outdated fact, create a new canonical topic note, or reject the candidate.
4. Prefer `patch_note` for exact existing content. Use `write_note` only to create a new note. Never overwrite an existing note wholesale for a small change.
5. For new topic notes, include `title`, `kind`, `status`, `aliases`, `tags`, `entities`, `source`, `confidence`, `created`, and `updated` frontmatter. Existing notes do not require frontmatter migration.
6. Add `[[wiki-links]]` only for meaningful retrieval pivots. Verify targets exist; do not create empty link-target notes.
7. Keep `memory/MEMORY.md` concise. Add or update an index pointer only when the topic merits durable index-level visibility.
8. Re-read changed notes and report the promotion decision, duplicate candidates, paths changed, links added, provenance, and verification result.

## Safety Rules

- Resolve `$HOLOCRON_MEMORY_DIR` before writing.
- Never write durable memory into the current project directory.
- Never create competing current facts; patch or supersede the canonical note.
- Never update `LEARNING/PROCESSED/` archives.
- Do not run Git commits or pushes; the configured Obsidian Git workflow owns synchronization.
