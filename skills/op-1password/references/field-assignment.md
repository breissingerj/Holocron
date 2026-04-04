# Item Field Assignment Syntax

Used with `op item create` and `op item edit` to set field values directly from the command line.

## Syntax

```
[<section>.]<field>[[<type>]]=<value>
```

All parts except `<field>=<value>` are optional.

## Field types

| Type | Description |
|---|---|
| `text` | Plain text (default if omitted) |
| `concealed` | Hidden/secret value |
| `password` | Password field |
| `otp` | TOTP secret (otpauth:// URI) |
| `date` | Date value |
| `monthyear` | Month and year |
| `url` | URL |
| `email` | Email address |
| `phone` | Phone number |
| `file` | File attachment (value is local file path) |

## Examples

### Basic field assignment
```bash
# Simple text field
op item create --category Login --title "My Login" \
  username=myuser

# Concealed field
op item create --category Login --title "My Login" \
  username=myuser \
  password[concealed]=mysecret
```

### Fields with sections
```bash
# Section.Field syntax (dot separator)
op item create --category "API Credential" --title "AWS" \
  'API Keys.Access Key ID[text]=AKIAIOSFODNN7EXAMPLE' \
  'API Keys.Secret Access Key[concealed]=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'
```

### OTP field
```bash
# TOTP using otpauth:// URI
op item create --category Login --title "GitHub" \
  username=myuser \
  password=mypass \
  'Section.TOTP[otp]=otpauth://totp/GitHub:myuser?secret=BASE32SECRET&issuer=GitHub'
```

### File attachment
```bash
op item create --category Login --title "Server" \
  'Keys.SSH Private Key[file]=/home/user/.ssh/id_rsa'
```

### Date fields
```bash
op item create --category "Credit Card" --title "Visa" \
  'Details.Expiry Date[monthyear]=072026'
```

## Editing: special operations

```bash
# Change field type during edit
op item edit "My Item" 'fieldname[password]'   # set type, no value change

# Delete a field
op item edit "My Item" 'Section.FieldName[delete]'

# Clear a field value (empty string)
op item edit "My Item" username=

# Generate a new password
op item edit "My Item" --generate-password='32,letters,digits,symbols'
```

## Password generation

The `--generate-password` flag accepts a recipe string:

```
<length>,<character-sets...>
```

Character sets: `letters`, `digits`, `symbols`

```bash
# 20 char alphanumeric
--generate-password='20,letters,digits'

# 32 char with symbols (default)
--generate-password='32,letters,digits,symbols'

# Also works as shorthand
--generate-password   # uses 1Password defaults
```

## Using JSON templates

More complex item creation uses JSON templates:

```bash
# Fetch a blank template for a category
op item template get Login > login.json
op item template get "API Credential" > api-cred.json

# Edit the JSON, then create
op item create --template=login.json

# List all available category templates
op item template list
```

Template JSON structure (Login example):
```json
{
  "title": "My Login",
  "category": "LOGIN",
  "fields": [
    {
      "id": "username",
      "type": "STRING",
      "purpose": "USERNAME",
      "label": "username",
      "value": "user@example.com"
    },
    {
      "id": "password",
      "type": "CONCEALED",
      "purpose": "PASSWORD",
      "label": "password",
      "value": "secretpassword"
    }
  ],
  "urls": [{"href": "https://example.com"}]
}
```
