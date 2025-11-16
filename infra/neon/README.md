# Neon Database Setup

This directory contains SQL migrations for the OpenBotAuth Neon database.

## Schema Overview

The database schema includes the following tables:

### Core Tables

- **users**: User accounts (replaces Supabase auth.users)
  - Stores GitHub OAuth data (github_id, github_username, email)
  - Primary identity table

- **profiles**: Extended user profile information
  - Bot metadata (client_name, client_uri, logo_uri)
  - RFC 9309 compliance fields
  - Web Bot Auth metadata

- **public_keys**: Current active public key per user
  - One-to-one with users
  - Ed25519 public keys in base64

- **key_history**: Historical record of all keys
  - Tracks key rotations
  - `is_active` flag for current keys

### Agent Management

- **agents**: Bot/agent registrations
  - Multiple agents per user
  - Public key stored as JSONB (JWK format)
  - Status tracking (active, paused, inactive)

- **agent_activity**: Activity logs for agents
  - HTTP request logs (URL, method, status)
  - Response time tracking
  - Publicly readable for transparency

### Authentication

- **sessions**: GitHub OAuth session management
  - Session tokens
  - Expiration tracking
  - Replaces Supabase Auth sessions

## Running Migrations

### Using psql

```bash
# Set your Neon connection string
export NEON_DATABASE_URL="postgresql://user:password@host/database?sslmode=require"

# Run migrations in order
psql $NEON_DATABASE_URL < migrations/001_initial_schema.sql
```

### Using MCP

If you have the Neon MCP server configured:

```bash
# Use your MCP client to execute migrations
# Example with cursor MCP:
mcp execute neon query --file migrations/001_initial_schema.sql
```

## Environment Variables

Required environment variables:

```bash
NEON_DATABASE_URL=postgresql://user:password@host.neon.tech/dbname?sslmode=require
```

## Differences from Supabase

1. **No RLS (Row Level Security)**: Neon doesn't have built-in RLS. Security is enforced at the application layer in registry-service.

2. **No auth.users**: We maintain our own `users` table instead of relying on Supabase Auth.

3. **Session Management**: Custom session table instead of Supabase Auth sessions.

4. **Public Access**: All JWKS and agent data is publicly readable (no RLS policies needed).

## Security Considerations

- Session tokens should be cryptographically random (use crypto.randomBytes)
- Implement rate limiting at the application layer
- Validate all user inputs in the registry service
- Use prepared statements to prevent SQL injection
- Regularly rotate session tokens (implement expiration cleanup)

## Maintenance

### Clean up expired sessions

```sql
DELETE FROM public.sessions WHERE expires_at < now();
```

### Deactivate old keys

```sql
UPDATE public.key_history 
SET is_active = false 
WHERE user_id = $1 AND is_active = true;
```

### View agent activity

```sql
SELECT a.name, aa.target_url, aa.method, aa.status_code, aa.timestamp
FROM public.agent_activity aa
JOIN public.agents a ON a.id = aa.agent_id
ORDER BY aa.timestamp DESC
LIMIT 100;
```

