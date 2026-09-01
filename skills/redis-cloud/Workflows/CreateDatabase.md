# CreateDatabase Workflow

Create a new database in an existing Redis Cloud subscription.

## Voice Notification

```bash
curl -s -X POST http://localhost:8888/notify \
  -H "Content-Type: application/json" \
  -d '{"message": "Running CreateDatabase in RedisCloud"}' \
  > /dev/null 2>&1 &
```

Running **CreateDatabase** in **RedisCloud**...

## Step 1: Gather Parameters

Ask the user for:
- **Subscription ID** (required)
- **Database name** (required — alphanumeric + hyphens, unique per subscription)
- **Tier** — Essentials or Pro
- **Size in GB** (required for Pro only, e.g. `1`)

## Step 2: Execute

### Pro Database

```bash
SUB_ID="<subscription-id>"
DB_NAME="<database-name>"
SIZE_GB=1  # adjust as needed

REDIS_CLOUD_API_KEY=$REDIS_CLOUD_API_KEY REDIS_CLOUD_API_SECRET=$REDIS_CLOUD_API_SECRET \
curl -s -X POST "https://api.redislabs.com/v1/subscriptions/${SUB_ID}/databases" \
  -H "accept: application/json" \
  -H "content-type: application/json" \
  -H "x-api-key: $REDIS_CLOUD_API_KEY" \
  -H "x-api-secret-key: $REDIS_CLOUD_API_SECRET" \
  -d "{
    \"name\": \"${DB_NAME}\",
    \"datasetSizeInGb\": ${SIZE_GB}
  }" | jq '.'
```

### Essentials Database

```bash
SUB_ID="<subscription-id>"
DB_NAME="<database-name>"

REDIS_CLOUD_API_KEY=$REDIS_CLOUD_API_KEY REDIS_CLOUD_API_SECRET=$REDIS_CLOUD_API_SECRET \
curl -s -X POST "https://api.redislabs.com/v1/fixed/subscriptions/${SUB_ID}/databases" \
  -H "accept: application/json" \
  -H "content-type: application/json" \
  -H "x-api-key: $REDIS_CLOUD_API_KEY" \
  -H "x-api-secret-key: $REDIS_CLOUD_API_SECRET" \
  -d "{\"name\": \"${DB_NAME}\"}" | jq '.'
```

## Step 3: Track the Task

The response will include a `taskId`. Run CheckTask to monitor progress:

```bash
TASK_ID="<taskId-from-response>"
REDIS_CLOUD_API_KEY=$REDIS_CLOUD_API_KEY REDIS_CLOUD_API_SECRET=$REDIS_CLOUD_API_SECRET \
curl -s "https://api.redislabs.com/v1/tasks/${TASK_ID}" \
  -H "x-api-key: $REDIS_CLOUD_API_KEY" \
  -H "x-api-secret-key: $REDIS_CLOUD_API_SECRET" | jq '.status, .response.resourceId'
```

Poll until status is `processing-completed`, then wait for `active` provisioning state via GetDatabase.

## Notes

- Creating a database may temporarily set subscription state to `pending` (cluster resize)
- Database name must be unique within the subscription
- For Pro, `datasetSizeInGb` is required (minimum typically 0.1 or 1 depending on plan)
