---
description: Scan the inbox for new meeting recording/transcript emails and ingest durable details into memory via MemoryIngest
---

You are running the Process Meetings workflow. This command scans Gmail for meeting recording and transcript notifications, opens each transcript, extracts durable facts, and promotes them into memory through the MemoryIngest skill. It only processes transcripts created since the last time this command ran.

**Do not write raw transcript text directly into any memory file. All memory writes go through the MemoryIngest skill.**

---

## STATE

Last-run watermark file:
!`test -f "$HOLOCRON_MEMORY_DIR/STATE/process-meetings-last-run.txt" && cat "$HOLOCRON_MEMORY_DIR/STATE/process-meetings-last-run.txt" || echo "(none — first run)"`

---

## PHASE 1 — DETERMINE THE PROCESSING WINDOW

1. Read `$HOLOCRON_MEMORY_DIR/STATE/process-meetings-last-run.txt` (path resolved from the evaluated absolute `$HOLOCRON_MEMORY_DIR`, never the local project directory).
2. If the file exists, use its timestamp as the lower bound for this run.
3. If the file does NOT exist (first run), default the lower bound to 7 days before now. State this explicitly in your output so the user knows the first-run window.
4. Record the current time now, before searching — this becomes the new watermark IF this run completes successfully. Do not write it yet.

Output:

**Processing window:** [lower bound] → now
**First run:** [yes/no]

---

## PHASE 2 — SEARCH FOR MEETING TRANSCRIPTS

Use `mcp__claude_ai_Gmail__search_threads` with a query scoped to known meeting-recording/transcript senders and subjects — never a bare keyword match, to avoid catching unrelated emails (legal transcripts, sports recordings, etc.):

```
(from:zoom.us OR from:otter.ai OR from:fireflies.ai OR from:fathom.video OR from:read.ai OR from:gong.io OR from:grain.com OR from:tldv.io OR from:meet.google.com OR from:gemini-notes@google.com OR subject:"meeting recording" OR subject:"recording is ready" OR subject:"your meeting transcript" OR subject:transcript OR subject:"Notes:") after:{lower-bound-date}
```

Adjust the sender/subject list if the user's actual meeting tools differ — ask or infer from prior threads if the defaults return nothing on a non-first run.

If zero threads match:

Output: **No new meeting transcripts found since [lower bound].** Skip to PHASE 5 (still advance the watermark — an empty window is a valid completed run).

---

## PHASE 3 — OPEN EACH TRANSCRIPT

For each matching thread, call `mcp__claude_ai_Gmail__get_thread` (FULL_CONTENT) and locate the transcript by checking, in order:

1. **Inline body** — the transcript text is directly in `plaintextBody`/`htmlBody`.
2. **Linked Google Doc** — the body links to a Drive doc; use `mcp__claude_ai_Google_Drive__search_files` (by title/link ID) then `mcp__claude_ai_Google_Drive__read_file_content` to fetch it.
3. **Attachment** — the transcript is an email attachment; note its filename and type. If it's a format you can read (plain text, PDF, doc), read it; if not, record it as unopenable.

**Do not silently drop a transcript you found but could not open.** Track it separately for the run summary in PHASE 5, with the thread ID and the reason (unsupported attachment type, inaccessible Doc permissions, etc.).

---

## PHASE 4 — EXTRACT AND INGEST DURABLE FACTS

For each transcript you successfully opened, extract only durable, reusable facts — not the raw transcript:

- Decisions made
- Action items and their owners
- Commitments, deadlines, dates
- Standing preferences or process changes mentioned
- Project/context updates (who is doing what, why, by when)

Discard small talk, filler, and anything that is not a durable fact per the MemoryIngest promotion gate.

For each extracted fact (or small batch of related facts from the same meeting), invoke the **MemoryIngest** skill via the Skill tool — do not write to `memory/MEMORY.md` or any memory file directly. Let MemoryIngest handle classification, duplicate resolution, and the actual write.

---

## PHASE 5 — ADVANCE THE WATERMARK AND REPORT

Only after every matching thread from PHASE 2 has been processed (opened-and-ingested, or logged as unopenable) — write the timestamp captured at the start of PHASE 1 (step 4) to `$HOLOCRON_MEMORY_DIR/STATE/process-meetings-last-run.txt`, overwriting only that file.

If the run fails partway through (a tool error, an unrecoverable exception), do NOT write the new watermark — leave it at its prior value so the next run re-covers this window.

This command does not create commits, branches, or pushes. It only touches Gmail/Drive read tools, the MemoryIngest skill, and its own STATE file.

Output:

**Meetings processed:** [count]
**Facts ingested via MemoryIngest:** [count]
**Unopenable transcripts:** [list of thread IDs + reasons, or "none"]
**New watermark:** [timestamp written to process-meetings-last-run.txt]

---

## Usage Examples

First run, no prior watermark:
```
/process-meetings
```

Subsequent run, only processes transcripts since the last watermark:
```
/process-meetings
```

The command reads its own state — no arguments needed.
