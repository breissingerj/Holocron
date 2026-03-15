---
name: op-1password
description: Manage 1Password secrets, items, vaults, and credentials using the op CLI. Use when the user needs to read secrets, inject credentials into processes/configs, manage vault items, handle service accounts, or automate secret workflows with the 1Password CLI.
allowed-tools: Bash(op:*)
---

# 1Password CLI (op)

## Command structure

```
op [noun] [subcommand] [flags] [arguments]
```

Nouns: `item`, `vault`, `document`, `user`, `group`, `account`, `service-account`, `plugin`, `read`, `run`, `inject`, `whoami`

## Authentication

```bash
# Sign in via desktop app (biometric/Touch ID)
op signin

# Sign in and capture session token (no app integration)
eval $(op signin --raw)

# Sign in to a specific account
op signin --account my.1password.com

# Check current auth state
op whoami

# Sign out
op signout

# Add account for first-time setup
op account add

# List configured accounts
op account list

# Forget an account from this device
op account forget <account>
```

**Key environment variables:**
| Variable | Purpose |
|---|---|
| `OP_ACCOUNT` | Default account shorthand/address |
| `OP_SESSION` | Session token for manual sign-in |
| `OP_SERVICE_ACCOUNT_TOKEN` | Authenticate as a service account |
| `OP_BIOMETRIC_UNLOCK_ENABLED` | Toggle desktop app integration |
| `OP_FORMAT` | Default output format (`json` or `human-readable`) |
| `OP_CONNECT_HOST` / `OP_CONNECT_TOKEN` | Connect server credentials |
| `OP_RUN_NO_MASKING` | Disable secret masking in `op run` |
| `OP_INCLUDE_ARCHIVE` | Include archived items in listings |

## Secret references

Secret references use a URI format:
```
op://<vault>/<item>/[<section>/]<field>
```

Query parameters:
- `?attribute=otp` — get TOTP code
- `?attribute=type|value|title|id` — get field metadata
- `?ssh-format=openssh` — get SSH key in OpenSSH format

## Reading secrets

```bash
# Print a field to stdout
op read op://Private/Netflix/password

# Get an OTP code
op read "op://Work/AWS/one-time password?attribute=otp"

# Save to file (default permissions: 0600)
op read --out-file ./key.pem op://Work/Server/ssh/private\ key

# Suppress trailing newline (useful for piping)
op read -n op://Private/API/token

# Use in commands
docker login \
  -u $(op read op://Work/Docker/username) \
  -p $(op read op://Work/Docker/password)
```

## Injecting secrets into processes

`op run` resolves environment variable values that are secret references:

```bash
# Export references as env vars, then run
export DB_PASSWORD="op://prod/database/password"
op run -- node server.js

# Use an .env file with secret references
cat .env
# DB_HOST=op://prod/database/host
# DB_PASS=op://prod/database/password
op run --env-file=.env -- node server.js

# Variable interpolation for multi-environment configs
# .env contains: DB_PASS=op://$ENV/database/password
ENV=prod op run --env-file=.env -- python app.py

# Flags:
#   --env-file    Load references from dotenv file
#   --no-masking  Show secrets in stdout/stderr
```

## Injecting secrets into config files

`op inject` resolves `{{ op://... }}` placeholders in templates:

```bash
# Inject from stdin to stdout
echo "password: {{ op://prod/db/password }}" | op inject

# File in, file out
op inject -i config.yml.tpl -o config.yml

# Multiple references in one template
cat nginx.conf.tpl | op inject -o nginx.conf

# Flags:
#   --in-file / -i    Input template
#   --out-file / -o   Output file
#   --force / -f      Skip confirmation
#   --file-mode       Output file permissions (default 0600)
```

## Item management

```bash
# List items
op item list
op item list --vault Private
op item list --categories Login,Password
op item list --tags mytag
op item list --favorite
op item list --include-archive
op item list --long                    # show URLs, vaults, etc.

# Get item
op item get Netflix
op item get Netflix --vault Personal
op item get Netflix --fields label=username,label=password
op item get Netflix --fields type=concealed   # all secret fields
op item get Netflix --otp                     # current OTP
op item get Netflix --share-link
op item get Netflix --format json
# Pipe from list
op item list --tags deploy --format json | op item get -

# Create item
op item create \
  --category Login \
  --title "New Login" \
  --vault Personal \
  --url https://example.com \
  --generate-password='letters,digits,20' \
  username[username]=user@example.com

# Assignment syntax for fields:
# [<section>.]<field>[[<type>]]=<value>
# Types: text, concealed, password, otp, date, url, email, phone, file
op item create --category "API Credential" --title "AWS Key" \
  'API Keys.Access Key ID[text]=AKIA...' \
  'API Keys.Secret Access Key[concealed]=secret...'

# Create from JSON template
op item template get Login > login.json
# edit login.json
op item create --template=login.json

# Edit item
op item edit "Netflix" --title "Netflix (Personal)"
op item edit "Netflix" password[password]=newpass
op item edit "Netflix" --generate-password='32,letters,digits,symbols'
op item edit "Netflix" 'Section.OldField[delete]'
op item edit "Netflix" username=            # clear a field
cat updated.json | op item edit "Netflix"   # pipe JSON template

# Delete / archive item
op item delete "Old Login"
op item delete "Old Login" --archive        # move to Archive
op item delete --vault Test "Old Login"

# Move item between vaults
op item move "My Item" --current-vault Private --destination-vault Shared

# Share item
op item share "API Key" --expires-in 24h
op item share "API Key" --emails alice@example.com --view-once
```

**Item categories:** Login, Password, API Credential, Bank Account, Credit Card, Database, Document, Driver License, Email Account, Identity, Membership, Passport, Reward Program, Secure Note, Server, SSH Key, Software License, Wireless Router, Crypto Wallet, Medical Record

## Vault management

```bash
op vault list
op vault list --user user@example.com
op vault list --group DevTeam
op vault get MyVault
op vault create "New Vault" --icon coffee --description "Dev secrets"
op vault edit MyVault --name "Renamed Vault"
op vault delete MyVault

# User access
op vault user list MyVault
op vault user grant --vault MyVault --user user@example.com --permissions read_items,write_items
op vault user revoke --vault MyVault --user user@example.com

# Group access
op vault group list MyVault
op vault group grant --vault MyVault --group DevTeam --permissions read_items
op vault group revoke --vault MyVault --group DevTeam
```

## Service accounts

```bash
# Create — token is shown ONCE, save it immediately
op service-account create my-sa --vault Dev:read_items --vault Prod:read_items,write_items

# With expiry
op service-account create my-sa --expires-in 30d --vault Shared:read_items

# Get raw token only (for piping/storing)
op service-account create my-sa --vault Prod:read_items --raw

# Use service account
export OP_SERVICE_ACCOUNT_TOKEN="<token>"
op item list --vault Prod

# Check rate limits
op service-account ratelimit
```

Vault permissions: `read_items`, `write_items` (requires read), `share_items` (requires read), `create_vault`

## Shell plugins (third-party CLI auth)

Shell plugins let CLIs like `aws`, `gh`, `doctl` authenticate via 1Password instead of plaintext credentials.

```bash
# List available plugins
op plugin list

# Initialize a plugin
op plugin init aws
op plugin init gh

# Run a single command with credentials from 1Password
op plugin run -- aws s3 ls

# After sourcing plugins.sh, commands use 1Password automatically
source ~/.op/plugins.sh
aws s3 ls    # biometric prompt instead of env vars

# Manage plugin credentials
op plugin credential list
op plugin credential add

# Clear all plugin configuration
op plugin clear
```

Enable permanently by adding to shell config:
```bash
echo "source ~/.op/plugins.sh" >> ~/.zshrc
```

## Document management

```bash
op document create report.pdf --title "Q4 Report" --vault Shared
op document get "Q4 Report" --out-file report.pdf
op document edit "Q4 Report" updated.pdf
op document delete "Q4 Report"
op document list
op document list --vault Shared
```

## User and group management

```bash
# Users
op user list
op user get user@example.com
op user provision --name "Jane Doe" --email jane@example.com
op user confirm user@example.com
op user edit user@example.com --name "Jane Smith"
op user suspend user@example.com
op user reactivate user@example.com
op user delete user@example.com

# Groups
op group list
op group get DevTeam
op group create "DevTeam" --description "Developers"
op group edit DevTeam --name "Dev Team"
op group delete DevTeam
op group user list DevTeam
op group user grant --group DevTeam --user user@example.com
op group user revoke --group DevTeam --user user@example.com
```

## Output and filtering

```bash
# JSON output (parseable with jq)
op item list --vault Prod --format json

# Get specific fields as JSON
op item get Netflix --fields label=username,label=password --format json

# Use jq to extract titles
op item list --vault Prod --format json | jq '.[].title'

# Get all concealed field values from an item
op item get "API Key" --fields type=concealed --format json | jq '.[].value'
```

## Global flags

| Flag | Description |
|---|---|
| `--account` | Select account by shorthand, address, or ID |
| `--vault` | Target vault |
| `--format` | `human-readable` or `json` |
| `--cache` | Enable/disable caching (default: true) |
| `--debug` | Enable debug mode |
| `--session` | Authenticate with session token |
| `--no-color` | Disable colored output |
| `--iso-timestamps` | RFC 3339 timestamp format |

## Reference docs

- [Common automation patterns](references/automation-patterns.md)
- [Secret reference format](references/secret-references.md)
- [Item field assignment syntax](references/field-assignment.md)
