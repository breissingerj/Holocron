---
name: linear-cli
description: >
  Query and manage Linear resources — issues, teams, projects, cycles, workflows,
  users, comments, and labels — via the Linear GraphQL API. USE WHEN linear, issue,
  Linear ticket, create issue, update issue, list issues, Linear project, Linear team,
  Linear cycle, Linear workflow, Linear label, Linear comment, linear.new, Linear API,
  Linear GraphQL, Linear auth, linear-auth.
allowed-tools: Bash(linear-auth:*), Bash(curl:*), Bash(python3:*), Bash(jq:*)
---

# Linear CLI

Interact with the [Linear GraphQL API](https://api.linear.app/graphql) using `curl` +
the `linear-auth` token manager. All mutations and queries are plain GraphQL POSTed as JSON.

---

## Authentication (MANDATORY FIRST STEP)

### Check token availability

```bash
LINEAR_TOKEN=$(linear-auth token 2>/dev/null) && echo "OK: ${LINEAR_TOKEN:0:12}…" || echo "NOT AUTHENTICATED"
```

### If not authenticated — three options (OAuth is default)

#### Option A — OAuth2 (recommended, interactive)

Requires an OAuth app registered at https://linear.app/settings/api/applications.

```bash
# Provide client_id/secret via env or interactive prompt
export LINEAR_CLIENT_ID="your-client-id"
export LINEAR_CLIENT_SECRET="your-client-secret"
linear-auth login
```

This opens a browser, completes the web flow, and saves tokens to
`~/.config/linear/credentials.json`. Tokens are auto-refreshed (access token expires
in 24h; refresh token is stored and used automatically).

#### Option B — Personal API Key (fast, non-interactive)

```bash
linear-auth set-key "lin_api_xxxxxxxxxxxxxxxxxxxx"
```

Get a key at https://linear.app/settings/account/security → Personal API Keys.

#### Option C — Pass token inline (one-off)

```bash
export LINEAR_TOKEN="lin_api_xxxxxxxxxxxxxxxxxxxx"
# Then use $LINEAR_TOKEN in every curl call
```

### Check auth status

```bash
linear-auth status
```

### Helper: export token for the session

Always do this at the start of a session so you can use `$LINEAR_TOKEN` in all calls:

```bash
export LINEAR_TOKEN=$(linear-auth token)
```

---

## Making GraphQL Requests

The API endpoint is `https://api.linear.app/graphql`.

**Auth header:**
- OAuth token: `Authorization: Bearer <token>`
- Personal API key: `Authorization: <key>` (no "Bearer" prefix — Linear rejects it)

> **IMPORTANT:** Personal API keys must NOT use `Bearer`. Always check the auth type and set the header accordingly:

```bash
AUTH_TYPE=$(linear-auth status 2>/dev/null | grep 'Auth type' | awk '{print $NF}')
if [ "$AUTH_TYPE" = "key" ]; then
  AUTH_HEADER="Authorization: $LINEAR_TOKEN"
else
  AUTH_HEADER="Authorization: Bearer $LINEAR_TOKEN"
fi
```

Or simply omit `Bearer` always — OAuth tokens also work without it (Linear accepts `Authorization: <token>` for both types).

### Base curl template

```bash
LINEAR_TOKEN=$(linear-auth token)

linear_gql() {
  local query="$1"
  curl -s -X POST https://api.linear.app/graphql \
    -H "Content-Type: application/json" \
    -H "Authorization: $LINEAR_TOKEN" \
    --data "$(python3 -c "import json,sys; print(json.dumps({'query': sys.argv[1]}))" "$query")"
}
```

### Inline one-liner

```bash
curl -s -X POST https://api.linear.app/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: $(linear-auth token)" \
  --data '{"query": "{ viewer { id name email } }"}' | jq .
```

---

## Quick Start

```bash
export LINEAR_TOKEN=$(linear-auth token)

# Who am I?
curl -s -X POST https://api.linear.app/graphql \
  -H "Content-Type: application/json" -H "Authorization: $LINEAR_TOKEN" \
  --data '{"query":"{ viewer { id name email } }"}' | jq '.data.viewer'

# List my teams
curl -s -X POST https://api.linear.app/graphql \
  -H "Content-Type: application/json" -H "Authorization: $LINEAR_TOKEN" \
  --data '{"query":"{ teams { nodes { id name key } } }"}' | jq '.data.teams.nodes'

# List issues assigned to me (last 25)
curl -s -X POST https://api.linear.app/graphql \
  -H "Content-Type: application/json" -H "Authorization: $LINEAR_TOKEN" \
  --data '{"query":"{ viewer { assignedIssues(first: 25) { nodes { id identifier title state { name } priority } } } }"}' \
  | jq '.data.viewer.assignedIssues.nodes'
```

---

## Command Reference

All examples assume:
```bash
export LINEAR_TOKEN=$(linear-auth token)
GRAPHQL="https://api.linear.app/graphql"
GQL_HEADERS=('-H' 'Content-Type: application/json' '-H' "Authorization: $LINEAR_TOKEN")
```

### Helper function (paste once per session)

```bash
gql() {
  curl -s -X POST "$GRAPHQL" "${GQL_HEADERS[@]}" \
    --data "$(python3 -c "import json,sys; print(json.dumps({'query': sys.argv[1]}))" "$1")"
}

# With variables
gqlv() {
  local query="$1"; local vars="$2"
  curl -s -X POST "$GRAPHQL" "${GQL_HEADERS[@]}" \
    --data "$(python3 -c "
import json,sys
q,v = sys.argv[1], sys.argv[2]
print(json.dumps({'query': q, 'variables': json.loads(v)}))
" "$query" "$vars")"
}
```

---

### Viewer / Me

```bash
gql '{ viewer { id name email displayName avatarUrl } }'
```

---

### Teams

```bash
# List all teams
gql '{ teams { nodes { id name key description } } }' | jq '.data.teams.nodes'

# Get a specific team (by key like "ENG" or UUID)
gql '{ team(id: "ENG") { id name key states { nodes { id name type } } labels { nodes { id name color } } } }' \
  | jq '.data.team'
```

---

### Issues

#### List

```bash
# My open issues
gql '{
  viewer {
    assignedIssues(first: 50, filter: { state: { type: { nin: ["completed","cancelled"] } } }) {
      nodes { id identifier title priority state { name } updatedAt }
    }
  }
}' | jq '.data.viewer.assignedIssues.nodes'

# Issues for a team (most recently updated)
gql '{
  team(id: "ENG") {
    issues(first: 50, orderBy: updatedAt) {
      nodes { id identifier title state { name } assignee { name } priority }
    }
  }
}' | jq '.data.team.issues.nodes'

# Filter: in-progress issues for a team
gql '{
  issues(filter: { team: { key: { eq: "ENG" } }, state: { type: { eq: "started" } } }) {
    nodes { identifier title assignee { name } }
  }
}' | jq '.data.issues.nodes'
```

#### View a single issue

```bash
# By identifier (e.g. "ENG-42") or UUID
gql '{ issue(id: "ENG-42") { id identifier title description state { name } assignee { name } labels { nodes { name } } createdAt updatedAt } }' \
  | jq '.data.issue'
```

#### Create

```bash
# Minimal create (needs teamId)
TEAM_ID=$(gql '{ team(id: "ENG") { id } }' | jq -r '.data.team.id')

gqlv 'mutation IssueCreate($input: IssueCreateInput!) {
  issueCreate(input: $input) {
    success
    issue { id identifier title url }
  }
}' "{
  \"input\": {
    \"teamId\": \"$TEAM_ID\",
    \"title\": \"Fix the thing\",
    \"description\": \"More details here in **markdown**\"
  }
}" | jq '.data.issueCreate'

# With priority (0=No priority, 1=Urgent, 2=High, 3=Medium, 4=Low)
gqlv 'mutation IssueCreate($input: IssueCreateInput!) {
  issueCreate(input: $input) { success issue { identifier url } }
}' "{
  \"input\": {
    \"teamId\": \"$TEAM_ID\",
    \"title\": \"Critical regression\",
    \"priority\": 1,
    \"description\": \"Happening in prod\"
  }
}" | jq '.data.issueCreate'

# With assignee, status, and label
STATE_ID=$(gql '{ team(id: "ENG") { states { nodes { id name } } } }' | jq -r '.data.team.states.nodes[] | select(.name=="In Progress") | .id')
ASSIGNEE_ID=$(gql '{ viewer { id } }' | jq -r '.data.viewer.id')

gqlv 'mutation IssueCreate($input: IssueCreateInput!) {
  issueCreate(input: $input) { success issue { identifier url } }
}' "{
  \"input\": {
    \"teamId\": \"$TEAM_ID\",
    \"title\": \"New feature\",
    \"stateId\": \"$STATE_ID\",
    \"assigneeId\": \"$ASSIGNEE_ID\",
    \"priority\": 3
  }
}" | jq '.data.issueCreate'
```

#### Update

```bash
# Update by identifier or UUID
gqlv 'mutation IssueUpdate($id: String!, $input: IssueUpdateInput!) {
  issueUpdate(id: $id, input: $input) {
    success
    issue { identifier title state { name } }
  }
}' '{
  "id": "ENG-42",
  "input": {
    "title": "Updated title",
    "stateId": "STATE_UUID_HERE"
  }
}' | jq '.data.issueUpdate'

# Move to a different state
STATE_ID=$(gql '{ team(id: "ENG") { states { nodes { id name } } } }' | jq -r '.data.team.states.nodes[] | select(.name=="Done") | .id')

gqlv 'mutation IssueUpdate($id: String!, $input: IssueUpdateInput!) {
  issueUpdate(id: $id, input: $input) { success }
}' "{\"id\": \"ENG-42\", \"input\": {\"stateId\": \"$STATE_ID\"}}" | jq .

# Change priority
gqlv 'mutation IssueUpdate($id: String!, $input: IssueUpdateInput!) {
  issueUpdate(id: $id, input: $input) { success }
}' '{"id": "ENG-42", "input": {"priority": 2}}' | jq .
```

#### Archive / Delete

```bash
# Archive
gqlv 'mutation IssueArchive($id: String!) {
  issueArchive(id: $id) { success }
}' '{"id": "ENG-42"}' | jq .

# Delete (permanent)
gqlv 'mutation IssueDelete($id: String!) {
  issueDelete(id: $id) { success }
}' '{"id": "ENG-42"}' | jq .
```

---

### Comments

```bash
# Add a comment
ISSUE_ID=$(gql '{ issue(id: "ENG-42") { id } }' | jq -r '.data.issue.id')

gqlv 'mutation CommentCreate($input: CommentCreateInput!) {
  commentCreate(input: $input) { success comment { id body } }
}' "{\"input\": {\"issueId\": \"$ISSUE_ID\", \"body\": \"LGTM — looks good to me!\"}}" | jq .

# List comments on an issue
gql '{ issue(id: "ENG-42") { comments { nodes { id body user { name } createdAt } } } }' \
  | jq '.data.issue.comments.nodes'
```

---

### Projects

```bash
# List projects
gql '{ projects(first: 50) { nodes { id name description state } } }' \
  | jq '.data.projects.nodes'

# Get a specific project
gql '{ project(id: "PROJECT_UUID") { id name description state issues { nodes { identifier title } } } }' \
  | jq '.data.project'
```

---

### Workflow States

```bash
# List states for a team
gql '{ team(id: "ENG") { states { nodes { id name type color position } } } }' \
  | jq '.data.team.states.nodes | sort_by(.position)'
```

---

### Labels

```bash
# List labels in a team
gql '{ team(id: "ENG") { labels { nodes { id name color } } } }' \
  | jq '.data.team.labels.nodes'

# Add a label to an issue (must collect existing label IDs first)
CURRENT_LABELS=$(gql '{ issue(id: "ENG-42") { labels { nodes { id } } } }' | jq -r '[.data.issue.labels.nodes[].id]')
NEW_LABEL_ID=$(gql '{ team(id: "ENG") { labels { nodes { id name } } } }' | jq -r '.data.team.labels.nodes[] | select(.name=="bug") | .id')

gqlv 'mutation IssueUpdate($id: String!, $input: IssueUpdateInput!) {
  issueUpdate(id: $id, input: $input) { success }
}' "{\"id\": \"ENG-42\", \"input\": {\"labelIds\": $(echo $CURRENT_LABELS | jq ". + [\"$NEW_LABEL_ID\"]")}}" | jq .
```

---

### Users

```bash
# List workspace members
gql '{ users { nodes { id name email displayName active } } }' \
  | jq '.data.users.nodes'

# Find a user by name
gql '{ users { nodes { id name email } } }' \
  | jq '.data.users.nodes[] | select(.name | test("Alice"; "i"))'
```

---

### Cycles (Sprints)

```bash
# List cycles for a team
gql '{ team(id: "ENG") { cycles { nodes { id name number startsAt endsAt isActive } } } }' \
  | jq '.data.team.cycles.nodes'

# Active cycle
gql '{ team(id: "ENG") { activeCycle { id name number issues { nodes { identifier title } } } } }' \
  | jq '.data.team.activeCycle'
```

---

## linear.new — Pre-filled Issue Links

Open a pre-filled issue creation form in Linear's web app without API credentials.

```
http://linear.new                             # blank new issue
http://linear.app/new                         # same
http://linear.app/team/<TEAM_ID>/new          # scoped to a team
```

### Supported query parameters

| Parameter | Description | Example |
|-----------|-------------|---------|
| `title` | Issue title (use `+` for spaces) | `?title=Fix+login+bug` |
| `description` | Issue description (markdown, `+` for spaces) | `?description=Steps+to+repro...` |
| `status` | Status name or UUID | `?status=In+Progress` |
| `priority` | `urgent`, `high`, `medium`, `low` | `?priority=high` |
| `assignee` | UUID, display name, or full name | `?assignee=john` |
| `estimate` | Point value (XS=1 S=2 M=3 L=5 XL=8 XXL=13) | `?estimate=3` |
| `label` / `labels` | Label name(s), comma-separated | `?labels=bug,android` |
| `project` | Project name or UUID (requires team in URL) | `?project=Q1+Launch` |
| `projectMilestone` | Milestone name or UUID | `?projectMilestone=Beta` |
| `template` | Template UUID | `?template=<UUID>` |

### Example links

```bash
# High-priority bug with assignee
echo "https://linear.new?title=Login+broken&priority=high&assignee=john&labels=bug"

# Team-scoped issue with project
TEAM="ENG"
echo "https://linear.app/team/$TEAM/new?title=New+feature&project=Q1+Launch&priority=medium"

# Generate a pre-filled URL from an existing issue's properties
# (In Linear app: open issue → Cmd+K → "Copy pre-filled create issue URL")
```

---

## Pagination

Linear uses cursor-based pagination. Pass `after: "<endCursor>"` to page through results.

```bash
# Get first page
RESULT=$(gql '{
  issues(first: 50) {
    nodes { identifier title }
    pageInfo { hasNextPage endCursor }
  }
}')

echo "$RESULT" | jq '.data.issues.nodes'
HAS_NEXT=$(echo "$RESULT" | jq -r '.data.issues.pageInfo.hasNextPage')
CURSOR=$(echo "$RESULT" | jq -r '.data.issues.pageInfo.endCursor')

# Get next page
if [ "$HAS_NEXT" = "true" ]; then
  gqlv '{
    issues(first: 50, after: $after) {
      nodes { identifier title }
      pageInfo { hasNextPage endCursor }
    }
  }' "{\"after\": \"$CURSOR\"}" | jq '.data.issues.nodes'
fi
```

---

## Filtering

Linear's `filter` argument supports rich filtering with `eq`, `neq`, `in`, `nin`, `contains`, `lt`, `gt`, `lte`, `gte`, `and`, `or`, `not`.

```bash
# Issues with specific state type
gql '{ issues(filter: { state: { type: { eq: "started" } } }) { nodes { identifier title } } }'

# High or urgent priority
gql '{ issues(filter: { priority: { in: [1, 2] } }) { nodes { identifier title priority } } }'

# Assigned to a specific user
USER_ID="USER_UUID"
gqlv '{ issues(filter: { assignee: { id: { eq: $userId } } }) { nodes { identifier title } } }' \
  "{\"userId\": \"$USER_ID\"}"

# Created in the last 7 days (ISO 8601)
SINCE=$(date -u -v-7d +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u --date="7 days ago" +"%Y-%m-%dT%H:%M:%SZ")
gqlv '{ issues(filter: { createdAt: { gt: $since } }) { nodes { identifier title createdAt } } }' \
  "{\"since\": \"$SINCE\"}"

# Issues with title containing "auth"
gql '{ issues(filter: { title: { containsIgnoreCase: "auth" } }) { nodes { identifier title } } }'
```

---

## Token Management

```bash
linear-auth status      # Show current auth state
linear-auth token       # Print current valid token (auto-refreshes)
linear-auth refresh     # Force-refresh access token
linear-auth revoke      # Revoke token and delete local credentials
linear-auth set-key <key>  # Switch to a personal API key
linear-auth login       # Re-run OAuth web flow
```

Tokens are stored at `~/.config/linear/credentials.json` (mode 0600).

---

## Error Handling

Linear always returns HTTP 200. Check `errors` in the response:

```bash
RESULT=$(gql '{ issue(id: "BAD-999") { id title } }')
ERRORS=$(echo "$RESULT" | jq '.errors')
if [ "$ERRORS" != "null" ]; then
  echo "GraphQL errors:" >&2
  echo "$ERRORS" | jq . >&2
else
  echo "$RESULT" | jq '.data'
fi
```

Common error codes:
- `AUTHENTICATION_ERROR` — invalid or expired token → run `linear-auth refresh` or `linear-auth login`
- `RATE_LIMITED` — slow down; Linear enforces request limits
- `NOT_FOUND` — entity ID doesn't exist

---

## Common Workflows

### My open work

```bash
export LINEAR_TOKEN=$(linear-auth token)
gql '{
  viewer {
    assignedIssues(
      first: 50,
      filter: { state: { type: { nin: ["completed","cancelled","triage"] } } }
      orderBy: updatedAt
    ) {
      nodes { identifier title priority state { name } updatedAt }
    }
  }
}' | jq '.data.viewer.assignedIssues.nodes'
```

### Create issue and capture identifier

```bash
export LINEAR_TOKEN=$(linear-auth token)
TEAM_ID=$(gql '{ team(id: "ENG") { id } }' | jq -r '.data.team.id')

IDENTIFIER=$(gqlv 'mutation IssueCreate($input: IssueCreateInput!) {
  issueCreate(input: $input) { issue { identifier } }
}' "{\"input\": {\"teamId\": \"$TEAM_ID\", \"title\": \"My task\"}}" \
  | jq -r '.data.issueCreate.issue.identifier')

echo "Created: $IDENTIFIER"
echo "URL: https://linear.app/issue/$IDENTIFIER"
```

### Move all my in-progress issues to Done

```bash
export LINEAR_TOKEN=$(linear-auth token)
STATE_ID=$(gql '{ team(id: "ENG") { states { nodes { id name } } } }' | jq -r '.data.team.states.nodes[] | select(.name=="Done") | .id')

gql '{
  viewer {
    assignedIssues(filter: { state: { type: { eq: "started" } } }) {
      nodes { id identifier }
    }
  }
}' | jq -r '.data.viewer.assignedIssues.nodes[].id' | while read -r issue_id; do
  gqlv 'mutation IssueUpdate($id: String!, $input: IssueUpdateInput!) {
    issueUpdate(id: $id, input: $input) { success }
  }' "{\"id\": \"$issue_id\", \"input\": {\"stateId\": \"$STATE_ID\"}}" | jq -r '"Updated \(.data.issueUpdate.success)"'
done
```

### Bulk create issues from a list

```bash
export LINEAR_TOKEN=$(linear-auth token)
TEAM_ID=$(gql '{ team(id: "ENG") { id } }' | jq -r '.data.team.id')

titles=("Implement auth flow" "Write unit tests" "Update docs" "Code review")
for title in "${titles[@]}"; do
  gqlv 'mutation IssueCreate($input: IssueCreateInput!) {
    issueCreate(input: $input) { issue { identifier title } }
  }' "{\"input\": {\"teamId\": \"$TEAM_ID\", \"title\": \"$title\"}}" \
    | jq -r '.data.issueCreate.issue | "\(.identifier) \(.title)"'
done
```

---

## Exploring the Schema

Linear's API supports introspection. Use Apollo Studio (no login needed):
→ https://studio.apollographql.com/sandbox/explorer?endpoint=https://api.linear.app/graphql

Or query introspection directly:

```bash
export LINEAR_TOKEN=$(linear-auth token)
# List all top-level query fields
gql '{ __schema { queryType { fields { name description } } } }' | jq '.data.__schema.queryType.fields[] | .name'

# Inspect a type
gql '{ __type(name: "Issue") { fields { name type { name kind ofType { name } } } } }' | jq '.data.__type.fields'
```
