# ListSubscriptions Workflow

List Redis Cloud subscriptions — both Essentials (fixed plan) and Pro.

## Voice Notification

```bash
curl -s -X POST http://localhost:8888/notify \
  -H "Content-Type: application/json" \
  -d '{"message": "Running ListSubscriptions in RedisCloud"}' \
  > /dev/null 2>&1 &
```

Running **ListSubscriptions** in **RedisCloud**...

## Step 1: Determine Tier

Ask the user (or infer from context):
- **Essentials** — fixed/free plan (uses `/fixed/` prefix)
- **Pro** — paid plan with custom sizing

If unknown, list both.

## Step 3: Execute

### List Pro Subscriptions

```bash
REDIS_CLOUD_API_KEY=$REDIS_CLOUD_API_KEY REDIS_CLOUD_API_SECRET=$REDIS_CLOUD_API_SECRET \
curl -s -X GET "https://api.redislabs.com/v1/subscriptions" \
  -H "accept: application/json" \
  -H "x-api-key: $REDIS_CLOUD_API_KEY" \
  -H "x-api-secret-key: $REDIS_CLOUD_API_SECRET" | jq '.'
```

### List Essentials Subscriptions

```bash
REDIS_CLOUD_API_KEY=$REDIS_CLOUD_API_KEY REDIS_CLOUD_API_SECRET=$REDIS_CLOUD_API_SECRET \
curl -s -X GET "https://api.redislabs.com/v1/fixed/subscriptions" \
  -H "accept: application/json" \
  -H "x-api-key: $REDIS_CLOUD_API_KEY" \
  -H "x-api-secret-key: $REDIS_CLOUD_API_SECRET" | jq '.'
```

## Step 4: Present Results

Format as a table with: ID, Name, Status, Cloud Provider, Region.
