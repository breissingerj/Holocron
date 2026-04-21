# DeleteResource Workflow

Delete a Redis Cloud database or subscription. **Destructive — confirm before executing.**

## Voice Notification

```bash
curl -s -X POST http://localhost:8888/notify \
  -H "Content-Type: application/json" \
  -d '{"message": "Running DeleteResource in RedisCloud"}' \
  > /dev/null 2>&1 &
```

Running **DeleteResource** in **RedisCloud**...

## Step 1: Confirm Intent

**Always confirm with the user before proceeding.** State exactly what will be deleted:
> "You are about to permanently delete database `{name}` (ID: {id}) in subscription {subId}. This cannot be undone. Proceed?"

## Step 2: Determine Resource and Tier

Options:
- Delete a **database** (Essentials or Pro)
- Delete a **subscription** (Essentials or Pro) — only if all databases are deleted first

## Step 3: Execute

### Delete Pro Database

```bash
SUB_ID="<subscription-id>"
DB_ID="<database-id>"

REDIS_CLOUD_API_KEY=$REDIS_CLOUD_API_KEY REDIS_CLOUD_API_SECRET=$REDIS_CLOUD_API_SECRET \
curl -s -X DELETE "https://api.redislabs.com/v1/subscriptions/${SUB_ID}/databases/${DB_ID}" \
  -H "accept: application/json" \
  -H "x-api-key: $REDIS_CLOUD_API_KEY" \
  -H "x-api-secret-key: $REDIS_CLOUD_API_SECRET" | jq '.'
```

### Delete Essentials Database

```bash
SUB_ID="<subscription-id>"
DB_ID="<database-id>"

REDIS_CLOUD_API_KEY=$REDIS_CLOUD_API_KEY REDIS_CLOUD_API_SECRET=$REDIS_CLOUD_API_SECRET \
curl -s -X DELETE "https://api.redislabs.com/v1/fixed/subscriptions/${SUB_ID}/databases/${DB_ID}" \
  -H "accept: application/json" \
  -H "x-api-key: $REDIS_CLOUD_API_KEY" \
  -H "x-api-secret-key: $REDIS_CLOUD_API_SECRET" | jq '.'
```

### Delete Pro Subscription

```bash
SUB_ID="<subscription-id>"

REDIS_CLOUD_API_KEY=$REDIS_CLOUD_API_KEY REDIS_CLOUD_API_SECRET=$REDIS_CLOUD_API_SECRET \
curl -s -X DELETE "https://api.redislabs.com/v1/subscriptions/${SUB_ID}" \
  -H "accept: application/json" \
  -H "x-api-key: $REDIS_CLOUD_API_KEY" \
  -H "x-api-secret-key: $REDIS_CLOUD_API_SECRET" | jq '.'
```

### Delete Essentials Subscription

```bash
SUB_ID="<subscription-id>"

REDIS_CLOUD_API_KEY=$REDIS_CLOUD_API_KEY REDIS_CLOUD_API_SECRET=$REDIS_CLOUD_API_SECRET \
curl -s -X DELETE "https://api.redislabs.com/v1/fixed/subscriptions/${SUB_ID}" \
  -H "accept: application/json" \
  -H "x-api-key: $REDIS_CLOUD_API_KEY" \
  -H "x-api-secret-key: $REDIS_CLOUD_API_SECRET" | jq '.'
```

## Step 4: Track the Task

Capture `taskId` from the response and poll with CheckTask until `processing-completed`.

## Notes

- Tasks in `received` state cannot be cancelled — use compensating actions if needed
- Deleting a subscription requires all databases to be deleted first
