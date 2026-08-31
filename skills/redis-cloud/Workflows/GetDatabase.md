# GetDatabase Workflow

Get detailed information about a specific Redis Cloud database.

## Voice Notification

```bash
curl -s -X POST http://localhost:8888/notify \
  -H "Content-Type: application/json" \
  -d '{"message": "Running GetDatabase in RedisCloud"}' \
  > /dev/null 2>&1 &
```

Running **GetDatabase** in **RedisCloud**...

## Step 1: Get IDs

Need both:
- **Subscription ID** — run ListSubscriptions if unknown
- **Database ID** — run ListDatabases if unknown

## Step 2: Determine Tier

- **Essentials** → `/fixed/subscriptions/{subId}/databases/{dbId}`
- **Pro** → `/subscriptions/{subId}/databases/{dbId}`

## Step 3: Execute

### Pro Database

```bash
SUB_ID="<subscription-id>"
DB_ID="<database-id>"

REDIS_CLOUD_API_KEY=$REDIS_CLOUD_API_KEY REDIS_CLOUD_API_SECRET=$REDIS_CLOUD_API_SECRET \
curl -s -X GET "https://api.redislabs.com/v1/subscriptions/${SUB_ID}/databases/${DB_ID}" \
  -H "accept: application/json" \
  -H "x-api-key: $REDIS_CLOUD_API_KEY" \
  -H "x-api-secret-key: $REDIS_CLOUD_API_SECRET" | jq '.'
```

### Essentials Database

```bash
SUB_ID="<subscription-id>"
DB_ID="<database-id>"

REDIS_CLOUD_API_KEY=$REDIS_CLOUD_API_KEY REDIS_CLOUD_API_SECRET=$REDIS_CLOUD_API_SECRET \
curl -s -X GET "https://api.redislabs.com/v1/fixed/subscriptions/${SUB_ID}/databases/${DB_ID}" \
  -H "accept: application/json" \
  -H "x-api-key: $REDIS_CLOUD_API_KEY" \
  -H "x-api-secret-key: $REDIS_CLOUD_API_SECRET" | jq '.'
```

## Step 4: Present Results

Summarize key fields: name, status, endpoint (host:port), size, eviction policy, persistence, TLS status, modules enabled.
