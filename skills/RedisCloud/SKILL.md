---
name: RedisCloud
description: Manage Redis Cloud databases and subscriptions via REST API — list, create, update, delete resources and track async tasks. USE WHEN redis cloud, redis database, redis subscription, list redis databases, create redis database, delete redis database, redis cloud api, check redis task, redis cloud management.
---

# RedisCloud

Manage Redis Cloud resources via the official REST API (`https://api.redislabs.com/v1`). Covers both **Essentials** (fixed plan, `/fixed/` prefix) and **Pro** (standard prefix) tiers.

## Authentication (MANDATORY FIRST STEP)

**Before running any command**, check that both credentials are set:

```bash
bash -c 'echo "API Key: ${REDIS_CLOUD_API_KEY:-MISSING}" && echo "API Secret: ${REDIS_CLOUD_API_SECRET:-MISSING}"'
```

**If either output is `MISSING`**, load from 1Password by asking the user to run:

> I need Redis Cloud API credentials to proceed. Please run the following in the prompt (the `!` prefix executes it in this session):
>
> ```
> ! export REDIS_CLOUD_API_KEY=$(op read "op://Employee/Redis Cloud/redis_api_key")
> ! export REDIS_CLOUD_API_SECRET=$(op read "op://Employee/Redis Cloud/redis_secret_key")
> ```
>
> You can find or create API keys in the Redis Cloud console: **Access Management → API Keys**.

**Once set**, pass both inline to every curl command to ensure they're picked up by the Bash tool:

```bash
REDIS_CLOUD_API_KEY=$REDIS_CLOUD_API_KEY REDIS_CLOUD_API_SECRET=$REDIS_CLOUD_API_SECRET curl ...
```

---

## Voice Notification

**When executing a workflow, do BOTH:**

1. **Send voice notification**:
   ```bash
   curl -s -X POST http://localhost:8888/notify \
     -H "Content-Type: application/json" \
     -d '{"message": "Running WORKFLOWNAME in RedisCloud"}' \
     > /dev/null 2>&1 &
   ```

2. **Output text notification**:
   ```
   Running **WorkflowName** in **RedisCloud**...
   ```

## Workflow Routing

| Workflow | Trigger | File |
|----------|---------|------|
| **ListSubscriptions** | "list subscriptions", "show subscriptions", "my subscriptions" | `Workflows/ListSubscriptions.md` |
| **ListDatabases** | "list databases", "show databases", "my databases" | `Workflows/ListDatabases.md` |
| **GetDatabase** | "get database", "show database details", "inspect database" | `Workflows/GetDatabase.md` |
| **CreateDatabase** | "create database", "new database", "add database" | `Workflows/CreateDatabase.md` |
| **DeleteResource** | "delete database", "delete subscription", "remove database" | `Workflows/DeleteResource.md` |
| **CheckTask** | "check task", "task status", "poll task", "is task done" | `Workflows/CheckTask.md` |

**Full API Reference:** `ApiReference.md`

## Examples

**Example 1: List all databases in a subscription**
```
User: "list my redis databases in subscription 12345"
→ Invokes ListDatabases workflow
→ Determines tier (Essentials or Pro)
→ Runs GET /fixed/subscriptions/12345/databases or GET /subscriptions/12345/databases
→ Returns formatted table of databases with names, IDs, and status
```

**Example 2: Create a new Pro database**
```
User: "create a redis database called cache-prod in subscription 12345"
→ Invokes CreateDatabase workflow
→ Prompts for datasetSizeInGb if not specified
→ POSTs to /subscriptions/12345/databases
→ Returns taskId — then invokes CheckTask to poll until active
```

**Example 3: Check if a task completed**
```
User: "check task abc-123-def"
→ Invokes CheckTask workflow
→ GETs /tasks/abc-123-def
→ Reports current state (received/processing/completed/error)
```
