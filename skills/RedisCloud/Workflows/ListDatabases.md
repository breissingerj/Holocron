# ListDatabases Workflow

List databases within a Redis Cloud subscription (Essentials or Pro).

## Voice Notification

```bash
curl -s -X POST http://localhost:8888/notify \
  -H "Content-Type: application/json" \
  -d '{"message": "Running ListDatabases in RedisCloud"}' \
  > /dev/null 2>&1 &
```

Running **ListDatabases** in **RedisCloud**...

## Step 1: Get Subscription ID

Ask the user for the subscription ID, or run ListSubscriptions first to find it.

## Step 2: Determine Tier

- **Essentials** → use `/fixed/subscriptions/{id}/databases`
- **Pro** → use `/subscriptions/{id}/databases`

## Step 3: Execute

### Pro Databases

```bash
SUB_ID="<subscription-id>"

REDIS_CLOUD_API_KEY=$REDIS_CLOUD_API_KEY REDIS_CLOUD_API_SECRET=$REDIS_CLOUD_API_SECRET \
curl -s -X GET "https://api.redislabs.com/v1/subscriptions/${SUB_ID}/databases" \
  -H "accept: application/json" \
  -H "x-api-key: $REDIS_CLOUD_API_KEY" \
  -H "x-api-secret-key: $REDIS_CLOUD_API_SECRET" | jq '.'
```

### Essentials Databases

```bash
SUB_ID="<subscription-id>"

REDIS_CLOUD_API_KEY=$REDIS_CLOUD_API_KEY REDIS_CLOUD_API_SECRET=$REDIS_CLOUD_API_SECRET \
curl -s -X GET "https://api.redislabs.com/v1/fixed/subscriptions/${SUB_ID}/databases" \
  -H "accept: application/json" \
  -H "x-api-key: $REDIS_CLOUD_API_KEY" \
  -H "x-api-secret-key: $REDIS_CLOUD_API_SECRET" | jq '.'
```

## Step 4: Present Results

Format as a table with: ID, Name, Status, Size (GB), Endpoint.
