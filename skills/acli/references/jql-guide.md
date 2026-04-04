# JQL (Jira Query Language) Reference

JQL is used with `--jql` flags across many `acli jira workitem` and `acli jira sprint` commands.

## Basic syntax

```
field operator value [ORDER BY field direction]
```

## Common fields

| Field | Description | Example value |
|-------|-------------|---------------|
| `project` | Project key | `PROJ` |
| `issuetype` | Issue type | `Bug`, `Story`, `Task`, `Epic` |
| `status` | Workflow status | `"To Do"`, `"In Progress"`, `Done` |
| `assignee` | Assigned user | `"user@example.com"`, `currentUser()`, `EMPTY` |
| `reporter` | Created by | `currentUser()` |
| `priority` | Priority level | `High`, `Medium`, `Low`, `Critical` |
| `labels` | Issue labels | `"backend"` |
| `sprint` | Sprint | `openSprints()`, `closedSprints()`, `1` |
| `fixVersion` | Fix version | `"v2.0"` |
| `component` | Component | `"API"` |
| `created` | Created date | `"2024-01-01"`, `-7d`, `-1w` |
| `updated` | Last updated | `"-30d"` |
| `dueDate` | Due date | `"2024-12-31"`, `< now()` |
| `summary` | Issue title | `~ "login"` (contains) |
| `description` | Description text | `~ "error"` |
| `parent` | Parent issue key | `"PROJ-1"` |

## Operators

| Operator | Meaning | Example |
|----------|---------|---------|
| `=` | Equals | `status = Done` |
| `!=` | Not equals | `status != Done` |
| `>`, `<`, `>=`, `<=` | Comparison (dates/numbers) | `created > -7d` |
| `~` | Contains (text search) | `summary ~ "login"` |
| `!~` | Does not contain | `summary !~ "test"` |
| `in (...)` | In list | `status in ("To Do", "In Progress")` |
| `not in (...)` | Not in list | `issuetype not in (Epic, Sub-task)` |
| `is EMPTY` | Field is empty | `assignee is EMPTY` |
| `is not EMPTY` | Field is not empty | `fixVersion is not EMPTY` |
| `was` | Previous value | `status was "In Progress"` |
| `changed` | Field changed | `status changed` |

## Functions

| Function | Description |
|----------|-------------|
| `currentUser()` | Logged-in user |
| `openSprints()` | Active sprints |
| `closedSprints()` | Closed sprints |
| `futureSprints()` | Upcoming sprints |
| `now()` | Current datetime |
| `startOfDay()` | Start of today |
| `endOfDay()` | End of today |
| `startOfWeek()` | Start of current week |
| `endOfWeek()` | End of current week |
| `startOfMonth()` | Start of current month |
| `membersOf("group")` | All members of a group |

## Relative date syntax

```
-Nd    N days ago        (e.g. -7d = 7 days ago)
-Nw    N weeks ago       (e.g. -2w = 2 weeks ago)
-Nm    N months ago      (e.g. -1m = 1 month ago)
+Nd    N days from now
```

## Logical operators

```
AND   Both conditions must be true
OR    Either condition must be true
NOT   Negate a condition
```

Parentheses control precedence: `(A OR B) AND C`

## ORDER BY

```
ORDER BY field ASC
ORDER BY field DESC
ORDER BY field1 ASC, field2 DESC
```

Common sort fields: `created`, `updated`, `priority`, `status`, `key`

## Practical examples

```jql
# My open issues this sprint
assignee = currentUser() AND sprint in openSprints() AND status != Done

# Unassigned bugs in a project
project = PROJ AND issuetype = Bug AND assignee is EMPTY

# High priority items due soon
priority in (High, Critical) AND dueDate <= 7d AND status != Done

# Recently updated stories
issuetype = Story AND updated >= -3d ORDER BY updated DESC

# Everything in a project not in a sprint
project = PROJ AND sprint is EMPTY AND status != Done

# Issues I reported that are still open
reporter = currentUser() AND status not in (Done, Closed, Resolved)

# Large epics with many sub-tasks
issuetype = Epic AND project = PROJ ORDER BY created ASC

# Issues moved to Done this week
status = Done AND status changed after startOfWeek()

# Blockers
issuetype = Bug AND priority = Critical AND status != Done ORDER BY created ASC

# Issues created in the last 24 hours
created >= -1d ORDER BY created DESC
```
