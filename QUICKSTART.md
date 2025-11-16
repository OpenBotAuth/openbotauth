# OpenBotAuth Quick Start Guide

## What You Have Now ✅

1. ✅ Complete monorepo structure
2. ✅ Neon database created and migrated
3. ✅ `.env` file with Neon connection string
4. ✅ All registry packages built and ready
5. ✅ Docker configuration ready

## What You Need to Do

### Step 1: Register GitHub OAuth App (5 minutes)

1. Go to: https://github.com/settings/developers
2. Click **"New OAuth App"**
3. Fill in:
   - **Application name**: `OpenBotAuth Local Dev`
   - **Homepage URL**: `http://localhost:8080`
   - **Authorization callback URL**: `http://localhost:8080/auth/github/callback`
4. Click **"Register application"**
5. Copy the **Client ID**
6. Click **"Generate a new client secret"** and copy it

### Step 2: Update .env File

Open `/Users/hammadtariq/go/src/github.com/hammadtq/openbotauth/.env` and replace:

```bash
GITHUB_CLIENT_ID=your_client_id_here        # ← Paste your Client ID
GITHUB_CLIENT_SECRET=your_client_secret_here # ← Paste your Client Secret
```

### Step 3: Install Dependencies

```bash
cd /Users/hammadtariq/go/src/github.com/hammadtq/openbotauth
pnpm install
```

### Step 4: Build All Packages

```bash
pnpm build
```

This builds:
- `registry-signer` - Crypto utilities
- `github-connector` - OAuth & sessions
- `registry-service` - API server
- `registry-cli` - CLI tool

### Step 5: Start Redis (Required)

```bash
# Option A: Docker
docker run -d -p 6379:6379 redis:7-alpine

# Option B: If you have Redis installed
redis-server
```

### Step 6: Start Registry Service

```bash
cd packages/registry-service
pnpm dev
```

You should see:
```
Registry service listening on port 8080
```

### Step 7: Test It Works

Open a new terminal and test:

```bash
# Health check
curl http://localhost:8080/health
# Should return: {"status":"ok","service":"registry"}

# Try GitHub OAuth (opens browser)
open http://localhost:8080/auth/github
```

## What You Can Do Now

### 1. Login via GitHub

1. Open: http://localhost:8080/auth/github
2. Authorize the app
3. You'll be redirected back with a session

### 2. Use the CLI

```bash
# Install CLI globally
cd packages/registry-cli
pnpm link --global

# Set your session token (get from browser cookies)
export SESSION_TOKEN=your_session_token

# Create an agent
openbot create

# List agents
openbot list
```

### 3. Test JWKS Endpoints

After creating an agent:

```bash
# User JWKS (replace 'username' with your GitHub username)
curl http://localhost:8080/jwks/username.json

# Agent JWKS (replace with your agent ID)
curl http://localhost:8080/agent-jwks/YOUR_AGENT_ID
```

## Project Structure

```
openbotauth/
├── .env                        ← Your config (with Neon + GitHub credentials)
├── packages/
│   ├── registry-signer/       ✅ Built
│   ├── github-connector/      ✅ Built
│   ├── registry-service/      ✅ Built (running on :8080)
│   └── registry-cli/          ✅ Built
├── infra/
│   └── neon/                  ✅ Migrated
└── docs/                      ✅ Complete
```

## Neon Database

Your database is live at:
- **Project**: openbotauth
- **Project ID**: lucky-grass-52741185
- **Connection**: Already configured in `.env`

View in dashboard: https://console.neon.tech/app/projects/lucky-grass-52741185

## Common Commands

```bash
# Start development
cd packages/registry-service && pnpm dev

# Build all packages
pnpm build

# Clean and rebuild
pnpm clean && pnpm build

# Install CLI globally
cd packages/registry-cli && pnpm link --global

# Create agent
openbot create --session YOUR_TOKEN

# List agents
openbot list --session YOUR_TOKEN
```

## Troubleshooting

### "Cannot connect to database"

Check your Neon connection string in `.env`:
```bash
NEON_DATABASE_URL=postgresql://neondb_owner:...
```

### "GitHub OAuth error"

1. Verify Client ID and Secret in `.env`
2. Check callback URL is exactly: `http://localhost:8080/auth/github/callback`
3. See `GITHUB_OAUTH_SETUP.md` for detailed steps

### "Port 8080 already in use"

```bash
# Find process
lsof -i :8080

# Kill it
kill -9 <PID>
```

### "Redis connection failed"

Make sure Redis is running:
```bash
docker run -d -p 6379:6379 redis:7-alpine
```

## Next Steps

1. ✅ Setup complete
2. ⏳ Create your first agent
3. ⏳ Test JWKS endpoints
4. ⏳ Implement verifier service (RFC 9421)
5. ⏳ Implement WordPress plugin (policy engine)
6. ⏳ Build bot CLI (demo crawler)

## Documentation

- **Setup Guide**: `SETUP.md`
- **GitHub OAuth**: `GITHUB_OAUTH_SETUP.md`
- **Architecture**: `docs/ARCHITECTURE.md`
- **Neon Migration**: `NEON_MIGRATION_COMPLETE.md`
- **Implementation Status**: `IMPLEMENTATION_STATUS.md`

## Getting Help

- Check documentation in `/docs`
- Review implementation status in `IMPLEMENTATION_STATUS.md`
- See design document: `design_document.md`

## What's Working

- ✅ Neon database (7 tables, all indexes)
- ✅ GitHub OAuth flow
- ✅ Session management
- ✅ Agent creation
- ✅ JWKS endpoints
- ✅ Activity logging
- ✅ CLI tool

## What's Next (TODO)

- ⏳ Verifier service (RFC 9421 signature verification)
- ⏳ WordPress plugin (policy engine + 402 flow)
- ⏳ MCP server (policy/payments/meter tools)
- ⏳ Bot CLI (demo crawler with signing)
- ⏳ A2A card (agent discovery)
- ⏳ Portal UI (migrate from openbotregistry)

---

**You're ready to start developing!** 🚀

Follow the steps above to get the registry service running, then you can create agents and test the JWKS endpoints.

