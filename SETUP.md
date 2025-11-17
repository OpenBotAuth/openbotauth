# OpenBotAuth Setup Guide

Complete setup instructions for running OpenBotAuth locally or in production.

---

## Prerequisites

- **Node.js** 20+ ([download](https://nodejs.org/))
- **pnpm** 8+ (`npm install -g pnpm`)
- **Redis** 7+ (for caching)
- **Neon Postgres** account ([neon.tech](https://neon.tech)) or local Postgres
- **GitHub** account (for OAuth)

---

## Quick Start (5 minutes)

### 1. Clone and Install

```bash
git clone https://github.com/OpenBotAuth/openbotauth.git
cd openbotauth
pnpm install
```

### 2. Database Setup

#### Option A: Use Neon (Recommended)

1. Create account at [neon.tech](https://neon.tech)
2. Create a new project
3. Copy the connection string

#### Option B: Local Postgres

```bash
# Start Postgres with Docker
docker run -d \
  --name openbotauth-postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=openbotauth \
  -p 5432:5432 \
  postgres:16-alpine
```

### 3. Apply Database Migrations

```bash
# Set your database URL
export DATABASE_URL="postgresql://user:password@host:5432/dbname?sslmode=require"

# Apply migrations
psql $DATABASE_URL < infra/neon/001_initial_schema.sql
```

The schema includes:
- ✅ `users` — User accounts
- ✅ `profiles` — User profiles (GitHub data)
- ✅ `public_keys` — User public keys
- ✅ `key_history` — Key rotation history
- ✅ `agents` — Agent registrations
- ✅ `agent_activity` — Activity logs
- ✅ `sessions` — Session management

### 4. GitHub OAuth Setup

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Click **"New OAuth App"**
3. Fill in:
   - **Application name:** `OpenBotAuth Local`
   - **Homepage URL:** `http://localhost:8080`
   - **Authorization callback URL:** `http://localhost:8080/auth/github/callback`
4. Click **"Register application"**
5. Copy **Client ID** and **Client Secret**

### 5. Environment Configuration

```bash
# Copy example environment file
cp .env.example .env
```

Edit `.env` with your credentials:

```bash
# Database
DATABASE_URL=postgresql://user:password@host:5432/dbname?sslmode=require

# Redis
REDIS_URL=redis://localhost:6379

# GitHub OAuth
GITHUB_CLIENT_ID=your_client_id_here
GITHUB_CLIENT_SECRET=your_client_secret_here
GITHUB_CALLBACK_URL=http://localhost:8080/auth/github/callback

# Session
SESSION_SECRET=your_random_secret_here_min_32_chars

# URLs
FRONTEND_URL=http://localhost:5173
MCP_BASE_URL=http://localhost:8082
A2A_BASE_URL=http://localhost:8080

# A2A Configuration (optional)
ENABLE_A2A=false
AGENTCARD_JWKS_URL=http://localhost:8080/jwks/openbotauth.json
AGENTCARD_CONTACT=security@yourdomain.com

# Verifier Service
OB_TRUSTED_DIRECTORIES=http://localhost:8080
OB_MAX_SKEW_SEC=300
OB_NONCE_TTL_SEC=300
```

### 6. Start Redis

```bash
# Option A: Docker (recommended)
docker run -d --name openbotauth-redis -p 6379:6379 redis:7-alpine

# Option B: Local installation
redis-server
```

### 7. Build Packages

```bash
# Build all packages
pnpm build

# This builds:
# - registry-signer
# - github-connector
# - registry-service
# - registry-cli
# - verifier-service
# - bot-cli
# - mcp-server
# - a2a-card
# - registry-portal
```

### 8. Start Services

#### Option A: All Services (separate terminals)

```bash
# Terminal 1: Registry Service
cd packages/registry-service
pnpm dev
# → http://localhost:8080

# Terminal 2: Verifier Service
cd packages/verifier-service
pnpm dev
# → http://localhost:8081

# Terminal 3: Portal UI
cd apps/registry-portal
pnpm dev
# → http://localhost:5173

# Terminal 4: MCP Server (optional)
cd packages/mcp-server
pnpm dev
# → http://localhost:8082
```

#### Option B: Just Registry + Portal (minimal)

```bash
# Terminal 1: Registry Service
pnpm dev:service

# Terminal 2: Portal UI
pnpm dev:portal
```

### 9. Test the Setup

#### Health Check

```bash
curl http://localhost:8080/health
# Expected: {"status":"ok","service":"registry"}
```

#### GitHub OAuth Flow

1. Open browser: http://localhost:5173
2. Click "Sign in with GitHub"
3. Authorize the app
4. You should be redirected back to the portal

#### Generate Keys

1. In the portal, click "Setup" or "Generate Keys"
2. Click "Generate New Keypair"
3. **Save your private key** (you'll need it for the bot CLI)
4. Click "Register My Key"

#### Verify JWKS

```bash
# Replace {username} with your GitHub username
curl http://localhost:8080/jwks/{username}.json

# Expected: JWKS with your public key
{
  "keys": [
    {
      "kty": "OKP",
      "crv": "Ed25519",
      "kid": "...",
      "x": "...",
      "use": "sig"
    }
  ]
}
```

---

## Project Structure

```
openbotauth/
├── packages/
│   ├── registry-signer/        ✅ Ed25519 & JWKS utilities
│   ├── github-connector/       ✅ OAuth & sessions
│   ├── registry-service/       ✅ API server (port 8080)
│   ├── registry-cli/           ✅ CLI tool
│   ├── verifier-service/       ✅ RFC 9421 verification (port 8081)
│   ├── bot-cli/                ✅ Demo crawler
│   ├── mcp-server/             ✅ MCP tools (port 8082)
│   └── a2a-card/               ✅ A2A discovery
├── apps/
│   ├── registry-portal/        ✅ Vite UI (port 5173)
│   └── test-server/            ✅ Test server (port 3000)
├── plugins/
│   └── wordpress-openbotauth/  ✅ WordPress plugin
├── infra/
│   ├── neon/                   ✅ SQL migrations
│   └── docker/                 🚧 Docker configs
└── docs/                       ✅ Documentation
```

---

## Development Workflow

### Making Changes

```bash
# 1. Edit code in any package
cd packages/registry-service/src
# Make your changes...

# 2. Rebuild (with watch mode)
pnpm dev

# 3. Test manually
curl http://localhost:8080/health

# 4. Run linter
pnpm lint
```

### Working with the CLI

```bash
# Link CLI globally
cd packages/registry-cli
pnpm build
pnpm link --global

# Now you can use it anywhere
openbot --help
openbot create
openbot list

# Unlink when done
pnpm unlink --global openbot
```

### Working with Bot CLI

```bash
# Generate keypair
cd packages/bot-cli
pnpm dev keygen

# Or configure manually with your portal keys
mkdir -p ~/.openbotauth
cat > ~/.openbotauth/bot-config.json << 'EOF'
{
  "jwks_url": "http://localhost:8080/jwks/yourusername.json",
  "kid": "your-key-id",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----",
  "public_key": "your-public-key"
}
EOF

# Test signed request
pnpm dev fetch http://localhost:3000/protected -v
```

---

## Testing the Complete Flow

### 1. Start All Services

```bash
# Terminal 1: Registry
cd packages/registry-service && pnpm dev

# Terminal 2: Verifier
cd packages/verifier-service && pnpm dev

# Terminal 3: Test Server
cd apps/test-server && pnpm dev

# Terminal 4: Portal (optional, for key management)
cd apps/registry-portal && pnpm dev
```

### 2. Register Your Keys

Via portal (http://localhost:5173):
1. Login with GitHub
2. Generate keypair
3. **Save private key**
4. Register public key

### 3. Configure Bot CLI

```bash
# Use the helper script
node setup-bot-from-db.js
# Paste your private key when prompted

# Or manually create ~/.openbotauth/bot-config.json
```

### 4. Test Signed Request

```bash
cd packages/bot-cli
pnpm dev fetch http://localhost:3000/protected -v

# Expected output:
# ✓ Signature verified
# ✓ Access granted
# Response: {"message": "Protected content"}
```

---

## Database Management

### Connect to Database

```bash
# Using psql
psql $DATABASE_URL

# List tables
\dt

# Describe table
\d users

# Query data
SELECT * FROM users;
SELECT * FROM profiles;
SELECT * FROM public_keys;
```

### Common Queries

```sql
-- View all users
SELECT u.id, u.github_id, p.username, p.email
FROM users u
JOIN profiles p ON u.id = p.user_id;

-- View public keys
SELECT pk.user_id, pk.public_key, pk.created_at
FROM public_keys pk;

-- View key history
SELECT kh.user_id, kh.public_key, kh.is_active, kh.created_at
FROM key_history kh
ORDER BY kh.created_at DESC;

-- Clean expired sessions
DELETE FROM sessions WHERE expires_at < now();
```

---

## WordPress Plugin Setup

### Installation

```bash
# Copy plugin to WordPress
cp -r plugins/wordpress-openbotauth /path/to/wordpress/wp-content/plugins/

# Or create symlink for development
ln -s $(pwd)/plugins/wordpress-openbotauth /path/to/wordpress/wp-content/plugins/
```

### Configuration

1. Activate plugin in WordPress Admin → Plugins
2. Go to Settings → OpenBotAuth
3. Configure:
   - **Verifier Service URL:** `http://localhost:8081`
   - **Default Policy:** Choose from examples or create custom
4. Save settings

### Test Policy

1. Create a new post
2. In the OpenBotAuth meta box, select a policy (e.g., "Teaser")
3. Publish the post
4. Test with bot CLI:
   ```bash
   oba-bot fetch http://your-wordpress-site.com/your-post/
   ```

See [plugins/wordpress-openbotauth/README.md](plugins/wordpress-openbotauth/README.md) for detailed documentation.

---

## MCP Server Setup (Claude Desktop)

### 1. Build MCP Server

```bash
cd packages/mcp-server
pnpm install && pnpm build
```

### 2. Apply Database Migrations

```bash
psql $DATABASE_URL < migrations/001_mcp_tables.sql
```

### 3. Configure Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "openbotauth": {
      "command": "node",
      "args": [
        "/path/to/openbotauth/packages/mcp-server/dist/index.js"
      ],
      "env": {
        "DATABASE_URL": "postgresql://...",
        "REDIS_URL": "redis://localhost:6379"
      }
    }
  }
}
```

### 4. Restart Claude Desktop

### 5. Test in Claude

Ask Claude:
```
Can you check if I have access to https://example.com/article?
```

See [packages/mcp-server/README.md](packages/mcp-server/README.md) for detailed documentation.

---

## Troubleshooting

### Port Already in Use

```bash
# Find process using port
lsof -i :8080

# Kill process
kill -9 <PID>

# Or use the helper script
./kill-services.sh
```

### Database Connection Issues

- ✅ Verify `DATABASE_URL` in `.env`
- ✅ Check Neon project status
- ✅ Ensure `sslmode=require` for Neon
- ✅ Test connection: `psql $DATABASE_URL -c "SELECT 1"`

### GitHub OAuth Not Working

- ✅ Verify callback URL: `http://localhost:8080/auth/github/callback`
- ✅ Check Client ID and Secret
- ✅ Ensure app is not suspended
- ✅ Check browser console for CORS errors

### Build Errors

```bash
# Clean and rebuild
pnpm clean
rm -rf node_modules
pnpm install
pnpm build
```

### Signature Verification Fails

1. **Clear verifier cache:**
   ```bash
   curl -X POST http://localhost:8081/cache/clear-all
   ```

2. **Check JWKS is accessible:**
   ```bash
   curl http://localhost:8080/jwks/yourusername.json
   ```

3. **Verify bot config has correct `kid`:**
   ```bash
   cat ~/.openbotauth/bot-config.json
   # kid should match the one in JWKS
   ```

4. **Restart services:**
   ```bash
   # Kill all services
   ./kill-services.sh
   
   # Restart
   cd packages/registry-service && pnpm dev
   cd packages/verifier-service && pnpm dev
   ```

---

## Environment Variables Reference

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `DATABASE_URL` | Postgres connection string | - | ✅ |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` | ✅ |
| `PORT` | Registry service port | `8080` | ❌ |
| `GITHUB_CLIENT_ID` | GitHub OAuth client ID | - | ✅ |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth client secret | - | ✅ |
| `GITHUB_CALLBACK_URL` | OAuth callback URL | - | ✅ |
| `FRONTEND_URL` | Frontend URL for redirects | `http://localhost:5173` | ❌ |
| `SESSION_SECRET` | Session encryption secret (32+ chars) | - | ✅ |
| `NODE_ENV` | Environment | `development` | ❌ |
| `MCP_BASE_URL` | MCP server URL | `http://localhost:8082` | ❌ |
| `A2A_BASE_URL` | A2A base URL | `http://localhost:8080` | ❌ |
| `ENABLE_A2A` | Enable experimental A2A | `false` | ❌ |
| `OB_TRUSTED_DIRECTORIES` | Trusted JWKS directories | `http://localhost:8080` | ❌ |
| `OB_MAX_SKEW_SEC` | Max clock skew (seconds) | `300` | ❌ |
| `OB_NONCE_TTL_SEC` | Nonce TTL (seconds) | `300` | ❌ |

---

## Production Deployment

### Security Checklist

- ✅ Use HTTPS everywhere
- ✅ Set strong `SESSION_SECRET` (32+ random characters)
- ✅ Enable secure cookie flags (`secure: true`, `httpOnly: true`)
- ✅ Implement rate limiting
- ✅ Rotate GitHub OAuth secrets regularly
- ✅ Use environment-specific `.env` files
- ✅ Never commit `.env` to git
- ✅ Monitor for suspicious activity
- ✅ Set up database backups
- ✅ Use connection pooling for database

### Deployment Platforms

**Recommended:**
- [Fly.io](https://fly.io) — Easy Node.js deployment
- [Railway](https://railway.app) — Simple deployment with Redis
- [Render](https://render.com) — Free tier available
- [Vercel](https://vercel.com) — For frontend (portal)

**Database:**
- [Neon](https://neon.tech) — Serverless Postgres (recommended)
- [Supabase](https://supabase.com) — Postgres with extras
- [PlanetScale](https://planetscale.com) — MySQL alternative

**Redis:**
- [Upstash](https://upstash.com) — Serverless Redis
- [Redis Cloud](https://redis.com/cloud) — Managed Redis

---

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
pnpm dev:service    # Registry (8080)
pnpm dev:portal     # Portal (5173)

# Link CLI globally
cd packages/registry-cli && pnpm link --global

# Unlink CLI
pnpm unlink --global openbot

# Kill all services
./kill-services.sh

# Database migrations
psql $DATABASE_URL < infra/neon/001_initial_schema.sql

# Clear Redis cache
redis-cli FLUSHALL
```

---

## Support & Resources

- **Documentation:** [docs/](docs/)
- **Issues:** [GitHub Issues](https://github.com/OpenBotAuth/openbotauth/issues)
- **Architecture:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- **A2A Documentation:** [docs/A2A_CARD.md](docs/A2A_CARD.md)
- **WordPress Plugin:** [plugins/wordpress-openbotauth/README.md](plugins/wordpress-openbotauth/README.md)
- **MCP Server:** [packages/mcp-server/README.md](packages/mcp-server/README.md)

---

## Next Steps

1. ✅ Complete this setup guide
2. ✅ Test the complete flow (registry → verifier → bot)
3. 🚧 Deploy to production
4. 🚧 Set up monitoring and logging
5. 🚧 Write unit tests
6. 🚧 Set up CI/CD
7. 🚧 Create Docker Compose for production

---

**Happy coding! 🚀**
