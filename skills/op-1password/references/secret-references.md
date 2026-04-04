# Secret Reference URI Format

## Syntax

```
op://<vault>/<item>/[<section>/]<field>
```

All components are case-insensitive and can use names or UUIDs.

## Examples

```bash
# Basic field access
op://Private/Netflix/password
op://Work/AWS/username

# Field within a section
op://Work/Database/Connection/password
op://Work/SSH Key/Keys/private\ key

# Using UUIDs (more stable for automation)
op://abc123/xyz789/field-uuid

# Special field names (may need quoting)
op://Work/Service/"api key"
```

## Query parameters

Append to the reference URI after `?`:

| Parameter | Values | Description |
|---|---|---|
| `attribute=otp` | — | Return current TOTP code |
| `attribute=type` | — | Return field type |
| `attribute=value` | — | Return field value (same as no attribute) |
| `attribute=title` | — | Return field title/label |
| `attribute=id` | — | Return field UUID |
| `ssh-format=openssh` | — | Return SSH private key in OpenSSH PEM format |

```bash
# Get TOTP code
op read "op://Work/GitHub/one-time password?attribute=otp"

# Get SSH key for agent loading
op read "op://Work/Deploy Key/private key?ssh-format=openssh"

# Get field type metadata
op read "op://Work/API Key/key?attribute=type"
```

## Where secret references work

### op read — direct stdout/file output
```bash
op read op://vault/item/field
op read --out-file output.txt op://vault/item/field
```

### op run — environment variable values
```bash
export MY_SECRET="op://vault/item/field"
op run -- mycommand

# Or from .env file
echo "MY_SECRET=op://vault/item/field" > .env
op run --env-file=.env -- mycommand
```

### op inject — template placeholders
```bash
# Use {{ }} delimiters in templates
echo "password: {{ op://vault/item/field }}" | op inject
```

## Encoding special characters

Use URL percent-encoding or backslash-escaping for spaces and special chars:

```bash
# Space in item name
op://Work/My%20Item/password
op://Work/My\ Item/password

# Space in field name
op://Work/Server/"private key"
```

## Finding the correct reference path

```bash
# List vaults
op vault list

# List items in a vault
op item list --vault MyVault

# Inspect item structure to find section/field names
op item get "My Item" --format json | jq '.fields[] | {label, section: .section.label}'

# Get all field labels
op item get "My Item" --format json | jq '[.fields[].label]'
```
