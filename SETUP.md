# OpenBotAuth Setup Guide

## Prerequisites

- Node.js 20+
- pnpm 8+
- Docker & Docker Compose (for local development)
- GitHub account (for OAuth)

## Quick Start

### 1. Clone and Install

```bash
cd /Users/hammadtariq/go/src/github.com/hammadtq/openbotauth
pnpm install
```

### 2. Database Setup

The Neon database has already been created and migrated:

- **Project ID**: `lucky-grass-52741185`
- **Database**: `neondb`
- **Branch**: `main`

The schema includes:
- ✅ users
- ✅ profiles
- ✅ public_keys
- ✅ key_history
- ✅ agents
- ✅ agent_activity
- ✅ sessions

### 3. Environment Configuration

Copy the Neon environment file:

```bash
cp .env.neon .env
```

**Important**: Update the GitHub OAuth credentials in `.env`:

1. Go to https://github.com/settings/developers
2. Click "New OAuth App"
3. Fill in:
   - **Application name**: OpenBotAuth Local
   - **Homepage URL**: http://localhost:8080
   - **Authorization callback URL**: http://localhost:8080/auth/github/callback
4. Copy the Client ID and Client Secret to your `.env` file

### 4. Build Packages

```bash
# Build all packages
pnpm build

# Or build individually
cd packages/registry-signer && pnpm build
cd packages/github-connector && pnpm build
cd packages/registry-service && pnpm build
cd packages/registry-cli && pnpm build
```

### 5. Start Services

#### Option A: Docker Compose (Recommended)

```bash
cd infra/docker
docker-compose up
```

This starts:
- Registry Service (port 8080)
- Verifier Service (port 8081) - TODO: implement
- MCP Server (port 8082) - TODO: implement
- A2A Card (port 8083) - TODO: implement
- Redis (port 6379)

#### Option B: Manual Start

Start Redis:
```bash
docker run -d -p 6379:6379 redis:7-alpine
```

Start Registry Service:
```bash
cd packages/registry-service
pnpm dev
```

### 6. Test the Setup

#### Check Health

```bash
curl http://localhost:8080/health
# Should return: {"status":"ok","service":"registry"}
```

#### Test GitHub OAuth

1. Open browser: http://localhost:8080/auth/github
2. Login with GitHub
3. You'll be redirected to the callback
4. Check session: `curl http://localhost:8080/auth/session -H "Cookie: session=YOUR_TOKEN"`

#### Create an Agent (CLI)

```bash
# Install CLI globally
cd packages/registry-cli
pnpm build
pnpm link --global

# Set session token (get from browser cookies after login)
export SESSION_TOKEN=your_session_token_from_browser

# Create an agent
openbot create
```

#### Verify JWKS Endpoint

After creating an agent, test the JWKS endpoint:

```bash
# Replace {username} with your GitHub username
curl http://localhost:8080/jwks/{username}.json

# Or for agent-specific JWKS:
curl http://localhost:8080/agent-jwks/{agent_id}
```

## Project Structure

```
openbotauth/
├── packages/
│   ├── registry-signer/     ✅ Ed25519 & JWKS utilities
│   ├── github-connector/    ✅ OAuth & sessions
│   ├── registry-service/    ✅ API server
│   ├── registry-cli/        ✅ CLI tool
│   ├── verifier-service/    ⏳ TODO
│   ├── mcp-server/          ⏳ TODO
│   ├── bot-cli/             ⏳ TODO
│   └── a2a-card/            ⏳ TODO
├── apps/
│   └── registry-portal/     ⏳ TODO (migrate from openbotregistry)
├── plugins/
│   └── wordpress-openbotauth/ ⏳ TODO
├── infra/
│   ├── neon/               ✅ Migrations applied
│   └── docker/             ✅ Docker configs
└── docs/                   ✅ Documentation
```

## Development Workflow

### 1. Make Changes

Edit code in any package:
```bash
cd packages/registry-service/src
# Make your changes
```

### 2. Rebuild

```bash
pnpm build
# Or with watch mode:
pnpm dev
```

### 3. Test

```bash
# Run tests (when implemented)
pnpm test

# Manual testing
curl http://localhost:8080/health
```

### 4. Lint

```bash
pnpm lint
```

## Database Management

### View Tables

```bash
# Using MCP (if configured)
# Or connect directly with psql:
psql "postgresql://neondb_owner:npg_OkmnSZFsM29g@ep-old-pine-a4y5hogq-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require"

# List tables
\dt

# Describe a table
\d users
```

### Query Data

```bash
# View users
SELECT * FROM users;

# View profiles
SELECT * FROM profiles;

# View agents
SELECT * FROM agents;
```

### Clean Up Sessions

```bash
# Delete expired sessions
DELETE FROM sessions WHERE expires_at < now();
```

## Troubleshooting

### Port Already in Use

```bash
# Find process using port 8080
lsof -i :8080

# Kill it
kill -9 <PID>
```

### Database Connection Issues

- Verify `NEON_DATABASE_URL` in `.env`
- Check Neon project status in dashboard
- Ensure SSL mode is set to `require`

### GitHub OAuth Not Working

- Verify callback URL matches exactly: `http://localhost:8080/auth/github/callback`
- Check Client ID and Secret are correct
- Ensure GitHub app is not suspended

### Build Errors

```bash
# Clean and rebuild
pnpm clean
rm -rf node_modules
pnpm install
pnpm build
```

## Next Steps

1. **Implement Verifier Service** - RFC 9421 signature verification
2. **Implement WordPress Plugin** - Policy engine and 402 flow
3. **Implement MCP Server** - Policy/payments/meter tools
4. **Implement Bot CLI** - Demo crawler with signing
5. **Migrate Portal UI** - Move openbotregistry frontend
6. **Write Tests** - Unit and integration tests
7. **Deploy to Production** - Fly.io, Railway, or Kubernetes

## Useful Commands

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Clean build artifacts
pnpm clean

# Run linter
pnpm lint

# Start development servers
pnpm dev

# Link CLI globally
cd packages/registry-cli && pnpm link --global

# Unlink CLI
pnpm unlink --global openbot
```

## Environment Variables Reference

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `NEON_DATABASE_URL` | Neon Postgres connection string | - | ✅ |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` | ✅ |
| `PORT` | Registry service port | `8080` | ✅ |
| `GITHUB_CLIENT_ID` | GitHub OAuth client ID | - | ✅ |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth client secret | - | ✅ |
| `GITHUB_CALLBACK_URL` | OAuth callback URL | - | ✅ |
| `FRONTEND_URL` | Frontend URL for redirects | `http://localhost:5173` | ❌ |
| `SESSION_SECRET` | Session encryption secret | - | ✅ |
| `NODE_ENV` | Environment | `development` | ❌ |

## Security Notes

- ⚠️ Never commit `.env` file
- ⚠️ Use strong `SESSION_SECRET` in production
- ⚠️ Enable HTTPS in production
- ⚠️ Rotate GitHub OAuth secrets regularly
- ⚠️ Set secure cookie flags in production
- ⚠️ Implement rate limiting
- ⚠️ Monitor for suspicious activity

## Support

- Documentation: `/docs/`
- Issues: GitHub Issues
- Architecture: `docs/ARCHITECTURE.md`
- Implementation Status: `IMPLEMENTATION_STATUS.md`

