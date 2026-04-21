# Redis Cloud API Reference

## Base URL

```
https://api.redislabs.com/v1
```

## Authentication

Every request requires **two headers**:

| Header | Value | Where to Get |
|--------|-------|-------------|
| `x-api-key` | Account API key | Redis Cloud console → Access Management → API Keys |
| `x-api-secret-key` | User secret key | Same location — only shown once on creation |

### Environment Variables (Recommended)

Store credentials as env vars or in 1Password:

```bash
# Set manually
export REDIS_CLOUD_API_KEY="your-account-key"
export REDIS_CLOUD_API_SECRET="your-user-secret"

# Or retrieve from 1Password
export REDIS_CLOUD_API_KEY=$(op item get "Redis Cloud" --fields "account key")
export REDIS_CLOUD_API_SECRET=$(op item get "Redis Cloud" --fields "user secret")
```

### Example curl with Auth

```bash
curl -s -X GET "https://api.redislabs.com/v1/subscriptions" \
  -H "accept: application/json" \
  -H "x-api-key: $REDIS_CLOUD_API_KEY" \
  -H "x-api-secret-key: $REDIS_CLOUD_API_SECRET"
```

## Rate Limiting

- **400 requests per minute** per account API key
- Requests over the limit fail immediately — implement retry with backoff if needed

## Sequential Processing Constraint

- Only **one mutating operation** (POST/PUT/DELETE) processes concurrently per account
- Additional operations queue and process sequentially
- Cannot change more than **3 subscriptions simultaneously**

## Async Operation Pattern

All `POST`, `PUT`, and `DELETE` operations are **asynchronous**. `GET` operations are synchronous.

**Flow:**
1. Issue mutating request → receive `{ "taskId": "..." }`
2. Poll `GET /tasks/{taskId}` until terminal state
3. Use `resourceId` from completed task or re-fetch the resource

**Task States:**

| State | Meaning |
|-------|---------|
| `received` | Queued, awaiting processing |
| `processing-in-progress` | Worker actively processing |
| `processing-completed` | Done — check `resourceId` |
| `processing-error` | Failed — check `description` |
| `pending` | Provisioning in progress |
| `active` | Provisioned and live |
| `deleting` | De-provisioning in progress |
| `error` | Provisioning error |

## Endpoint Reference

### Subscriptions — Pro

| Method | Path | Description |
|--------|------|-------------|
| GET | `/subscriptions` | List all Pro subscriptions |
| GET | `/subscriptions/{id}` | Get subscription details |
| POST | `/subscriptions` | Create Pro subscription |
| PUT | `/subscriptions/{id}` | Update subscription |
| DELETE | `/subscriptions/{id}` | Delete subscription |

### Subscriptions — Essentials (Fixed Plan)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/fixed/subscriptions` | List all Essentials subscriptions |
| GET | `/fixed/subscriptions/{id}` | Get Essentials subscription details |
| POST | `/fixed/subscriptions` | Create Essentials subscription |
| PUT | `/fixed/subscriptions/{id}` | Update subscription |
| DELETE | `/fixed/subscriptions/{id}` | Delete subscription |

### Databases — Pro

| Method | Path | Description |
|--------|------|-------------|
| GET | `/subscriptions/{subId}/databases` | List databases |
| GET | `/subscriptions/{subId}/databases/{dbId}` | Get database details |
| POST | `/subscriptions/{subId}/databases` | Create database |
| PUT | `/subscriptions/{subId}/databases/{dbId}` | Update database |
| DELETE | `/subscriptions/{subId}/databases/{dbId}` | Delete database |

### Databases — Essentials (Fixed Plan)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/fixed/subscriptions/{subId}/databases` | List databases |
| GET | `/fixed/subscriptions/{subId}/databases/{dbId}` | Get database details |
| POST | `/fixed/subscriptions/{subId}/databases` | Create database |
| PUT | `/fixed/subscriptions/{subId}/databases/{dbId}` | Update database |
| DELETE | `/fixed/subscriptions/{subId}/databases/{dbId}` | Delete database |

### Tasks

| Method | Path | Description |
|--------|------|-------------|
| GET | `/tasks` | List active/recent tasks |
| GET | `/tasks/{taskId}` | Get task status |

### Plans & Payment

| Method | Path | Description |
|--------|------|-------------|
| GET | `/fixed/plans` | List available Essentials plans |
| GET | `/payment-methods` | List available payment methods |

### Account

| Method | Path | Description |
|--------|------|-------------|
| GET | `/logs` | Get account audit logs |

## Database Name Rules

- Alphanumeric characters and hyphens only
- Must be unique within a subscription

## Key Notes

- **User keys are shown only once** — save immediately on creation
- CIDR allow lists are optional but recommended for security
- User must have role: Owner, Viewer, or Logs Viewer
- Pro subscriptions require at least one database defined at creation time
