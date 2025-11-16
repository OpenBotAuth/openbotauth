# @openbotauth/registry-cli

CLI for managing OpenBotAuth agents and keys.

## Installation

```bash
# Install globally
pnpm install -g @openbotauth/registry-cli

# Or use from workspace
cd packages/registry-cli
pnpm build
pnpm link --global
```

## Usage

### Authentication

All commands require a session token. You can provide it via:

1. Environment variable: `SESSION_TOKEN=your_token openbot list`
2. Command option: `openbot list --session your_token`

Get a session token by logging in through the web interface and copying it from your browser cookies.

### Commands

#### Create Agent

```bash
openbot create [options]

Options:
  --api-url <url>      Registry API URL (default: http://localhost:8080)
  --session <token>    Session token
```

Example:
```bash
export SESSION_TOKEN=your_session_token
openbot create
```

#### List Agents

```bash
openbot list [options]

Options:
  --api-url <url>      Registry API URL
  --session <token>    Session token
```

Example:
```bash
openbot list --session your_token
```

#### Update Agent Key

```bash
openbot update-key <agent-id> [options]

Arguments:
  agent-id             Agent ID to update

Options:
  --api-url <url>      Registry API URL
  --session <token>    Session token
```

Example:
```bash
openbot update-key abc123-def456 --session your_token
```

#### Get JWKS URL

```bash
openbot jwks <agent-id> [options]

Arguments:
  agent-id             Agent ID

Options:
  --api-url <url>      Registry API URL
  --session <token>    Session token
```

Example:
```bash
openbot jwks abc123-def456 --session your_token
```

## Environment Variables

```bash
# Registry API URL
REGISTRY_URL=http://localhost:8080

# Session token (from browser cookies after login)
SESSION_TOKEN=your_session_token_here
```

## Example Workflow

1. **Login via web interface** and get session token from browser cookies

2. **Set environment variable:**
```bash
export SESSION_TOKEN=your_token_from_cookies
export REGISTRY_URL=http://localhost:8080
```

3. **Create an agent:**
```bash
$ openbot create
🤖 OpenBot Agent Creator

? Agent name: MyWebScraper
? Agent description (optional): Scrapes product data
? Agent type: Web Scraper

✓ Key pair generated
✓ Agent created successfully!

✅ Agent Created

Agent ID: abc123-def456-ghi789
Name: MyWebScraper
Type: web_scraper
Status: active

🔑 JWKS Endpoint:
http://localhost:8080/agent-jwks/abc123-def456-ghi789

⚠️  PRIVATE KEY (Save this securely - it will not be shown again!):

-----BEGIN PRIVATE KEY-----
...
-----END PRIVATE KEY-----
```

4. **List your agents:**
```bash
$ openbot list
✓ Found 1 agent(s)

📋 Your Agents

1. MyWebScraper
   ID: abc123-def456-ghi789
   Type: web_scraper
   Status: active
   JWKS: http://localhost:8080/agent-jwks/abc123-def456-ghi789
```

5. **Update agent key:**
```bash
$ openbot update-key abc123-def456-ghi789
🔄 Update Agent Key

? Update key for agent "MyWebScraper"? Yes
✓ New key pair generated
✓ Agent key updated successfully!

🔑 JWKS Endpoint:
http://localhost:8080/agent-jwks/abc123-def456-ghi789

⚠️  NEW PRIVATE KEY (Save this securely!):

-----BEGIN PRIVATE KEY-----
...
-----END PRIVATE KEY-----
```

## Security Notes

- **Never share your private keys** - store them securely
- **Session tokens expire** after 30 days
- **Private keys are only shown once** during creation/update
- Store private keys in a secure location (password manager, secrets vault)

## Development

```bash
# Build
pnpm build

# Run in development
pnpm dev create

# Clean
pnpm clean
```

## License

MIT

