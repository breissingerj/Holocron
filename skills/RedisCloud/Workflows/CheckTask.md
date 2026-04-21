# CheckTask Workflow

Poll the status of an async Redis Cloud API task.

## Voice Notification

```bash
curl -s -X POST http://localhost:8888/notify \
  -H "Content-Type: application/json" \
  -d '{"message": "Running CheckTask in RedisCloud"}' \
  > /dev/null 2>&1 &
```

Running **CheckTask** in **RedisCloud**...

## Background: Async Pattern

All mutating operations (POST/PUT/DELETE) are asynchronous and return a `taskId`. You must poll the task endpoint to know when the operation completes.

## Task States

| State | Phase | Meaning |
|-------|-------|---------|
| `received` | Processing | Queued, awaiting a worker |
| `processing-in-progress` | Processing | Worker actively handling the request |
| `processing-completed` | Processing | API layer done — check `resourceId` |
| `processing-error` | Processing | API layer failed — check `description` |
| `pending` | Provisioning | Cloud infrastructure being provisioned |
| `active` | Provisioning | Resource live and ready |
| `deleting` | Provisioning | Resource being de-provisioned |
| `error` | Provisioning | Provisioning error — check `description` |

## Step 1: Get Task Status (Single Check)

```bash
TASK_ID="<your-task-id>"

REDIS_CLOUD_API_KEY=$REDIS_CLOUD_API_KEY REDIS_CLOUD_API_SECRET=$REDIS_CLOUD_API_SECRET \
curl -s -X GET "https://api.redislabs.com/v1/tasks/${TASK_ID}" \
  -H "accept: application/json" \
  -H "x-api-key: $REDIS_CLOUD_API_KEY" \
  -H "x-api-secret-key: $REDIS_CLOUD_API_SECRET" | jq '{status: .status, resourceId: .response.resourceId, error: .response.error}'
```

## Step 2: Poll Until Complete (Bash Loop)

```bash
TASK_ID="<your-task-id>"
MAX_POLLS=30
INTERVAL=10  # seconds

for i in $(seq 1 $MAX_POLLS); do
  RESULT=$(REDIS_CLOUD_API_KEY=$REDIS_CLOUD_API_KEY REDIS_CLOUD_API_SECRET=$REDIS_CLOUD_API_SECRET \
    curl -s "https://api.redislabs.com/v1/tasks/${TASK_ID}" \
    -H "x-api-key: $REDIS_CLOUD_API_KEY" \
    -H "x-api-secret-key: $REDIS_CLOUD_API_SECRET")
  STATUS=$(echo "$RESULT" | jq -r '.status')
  echo "[$i/$MAX_POLLS] Status: $STATUS"
  
  if [[ "$STATUS" == "processing-completed" || "$STATUS" == "active" ]]; then
    echo "Done! Resource ID: $(echo "$RESULT" | jq -r '.response.resourceId')"
    break
  elif [[ "$STATUS" == "processing-error" || "$STATUS" == "error" ]]; then
    echo "Error: $(echo "$RESULT" | jq -r '.response.error.description // .description')"
    break
  fi
  sleep $INTERVAL
done
```

## Step 3: List All Recent Tasks

```bash
REDIS_CLOUD_API_KEY=$REDIS_CLOUD_API_KEY REDIS_CLOUD_API_SECRET=$REDIS_CLOUD_API_SECRET \
curl -s "https://api.redislabs.com/v1/tasks" \
  -H "x-api-key: $REDIS_CLOUD_API_KEY" \
  -H "x-api-secret-key: $REDIS_CLOUD_API_SECRET" | jq '.tasks[] | {id: .taskId, status: .status, type: .commandType}'
```

## Notes

- `processing-completed` means the API accepted the request — provisioning may still be `pending`
- The `resourceId` in a completed task is the ID of the created/modified resource
- Tasks cannot be cancelled once in `received` state
