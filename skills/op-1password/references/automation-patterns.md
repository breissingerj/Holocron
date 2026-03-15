# Common op CLI Automation Patterns

## CI/CD: inject secrets into a pipeline

```bash
# .env file in repo (no real values, just references)
DB_HOST=op://prod/database/host
DB_PORT=op://prod/database/port
DB_NAME=op://prod/database/name
DB_PASS=op://prod/database/password
API_KEY=op://prod/stripe/api-key

# Run build/test with all secrets resolved
op run --env-file=.env -- ./run-tests.sh
```

## Multi-environment configs

```bash
# .env.tpl with variable interpolation
DB_PASS=op://$APP_ENV/database/password
API_KEY=op://$APP_ENV/stripe/key

# Switch environments at runtime
APP_ENV=staging op run --env-file=.env.tpl -- python manage.py migrate
APP_ENV=prod    op run --env-file=.env.tpl -- python manage.py migrate
```

## Config file templating

```yaml
# config.yml.tpl
database:
  host: {{ op://prod/database/host }}
  password: {{ op://prod/database/password }}
jwt_secret: {{ op://prod/app/jwt-secret }}
```

```bash
op inject -i config.yml.tpl -o config.yml
# config.yml now has real values, permissions 0600
```

## Cloning items between vaults

```bash
# Clone a single item
op item get "My Login" --format json | op item create --vault NewVault -

# Clone all items from one vault to another
op item list --vault source-vault --format json | \
  op item get --format json - | \
  op item create --vault dest-vault -
```

## Cloning items between accounts

```bash
op item list --vault test --format json --account personal | \
  op item get --format json --account personal - | \
  op item create --account work -
```

## Bulk delete with filter

```bash
# Delete all items tagged "temp"
op item list --tags temp --format json | \
  jq -r '.[].id' | \
  xargs -I{} op item delete {}
```

## SSH key provisioning

```bash
# Create an SSH key item
op item create \
  --category "SSH Key" \
  --title "Deploy Key" \
  --vault DevOps \
  --ssh-generate-key ed25519

# Read private key in OpenSSH format for agent or file
op read "op://DevOps/Deploy Key/private key?ssh-format=openssh" \
  --out-file ~/.ssh/deploy_key
chmod 600 ~/.ssh/deploy_key
```

## Docker authentication

```bash
docker login \
  --username $(op read op://Work/Docker/username) \
  --password-stdin <<< $(op read op://Work/Docker/password)
```

## Kubernetes secret creation

```bash
kubectl create secret generic db-creds \
  --from-literal=password="$(op read op://prod/database/password)" \
  --from-literal=host="$(op read op://prod/database/host)"
```

## AWS authentication via shell plugin

```bash
# One-time setup
op plugin init aws

# All aws commands now use 1Password biometrics
aws s3 ls
aws ec2 describe-instances
```

## Sharing items securely

```bash
# Time-limited share link (24h, one-time view)
op item share "Server Credentials" --expires-in 24h --view-once

# Share directly to email recipients
op item share "API Key" \
  --emails alice@example.com,bob@example.com \
  --expires-in 7d
```

## Checking OTP/TOTP in scripts

```bash
# Get current OTP code
CODE=$(op item get "GitHub" --otp)
# or via secret reference
CODE=$(op read "op://Work/GitHub/one-time password?attribute=otp")
```

## JSON + jq workflows

```bash
# List all item titles in a vault
op item list --vault Prod --format json | jq -r '.[].title'

# Find items by URL
op item list --format json | jq '.[] | select(.urls[]?.href | contains("github"))'

# Get all field labels for an item
op item get Netflix --format json | jq '[.fields[].label]'

# Extract all concealed field values
op item get "API Keys" --format json | \
  jq -r '.fields[] | select(.type == "CONCEALED") | "\(.label): \(.value)"'
```
