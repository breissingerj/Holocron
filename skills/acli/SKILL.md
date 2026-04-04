---
name: acli
description: Interact with Atlassian Cloud products via the Atlassian CLI (acli). Use when the user needs to manage Jira work items, projects, sprints, boards, filters, dashboards, or fields; manage organization users and admin authentication; or interact with Rovo Dev AI coding agent authentication.
allowed-tools: Bash(acli:*)
---

# Atlassian CLI (acli)

## Command structure

```
acli <command> [<subcommand>...] {MANDATORY FLAGS} [OPTIONAL FLAGS]
```

## Top-level commands

| Command | Description |
|---------|-------------|
| `acli admin` | Manage Atlassian organization users and authentication |
| `acli jira` | Interact with Jira Cloud |
| `acli rovodev` | Authenticate with Rovo Dev AI coding agent |
| `acli feedback` | Submit feedback or report problems |

---

## Admin

### Authentication

```bash
# Login to admin
acli admin auth login

# Login via browser (OAuth)
acli admin auth login --web

# Check status
acli admin auth status

# Switch accounts
acli admin auth switch

# Logout
acli admin auth logout
```

### User management

```bash
# Activate a user
acli admin user activate --account-id "abc123"

# Deactivate a user
acli admin user deactivate --account-id "abc123"

# Delete a user
acli admin user delete --account-id "abc123"

# Cancel a pending user deletion
acli admin user cancel-delete --account-id "abc123"
```

---

## Rovo Dev

```bash
# Login to Rovo Dev
acli rovodev auth login

# Check auth status
acli rovodev auth status

# Logout
acli rovodev auth logout
```

---

## Jira

### Authentication

```bash
# Login with API token (recommended for scripts)
echo <token> | acli jira auth login --site "mysite.atlassian.net" --email "user@atlassian.com" --token

# Login with OAuth via browser
acli jira auth login --web

# Check current auth status
acli jira auth status

# Switch between accounts
acli jira auth switch

# Logout
acli jira auth logout
```

### Work Items

#### Create

```bash
# Basic creation
acli jira workitem create --summary "Fix login bug" --project "PROJ" --type "Bug"

# With all common fields
acli jira workitem create \
  --summary "New feature" \
  --project "TEAM" \
  --type "Story" \
  --description "Plain text or ADF JSON" \
  --assignee "user@example.com" \
  --assignee "@me" \
  --label "frontend,urgent" \
  --parent "TEAM-42"

# From a text file (summary + description)
acli jira workitem create --from-file workitem.txt --project "PROJ" --type "Task"

# From a description file with other flags
acli jira workitem create --summary "Deploy fix" --description-file desc.md --project "PROJ" --type "Task"

# From a JSON definition file
acli jira workitem create --from-json workitem.json

# Generate a JSON template to fill in
acli jira workitem create --generate-json

# Open text editor to write summary + description interactively
acli jira workitem create --editor --project "PROJ" --type "Task"

# Output created item as JSON
acli jira workitem create --summary "Test" --project "PROJ" --type "Task" --json

# Bulk create from JSON file
acli jira workitem create-bulk --from-json items.json
```

#### View

```bash
# View a single work item (default fields: key, issuetype, summary, status, assignee, description)
acli jira workitem view PROJ-123

# Output as JSON
acli jira workitem view PROJ-123 --json

# Specific fields
acli jira workitem view PROJ-123 --fields "summary,comment,priority"

# All fields
acli jira workitem view PROJ-123 --fields "*all"

# Navigable fields only
acli jira workitem view PROJ-123 --fields "*navigable"

# All except description
acli jira workitem view PROJ-123 --fields "*navigable,-description"

# Open in browser
acli jira workitem view PROJ-123 --web
```

#### Search

```bash
# Search with JQL
acli jira workitem search --jql "project = PROJ AND status = 'In Progress'"

# Paginate through all results
acli jira workitem search --jql "project = PROJ" --paginate

# Limit results
acli jira workitem search --jql "assignee = currentUser()" --limit 20

# Count matches only
acli jira workitem search --jql "project = PROJ AND priority = High" --count

# Custom fields in output (default: issuetype,key,assignee,priority,status,summary)
acli jira workitem search --jql "project = PROJ" --fields "key,summary,status,priority"

# Export as CSV
acli jira workitem search --jql "project = PROJ" --fields "key,summary,assignee" --csv

# Output as JSON
acli jira workitem search --jql "project = PROJ" --limit 50 --json

# Search using a saved Jira filter ID
acli jira workitem search --filter 10001

# Open results in browser
acli jira workitem search --jql "project = PROJ" --web
```

#### Edit

```bash
# Edit one or more work items by key
acli jira workitem edit --key "PROJ-1" --summary "Updated summary"
acli jira workitem edit --key "PROJ-1,PROJ-2,PROJ-3" --assignee "user@example.com"

# Edit via JQL (bulk)
acli jira workitem edit --jql "project = PROJ AND status = 'To Do'" --assignee "@me"

# Edit via saved filter
acli jira workitem edit --filter 10001 --description "Updated description"

# Edit multiple fields at once
acli jira workitem edit --key "PROJ-1" \
  --summary "New title" \
  --description "New description" \
  --type "Story" \
  --labels "backend,api"

# Remove assignee
acli jira workitem edit --key "PROJ-1" --remove-assignee

# Remove specific labels
acli jira workitem edit --key "PROJ-1" --remove-labels "old-label"

# Skip confirmation prompt
acli jira workitem edit --jql "project = PROJ" --assignee "@me" --yes

# Continue despite errors in bulk edit
acli jira workitem edit --jql "project = PROJ" --summary "Bulk update" --ignore-errors --yes

# Edit from JSON file
acli jira workitem edit --from-json edit.json

# Generate edit JSON template
acli jira workitem edit --generate-json
```

#### Transition

```bash
# Transition by key
acli jira workitem transition --key "PROJ-1" --status "Done"
acli jira workitem transition --key "PROJ-1,PROJ-2" --status "In Progress"

# Transition via JQL (bulk)
acli jira workitem transition --jql "project = PROJ AND assignee = currentUser()" --status "In Review"
```

#### Assign

```bash
# Assign by key
acli jira workitem assign --key "PROJ-1" --assignee "user@example.com"

# Self-assign
acli jira workitem assign --key "PROJ-1" --assignee "@me"

# Assign to default assignee
acli jira workitem assign --key "PROJ-1" --assignee "default"

# Bulk assign via JQL
acli jira workitem assign --jql "project = PROJ AND status = 'To Do'" --assignee "@me" --yes

# Assign via filter
acli jira workitem assign --filter 10001 --assignee "user@example.com"

# Remove assignee
acli jira workitem assign --key "PROJ-1" --remove-assignee

# Assign from file (list of keys)
acli jira workitem assign --from-file keys.txt --assignee "@me"

# Output as JSON
acli jira workitem assign --key "PROJ-1" --assignee "@me" --json
```

#### Comments

```bash
# Add a comment by key
acli jira workitem comment create --key "PROJ-1" --body "This is a comment"

# Add comment from file
acli jira workitem comment create --key "PROJ-1" --body-file comment.md

# Add comment via JQL
acli jira workitem comment create --jql "project = PROJ AND status = 'In Review'" --body "Reviewed"

# Open editor to write comment
acli jira workitem comment create --key "PROJ-1" --editor

# Edit the last comment by same author
acli jira workitem comment create --key "PROJ-1" --edit-last --body "Corrected comment"

# List comments
acli jira workitem comment list --key "PROJ-1"
acli jira workitem comment list --key "PROJ-1" --json

# Update a comment (by comment ID)
acli jira workitem comment update --key "PROJ-1" --comment-id 10001 --body "Updated text"

# Delete a comment
acli jira workitem comment delete --key "PROJ-1" --comment-id 10001

# Set comment visibility
acli jira workitem comment visibility --key "PROJ-1" --comment-id 10001
```

#### Links

```bash
# Link two items (outward blocks inward)
acli jira workitem link create --out "PROJ-1" --in "PROJ-2" --type "Blocks"

# Confirm without prompt
acli jira workitem link create --out "PROJ-1" --in "PROJ-2" --type "Relates to" --yes

# Batch link from JSON
acli jira workitem link create --from-json links.json

# Batch link from CSV (columns: outward-id, inward-id, link-type)
acli jira workitem link create --from-csv links.csv

# Generate JSON template for links
acli jira workitem link create --generate-json

# Continue despite errors in batch
acli jira workitem link create --from-json links.json --ignore-errors
```

#### Attachments

```bash
# List attachments on a work item
acli jira workitem attachment list --key "PROJ-1"
acli jira workitem attachment list --key "PROJ-1" --json

# Delete an attachment (by attachment ID)
acli jira workitem attachment delete --key "PROJ-1" --attachment-id 10001
```

#### Clone, Archive, Delete

```bash
# Clone a work item
acli jira workitem clone --key "PROJ-1"

# Archive one or more work items
acli jira workitem archive --key "PROJ-1,PROJ-2"
acli jira workitem archive --jql "project = PROJ AND status = Done"

# Unarchive
acli jira workitem unarchive --key "PROJ-1"

# Delete (permanent)
acli jira workitem delete --key "PROJ-1"
acli jira workitem delete --jql "project = PROJ AND created < -90d"

# Remove a watcher
acli jira workitem watcher remove --key "PROJ-1" --account-id "abc123"
```

### Projects

```bash
# List visible projects
acli jira project list
acli jira project list --json

# View a project
acli jira project view --project "PROJ"
acli jira project view --project "PROJ" --json

# Create a project from an existing one (clone)
acli jira project create --from-project "TEMPLATE" --key "NEWPROJ" --name "New Project"

# Create with all fields
acli jira project create \
  --from-project "TEMPLATE" \
  --key "NEWPROJ" \
  --name "New Project" \
  --description "Description here" \
  --url "https://example.com" \
  --lead-email "lead@example.com"

# Generate project JSON template
acli jira project create --generate-json

# Create from JSON file
acli jira project create --from-json project.json

# Update a project
acli jira project update --project "PROJ" --name "Renamed Project"

# Archive a project
acli jira project archive --project "PROJ"

# Restore an archived project
acli jira project restore --project "PROJ"

# Delete a project (permanent)
acli jira project delete --project "PROJ"
```

### Boards & Sprints

```bash
# Search boards
acli jira board search --name "My Board"
acli jira board search --project "PROJ" --json

# List work items in a sprint (board ID and sprint ID required)
acli jira sprint list-workitems --board 6 --sprint 1

# With options
acli jira sprint list-workitems --board 6 --sprint 1 \
  --fields "key,summary,assignee,status" \
  --limit 100 \
  --paginate \
  --json

# Filter sprint items with JQL
acli jira sprint list-workitems --board 6 --sprint 1 --jql "assignee = currentUser()"

# Export sprint items as CSV
acli jira sprint list-workitems --board 6 --sprint 1 --csv
```

### Filters

```bash
# List filters
acli jira filter list

# Search filters
acli jira filter search --name "My Filter"

# Add a filter to favorites
acli jira filter add-favorite --filter 10001

# Change filter ownership
acli jira filter change-owner --filter 10001 --owner "user@example.com"
```

### Dashboards

```bash
# Search dashboards
acli jira dashboard search --name "My Dashboard"
acli jira dashboard search --json
```

### Custom Fields

```bash
# List custom fields
acli jira field list

# Create a custom field
acli jira field create --name "My Field" --type "text"

# Delete a custom field
acli jira field delete --field 10001

# Cancel a field deletion
acli jira field cancel-delete --field 10001
```

## Common patterns

### My open work
```bash
acli jira workitem search --jql "assignee = currentUser() AND status != Done ORDER BY updated DESC"
```

### Sprint work for a project
```bash
acli jira workitem search --jql "project = PROJ AND sprint in openSprints()" --paginate
```

### Bulk close resolved items
```bash
acli jira workitem transition \
  --jql "project = PROJ AND status = Resolved AND updated < -7d" \
  --status "Done"
```

### Move all unassigned bugs to yourself
```bash
acli jira workitem assign \
  --jql "project = PROJ AND issuetype = Bug AND assignee is EMPTY" \
  --assignee "@me" --yes
```

### Export sprint to CSV for reporting
```bash
acli jira sprint list-workitems --board 6 --sprint 1 \
  --fields "key,summary,assignee,status,priority,story_points" \
  --csv > sprint-report.csv
```

### Create issue and capture its key
```bash
acli jira workitem create \
  --summary "New task" --project "PROJ" --type "Task" \
  --json | jq -r '.key'
```

### Multi-step automation
```bash
# 1. Create epic
EPIC_KEY=$(acli jira workitem create --summary "Q1 Feature" --project "PROJ" --type "Epic" --json | jq -r '.key')

# 2. Create stories under the epic
acli jira workitem create --summary "API endpoints" --project "PROJ" --type "Story" --parent "$EPIC_KEY"
acli jira workitem create --summary "Frontend UI" --project "PROJ" --type "Story" --parent "$EPIC_KEY"
```

## Output formats

All commands support `--json` for machine-readable output. Search and list commands also support `--csv`. Pipe `--json` output to `jq` for filtering:

```bash
# Get just keys from a search
acli jira workitem search --jql "project = PROJ" --json | jq -r '.[].key'

# Get summary and status
acli jira workitem search --jql "project = PROJ" --json | jq -r '.[] | "\(.key)\t\(.fields.summary)\t\(.fields.status.name)"'
```

## Reference docs

- [JQL query guide](references/jql-guide.md)
- [Bulk operations patterns](references/bulk-operations.md)
