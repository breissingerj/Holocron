---
description: Synthesize learning signals into memory and system improvements, open PRs for review
---

You are running the Holocron Reflect workflow. This is a structured, multi-phase operation that reads accumulated learning signals from the private memory repo, synthesizes actionable improvements, applies them to the correct files in both repos, and opens PRs for human review.

**Do not rush. Execute every phase in order. Do not skip phases. Do not apply changes to main branches.**

---

## CURRENT SIGNAL STATE

Ratings signals:
!`cat $HOLOCRON_MEMORY_DIR/LEARNING/SIGNALS/ratings.jsonl 2>/dev/null | wc -l` entries in ratings.jsonl

Algorithm reflections:
!`cat $HOLOCRON_MEMORY_DIR/LEARNING/REFLECTIONS/algorithm-reflections.jsonl 2>/dev/null | wc -l` entries in algorithm-reflections.jsonl

Capture files:
!`find $HOLOCRON_MEMORY_DIR/LEARNING/CAPTURES -name "*.md" 2>/dev/null | wc -l` capture .md files

Agent invocations (lifetime):
!`cat $HOLOCRON_MEMORY_DIR/LEARNING/SYSTEM/agent-invocations.jsonl 2>/dev/null | wc -l` total entries in agent-invocations.jsonl

Already processed snapshots:
!`ls $HOLOCRON_MEMORY_DIR/LEARNING/PROCESSED/ 2>/dev/null | wc -l` prior reflect runs in PROCESSED/

---

## PHASE 1 — INVENTORY

Read and display all unprocessed signal data:

1. Read the full contents of `$HOLOCRON_MEMORY_DIR/LEARNING/SIGNALS/ratings.jsonl`
2. Read the full contents of `$HOLOCRON_MEMORY_DIR/LEARNING/REFLECTIONS/algorithm-reflections.jsonl`
3. List and read all `.md` files under `$HOLOCRON_MEMORY_DIR/LEARNING/CAPTURES/`
4. List all existing snapshot directories under `$HOLOCRON_MEMORY_DIR/LEARNING/PROCESSED/` — their contents are already applied and must NOT be reprocessed
5. Read `$HOLOCRON_MEMORY_DIR/LEARNING/SYSTEM/agent-invocations.jsonl` and compute a per-agent invocation count:
   ```bash
   cat $HOLOCRON_MEMORY_DIR/LEARNING/SYSTEM/agent-invocations.jsonl 2>/dev/null | grep -o '"agent":"[^"]*"' | sort | uniq -c | sort -rn
   ```
   Display as a table: Agent | Lifetime Invocations | Sessions in Current Signal Window. The "sessions in current signal window" is the count of entries in `algorithm-reflections.jsonl` that include each agent in their `agents_invoked` array.
5. Scan `$HOLOCRON_MEMORY_DIR/WORK/` for PRD slug directories and extract any client names embedded in slugs or PRD content. Cross-reference against `algorithm-reflections.jsonl` entries for the same client names. Build a per-client session count:
   ```bash
   ls "$HOLOCRON_MEMORY_DIR/WORK/" 2>/dev/null
   ```
   For each client with ≥ 2 matching sessions, flag it for client state synthesis in PHASE 2.
6. Scan `algorithm-reflections.jsonl` for recurring error classes or correction signals. Group by behavioral anti-pattern description (not by session). For each class that appears in ≥ 3 separate sessions, flag it for behavioral correction pattern synthesis in PHASE 2.
7. Count total signals by type: explicit ratings, implicit ratings, algorithm reflections, captures
8. If total unprocessed signals = 0, output: "No unprocessed signals found. Nothing to reflect." and stop.

---

## PHASE 2 — SYNTHESIS

Analyze all unprocessed signals and cluster them into themes. Apply the following thresholds before adding anything to the apply list:

- **Behavioral correction** (applies to `memory/MEMORY.md`, `OPINIONS.md`, `AISTEERINGRULES.md`): Include if rating ≤ 5 OR the same correction pattern appears in ≥ 3 separate sessions
- **Algorithm improvement** (applies to `algorithm.md`, `steering-rules.md`): Include if the same Q1/Q2/Q3 reflection pattern appears in ≥ 3 sessions OR a reflection specifically calls out a systemic process failure
- **Agent improvement** (applies to `agents/claude/{AgentName}.md` and `agents/opencode/{AgentName}.md`): Include if the same agent appears in `agents_invoked` across ≥ 3 sessions AND the reflections for those sessions describe a recurring failure or gap attributable to that agent's instructions. Look for: Q1/Q2/Q3 answers that reference the agent by name, low `implied_sentiment` on sessions where the agent was invoked, or explicit critique of the agent's behavior in captures. The file targets are both `agents/claude/{AgentName}.md` and `agents/opencode/{AgentName}.md` in the Holocron repo — always update both. Do NOT apply agent improvements for a one-session incident.
- **One-off error**: Rating ≤ 5 on an isolated incident with no pattern — note it but do NOT apply to memory or system files. These are learning signals, not rules.
- **Preference/workflow update**: Explicit user corrections about output format, tooling, workflow — apply if explicit (not just inferred) and not already in memory
- **Client state snapshot** (applies to `memory/{client}-state.md`): Include if ≥ 2 sessions reference the same client with non-trivial work context (substantive tool calls, PRD entries, or reflections — not just mentions). Synthesize current active risks, known tech debt, behavioral quirks, and unresolved issues as facts. Do NOT summarize what was done; capture what is true now.
- **Behavioral correction pattern** (applies to `memory/behavioral-corrections.md`): Include if the same anti-pattern class appears in ≥ 3 separate sessions. This is distinct from the "Behavioral correction" category above — that category handles explicit corrections the user named; this category handles implicit recurring mistakes surfaced by rating patterns and reflection content. Do NOT promote a pattern here unless it meets the 3-session threshold.

Output a structured synthesis table:

```
| Theme | Category | Signal Count | Source Timestamps | Action |
|-------|----------|-------------|------------------|--------|
| ...   | behavioral       | N | ... | Apply to OPINIONS.md |
| ...   | algorithm        | N | ... | Apply to algorithm.md |
| ...   | agent-improvement| N | ... | Apply to agents/claude/{Name}.md + agents/opencode/{Name}.md |
| ...   | one-off          | N | ... | Note only, discard |
| ...   | client-state     | N | ... | Write/update memory/{client}-state.md |
| ...   | behavior-pattern | N | ... | Append to memory/behavioral-corrections.md |
```

For each "Apply" row, write out the exact proposed change (the new bullet, rule, or note to add) before proceeding. Do not proceed to PHASE 3 until the synthesis table and proposed changes are complete and visible.

---

## PHASE 3 — SNAPSHOT (crash-safe, do this BEFORE applying any changes)

Create a timestamped snapshot directory and copy all signal files into it:

```bash
REFLECT_TS=$(date -u +"%Y-%m-%d_%H-%M-%S")
SNAPSHOT_DIR="$HOLOCRON_MEMORY_DIR/LEARNING/PROCESSED/$REFLECT_TS"
mkdir -p "$SNAPSHOT_DIR"

# Copy all signal files to snapshot
cp "$HOLOCRON_MEMORY_DIR/LEARNING/SIGNALS/ratings.jsonl" "$SNAPSHOT_DIR/ratings.jsonl" 2>/dev/null || true
cp "$HOLOCRON_MEMORY_DIR/LEARNING/REFLECTIONS/algorithm-reflections.jsonl" "$SNAPSHOT_DIR/algorithm-reflections.jsonl" 2>/dev/null || true
cp "$HOLOCRON_MEMORY_DIR/LEARNING/SYSTEM/agent-invocations.jsonl" "$SNAPSHOT_DIR/agent-invocations.jsonl" 2>/dev/null || true

# Copy all capture files preserving subdirectory structure
if [ -d "$HOLOCRON_MEMORY_DIR/LEARNING/CAPTURES" ]; then
  cp -r "$HOLOCRON_MEMORY_DIR/LEARNING/CAPTURES" "$SNAPSHOT_DIR/CAPTURES"
fi

echo "Snapshot created: $SNAPSHOT_DIR"
ls -la "$SNAPSHOT_DIR"
```

Confirm the snapshot directory exists and all files are present before continuing. If the snapshot fails, STOP — do not apply any changes.

---

## PHASE 4 — APPLY MEMORY CHANGES (holocron-context repo)

Only proceed if PHASE 3 snapshot was confirmed.

If there are memory/behavioral/preference changes to apply:

1. Switch to the memory repo:
   ```bash
   cd $HOLOCRON_MEMORY_DIR
   gh auth switch --user breissingerj 2>/dev/null || true
   git checkout main && git pull
   ```

2. Apply each "Apply" item from the synthesis table to the correct file:
   - Behavioral corrections → `memory/MEMORY.md` (under relevant section) or appropriate topic file
   - Preference/workflow updates → `memory/MEMORY.md` under "Workflow Preferences"
   - Strong opinions/preferences → `Holocron/USER/OPINIONS.md`
   - Behavioral steering overrides → `Holocron/USER/AISTEERINGRULES.md`

3. For client state snapshots flagged in PHASE 2:
   - Determine the client slug (e.g., `promeniq` → `promeniq-state.md`).
   - Check if `$HOLOCRON_MEMORY_DIR/memory/{client}-state.md` exists.
     - If it exists: read the file, then update only the sections that have changed — do not append blindly. Preserve existing facts that are still accurate.
     - If it does not exist: create it with the following header, then populate:
       ```markdown
       # {Client} — State Snapshot
       <!-- reflect: generated {REFLECT_TS} -->

       ## Active Risks

       ## Known Tech Debt

       ## Behavioral Quirks

       ## Unresolved Issues
       ```
   - Add a `<!-- reflect: applied from signals {TIMESTAMPS} — {N} sessions -->` annotation at the top of the file on every write.

4. For behavioral correction patterns flagged in PHASE 2:
   - Check if `$HOLOCRON_MEMORY_DIR/memory/behavioral-corrections.md` exists.
     - If it does not exist: create it with this header before appending:
       ```markdown
       # Behavioral Correction Patterns
       <!-- Managed by Holocron Reflect. Do not edit manually. -->
       ```
   - For each new pattern, append one block in this format:
     ```markdown
     ### Pattern: [name]
     [1-2 sentence rule written in imperative voice, stating what NOT to do or what to do instead.]
     **Evidence:** N sessions, timestamps: {TS_1}, {TS_2}, {TS_3}
     **Why:** [Root cause hypothesis — one sentence.]
     <!-- reflect: applied from signals {TIMESTAMPS} — rating avg {N} -->
     ```
   - Never overwrite an existing pattern entry. If the same pattern recurs after a prior reflect run, append a `**Recurrence:**` line to the existing entry with the new timestamps and updated session count.

5. For EVERY change, add a source annotation comment in the file using this format:
   `<!-- reflect: applied from signals {TIMESTAMP_1}, {TIMESTAMP_2} — rating avg {N} -->`

6. Commit the changes and push directly to main:
   ```bash
   cd $HOLOCRON_MEMORY_DIR
   git add -A
   git commit -m "reflect($REFLECT_TS): apply learning signals to memory"
   git push origin main
   ```

If no memory changes are needed, skip to PHASE 5.

---

## PHASE 5 — APPLY SYSTEM CHANGES (Holocron repo)

Only proceed if PHASE 3 snapshot was confirmed.

If there are algorithm/system changes to apply:

1. Switch to the Holocron repo and create a feature branch:
   ```bash
   HOLOCRON_REPO=$(cd $HOLOCRON_MEMORY_DIR && git remote get-url origin | sed 's|.*github.com[:/]\(.*\)\.git|\1|' | head -1)
   # Use the actual Holocron repo path — check memory for it
   cd /Users/jbreissinger/Projects/personalProjects/Holocron
   git checkout main && git pull
   git checkout -b "reflect/$REFLECT_TS"
   ```

2. Apply each "Apply" item from the synthesis table to the correct file:
   - Algorithm process improvements → `instructions/algorithm.md` (open items section or inline at relevant phase)
   - Behavioral steering changes → `instructions/steering-rules.md`
   - Roadmap items or deferred work surfaced by signals → `ROADMAP.md`
   - Agent improvements → both `agents/claude/{AgentName}.md` AND `agents/opencode/{AgentName}.md`. The opencode version may have additional frontmatter (voice, persona, color) — preserve it. Only update the body content that the signals call out. Apply the ContextEngineer's own audit protocol when editing agent files: identify the specific section that caused the problem before adding new rules.

3. For EVERY change, add a source annotation comment:
   `<!-- reflect: applied from signals {TIMESTAMP_1}, {TIMESTAMP_2} — rating avg {N} -->`

4. Commit the changes:
   ```bash
   cd /Users/jbreissinger/Projects/personalProjects/Holocron
   git add -A
   git commit -m "reflect($REFLECT_TS): apply learning signals to system"
   git push -u origin "reflect/$REFLECT_TS"
   ```

If no system changes are needed, skip to PHASE 6.

---

## PHASE 6 — CLEAR ORIGINALS + OPEN PRs

Only clear signal files AFTER branches have been pushed (PHASES 4 and 5 complete).

1. Truncate original signal files (snapshot is the permanent record):
   ```bash
   > "$HOLOCRON_MEMORY_DIR/LEARNING/SIGNALS/ratings.jsonl"
   > "$HOLOCRON_MEMORY_DIR/LEARNING/REFLECTIONS/algorithm-reflections.jsonl"
   # Remove processed capture files (already in snapshot)
   rm -rf "$HOLOCRON_MEMORY_DIR/LEARNING/CAPTURES/"*/
   # NOTE: Do NOT clear agent-invocations.jsonl — it is a lifetime counter, not a per-cycle signal file.
   
   # Clean up old PRDs in WORK/ that have been processed for learnings
   grep -h -o '"prd_id":"[^"]*"' "$HOLOCRON_MEMORY_DIR/LEARNING/PROCESSED/"*/algorithm-reflections.jsonl "$SNAPSHOT_DIR/algorithm-reflections.jsonl" 2>/dev/null | cut -d'"' -f4 | sort -u | while read -r prd; do
     if [ -n "$prd" ] && [ -d "$HOLOCRON_MEMORY_DIR/WORK/$prd" ]; then
       rm -rf "$HOLOCRON_MEMORY_DIR/WORK/$prd"
     fi
   done
   ```

2. Output memory repo push success (if memory changes were pushed):
   ```bash
   echo "Memory changes pushed directly to main."
   ```

3. Open PR in `Holocron` repo (if system branch was pushed):
   ```bash
   cd /Users/jbreissinger/Projects/personalProjects/Holocron
   gh pr create \
     --title "reflect($REFLECT_TS): apply learning signals to system" \
     --body "$(cat <<EOF
   ## Reflect Run: $REFLECT_TS

   Applied learning signals from Holocron Reflect workflow.

   ### Signal Summary
   <!-- Insert synthesis table from PHASE 2 here -->

   ### Changes Applied
   <!-- List each file changed and the reason -->

   ### Source Signals
   Snapshot: \`LEARNING/PROCESSED/$REFLECT_TS/\` in holocron-context repo

   **Review these changes before merging.** Each item is sourced from real session signals but requires human judgment.
   EOF
   )" \
     --base main \
     --head "reflect/$REFLECT_TS"
   ```

4. Output a final summary:
   ```
   ✅ Reflect complete: $REFLECT_TS
   📦 Signals archived: LEARNING/PROCESSED/$REFLECT_TS/
   🔀 PRs opened: [list PR URLs]
   📋 Applied N changes across M files
   
   ### Work Applied Summary
   - **[File path]**: [Brief description of the rule/change applied]
   
   ⏭️  Original signal files cleared — ready for next reflect run
   ```

---

## RULES (non-negotiable)

- Never commit or push directly to `main` in the Holocron system repo (it is OK for the holocron-context repo)
- Never delete snapshot contents — PROCESSED/ is permanent
- Never apply a pattern that appears in only 1 session unless it's an explicit preference correction
- If synthesis produces zero actionable items, still create the snapshot and report clearly
- Source annotations are mandatory on every change — traceability to originating signals is required for the human reviewer
