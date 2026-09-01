---
name: memory-ingest
description: Promote durable knowledge into an Obsidian-backed Holocron memory vault through LLM-guided duplicate resolution, metadata, and linking. USE WHEN remember, note that, save this, ingest memory, promote memory, update memory, correct memory, store preference, store decision, or store project context.
---

# Memory Ingest

Use this skill to decide whether information belongs in durable memory and to write it safely. Markdown files under `$HOLOCRON_MEMORY_DIR` remain canonical; MCPVault provides search and note-edit primitives.

## Customization

Before executing, check for user customizations at:
`$HOLOCRON_MEMORY_DIR/Holocron/USER/SKILLCUSTOMIZATIONS/MemoryIngest/`

If this directory exists, load and apply `PREFERENCES.md`. If it does not exist, proceed with the defaults below.

## Promotion Gate

Ingest information only when it is confirmed and durable:

- An explicit user request to remember, note, save, or update it.
- A preference, standing rule, architecture decision, project invariant, procedure, ownership fact, or recurring gotcha.
- Information whose absence would create a likely future ambiguity or repeated investigation.

Do not ingest task progress, raw transcript content, temporary environment state, unverified claims, or one-off debugging observations. Keep those in `WORK/` or `LEARNING/`.

## Ingest Workflow

1. **Classify** — State whether the candidate is a preference, decision, procedure, project context, or reference fact. Reject non-durable candidates without writing.
2. **Discover** — Search the vault before writing. Use Graphiti when available; otherwise use `obsidian.search_notes` with a specific query and a small limit. Inspect excerpts or metadata, then read only relevant candidate notes.
3. **Resolve** — Choose exactly one outcome:
   - **Patch** an existing note when it already contains the same subject or fact.
   - **Supersede** an outdated fact in its existing note; preserve history only when it remains useful.
   - **Create** a topic note only when no canonical durable topic exists.
   - **Reject** when the candidate is transient, speculative, or redundant.
4. **Write** — Prefer `patch_note` for exact existing content. Use `write_note` only to create a new note. Never overwrite an existing note wholesale for a small change.
5. **Metadata** — For new topic notes, include `title`, `kind`, `status`, `aliases`, `tags`, `entities`, `source`, `confidence`, `created`, and `updated` frontmatter. Do not require frontmatter migration for existing notes.
6. **Link** — Add `[[wiki-links]]` only for meaningful retrieval pivots. Verify targets exist; do not create empty link-target notes.
7. **Index** — Keep `memory/MEMORY.md` concise. Add or update an index pointer only when the topic merits durable index-level visibility.
8. **Verify** — Re-read changed notes, validate frontmatter and links, and report the duplicate decision, paths changed, links added, and provenance.

## Safety Rules

- Resolve `$HOLOCRON_MEMORY_DIR` before any write.
- Never write durable memory into the current project directory.
- Never create competing current facts; patch or supersede the canonical note.
- Never update `LEARNING/PROCESSED/` archives.
- Do not run Git commits or pushes; the configured Obsidian Git workflow owns synchronization.

## Output

Report the candidate classification, promotion decision, searched duplicates, changed paths, links added, provenance, and verification result.
