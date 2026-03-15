# Bulk Operations Patterns

`acli jira workitem` commands that accept `--jql`, `--filter`, or `--key` with comma-separated values support bulk operations.

## Targeting strategies

### By explicit keys
```bash
--key "PROJ-1,PROJ-2,PROJ-3"
```

### By JQL query
```bash
--jql "project = PROJ AND status = 'To Do'"
```
JQL is the most flexible option — always test your query with `acli jira workitem search --jql "..."` before running a destructive bulk operation.

### By saved filter ID
```bash
--filter 10001
```
Find filter IDs with `acli jira filter list`.

### From a file (assign only)
```bash
--from-file keys.txt   # one key per line
```

## Safety flags

```bash
--yes              # skip confirmation prompt (use in scripts)
--ignore-errors    # continue processing if some items fail (useful in large batches)
--json             # see machine-readable output of what was changed
```

## Recommended workflow for risky bulk ops

1. **Preview** — search first to see what will be affected:
   ```bash
   acli jira workitem search --jql "project = PROJ AND ..." --fields "key,summary,status"
   ```

2. **Count** — verify the scope:
   ```bash
   acli jira workitem search --jql "project = PROJ AND ..." --count
   ```

3. **Execute** with `--yes` once confident:
   ```bash
   acli jira workitem transition --jql "project = PROJ AND ..." --status "Done" --yes
   ```

## Bulk assign all open issues to yourself
```bash
acli jira workitem assign \
  --jql "project = PROJ AND status != Done AND assignee is EMPTY" \
  --assignee "@me" --yes
```

## Bulk label a set of issues
```bash
acli jira workitem edit \
  --jql "project = PROJ AND sprint in openSprints() AND issuetype = Bug" \
  --labels "sprint-bug" --yes
```

## Bulk transition with JQL
```bash
# Close all resolved issues older than 2 weeks
acli jira workitem transition \
  --jql "project = PROJ AND status = Resolved AND updated < -14d" \
  --status "Done" --yes

# Move backlog to In Progress for sprint kick-off
acli jira workitem transition \
  --jql "project = PROJ AND sprint in openSprints() AND status = 'To Do'" \
  --status "In Progress" --yes
```

## Bulk create from JSON

Generate a template first:
```bash
acli jira workitem create --generate-json > template.json
```

Then populate and create:
```bash
acli jira workitem create-bulk --from-json items.json
```

## Bulk link from CSV

CSV format: `outward-id,inward-id,link-type`
```csv
PROJ-1,PROJ-2,Blocks
PROJ-1,PROJ-3,Blocks
PROJ-4,PROJ-5,Relates to
```

```bash
acli jira workitem link create --from-csv links.csv --ignore-errors
```

## Scripting with JSON output

Capture keys from a search to feed into another command:

```bash
# Get all open bugs and create a blocker link to a tracking issue
acli jira workitem search \
  --jql "project = PROJ AND issuetype = Bug AND status != Done" \
  --json | jq -r '.[].key' | while read key; do
    acli jira workitem link create --out "$key" --in "PROJ-999" --type "Relates to" --yes
done
```

## Parallel execution

For large datasets, split the JQL into batches using `--limit` and process in parallel:

```bash
# Batch 1
acli jira workitem edit --jql "project = PROJ AND ..." --limit 50 --yes &

# Batch 2 (different project)
acli jira workitem edit --jql "project = OTHER AND ..." --limit 50 --yes &

wait
```

## Error handling in scripts

```bash
if ! acli jira workitem transition --key "PROJ-1" --status "Done"; then
  echo "Transition failed for PROJ-1" >&2
  exit 1
fi
```

Use `--ignore-errors` for bulk ops where partial success is acceptable.
