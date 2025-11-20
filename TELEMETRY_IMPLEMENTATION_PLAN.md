# Telemetry & Karma Implementation Plan

## Overview

Implement a transparency and reputation system that tracks agent verification activity through the hosted verifier service. Display karma scores and activity metrics on user profile pages.

## User Requirements

Based on user feedback (1a, 2a, 3a, 4b):
- **1a**: Implement all statistics (last seen, request volume, site diversity, karma score)
- **2a**: Store in new database tables, display on user's public profile page (`/{username}`)
- **3a**: Footer on all pages (marketing + portal)
- **4b**: Use Redis for real-time counters, periodically sync to database

## Implementation Tasks

### 1. Remove "My Agents" Navigation

**File**: `apps/registry-portal/src/pages/portal/PublicProfile.tsx`
- **Line 336**: Remove the button that navigates to "/my-agents"
- Keep the route in App.tsx but make it inaccessible via UI
- This feature is not ready yet and will be revisited later

### 2. Create Footer Component

**New file**: `apps/registry-portal/src/components/Footer.tsx`

Create a footer component with:
- **Left column**: 
  - "OpenBotAuth Project"
  - Tagline: "Made with love for agent economy"
- **Right column**: Links grid
  - "Demos" → `/registry`
  - "Docs" → `https://docs.openbotauth.org`
  - "GitHub" → `https://github.com/OpenBotAuth/openbotauth`
  - "Discord" → `https://discord.gg/QXujuH42nT`
- **Bottom**: Copyright and Apache 2.0 license mention

**Styling**:
- Responsive (stacked on mobile, side-by-side on desktop)
- Border top
- Consistent with existing design system (shadcn/ui)
- Dark background with light text

**Files to modify** - Add `<Footer />` import and component to:
- `apps/registry-portal/src/pages/marketing/Home.tsx` (after `</main>`)
- `apps/registry-portal/src/pages/marketing/Publishers.tsx` (after `</main>`)
- `apps/registry-portal/src/pages/marketing/Crawlers.tsx` (after `</main>`)
- `apps/registry-portal/src/pages/marketing/Contact.tsx` (after `</main>`)
- `apps/registry-portal/src/pages/portal/PublicProfile.tsx` (at bottom, before closing div)
- `apps/registry-portal/src/pages/portal/Registry.tsx` (at bottom, before closing div)
- `apps/registry-portal/src/pages/portal/Setup.tsx` (at bottom)
- Any other portal pages

### 3. Database Schema for Telemetry

**New migration file**: `infra/neon/migrations/002_telemetry_tables.sql`

Create two new tables:

```sql
-- Verification logs from verifier service
CREATE TABLE IF NOT EXISTS public.verification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jwks_url TEXT NOT NULL,
  username TEXT NOT NULL,
  target_origin TEXT NOT NULL,
  method TEXT NOT NULL,
  verified BOOLEAN NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

CREATE INDEX idx_verification_logs_username ON public.verification_logs(username);
CREATE INDEX idx_verification_logs_timestamp ON public.verification_logs(timestamp);
CREATE INDEX idx_verification_logs_origin ON public.verification_logs(target_origin);

-- User karma/telemetry stats (aggregated periodically from Redis)
CREATE TABLE IF NOT EXISTS public.user_stats (
  username TEXT PRIMARY KEY,
  last_seen TIMESTAMP WITH TIME ZONE,
  total_requests BIGINT DEFAULT 0,
  unique_origins_count INTEGER DEFAULT 0,
  karma_score INTEGER DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

CREATE INDEX idx_user_stats_karma ON public.user_stats(karma_score DESC);
```

**Run migration**:
```bash
# Using Neon MCP or psql
psql $NEON_DATABASE_URL < infra/neon/migrations/002_telemetry_tables.sql
```

### 4. Verifier Service Telemetry Logging

**File**: `packages/verifier-service/src/server.ts`

In the `/authorize` endpoint, after successful verification (around line 131), add telemetry logging:

```typescript
// After line 131 (successful verification response)
if (result.verified && result.agent) {
  // Extract username from JWKS URL
  const jwksUrl = result.agent.jwks_url;
  const usernameMatch = jwksUrl.match(/\/jwks\/([^.]+)\.json/);
  
  if (usernameMatch) {
    const username = usernameMatch[1];
    const targetOrigin = new URL(url).origin;
    
    // Log to Redis (real-time counters) - non-blocking
    Promise.resolve().then(async () => {
      try {
        await redisClient.incr(`stats:${username}:requests`);
        await redisClient.sAdd(`stats:${username}:origins`, targetOrigin);
        await redisClient.set(`stats:${username}:last_seen`, Date.now());
      } catch (err) {
        console.error('Redis telemetry error:', err);
      }
    });
    
    // Async log to database (for persistence) - non-blocking
    // We'll create a helper function for this
  }
}
```

**New file**: `packages/verifier-service/src/telemetry.ts`

Create telemetry helper functions:

```typescript
import { RedisClientType } from 'redis';
import { Pool } from 'pg';

export class TelemetryLogger {
  constructor(
    private redis: RedisClientType,
    private db: Pool
  ) {}

  async logVerification(data: {
    username: string;
    jwksUrl: string;
    targetOrigin: string;
    method: string;
    verified: boolean;
  }): Promise<void> {
    try {
      // Update Redis counters (real-time)
      await Promise.all([
        this.redis.incr(`stats:${data.username}:requests`),
        this.redis.sAdd(`stats:${data.username}:origins`, data.targetOrigin),
        this.redis.set(`stats:${data.username}:last_seen`, Date.now()),
      ]);

      // Log to database (async, non-blocking)
      setImmediate(async () => {
        try {
          await this.db.query(
            `INSERT INTO verification_logs (jwks_url, username, target_origin, method, verified)
             VALUES ($1, $2, $3, $4, $5)`,
            [data.jwksUrl, data.username, data.targetOrigin, data.method, data.verified]
          );
        } catch (err) {
          console.error('Database telemetry error:', err);
        }
      });
    } catch (err) {
      console.error('Telemetry logging error:', err);
    }
  }

  async getUserStats(username: string): Promise<{
    last_seen: number | null;
    request_volume: number;
    site_diversity: number;
    karma_score: number;
  }> {
    try {
      const [lastSeen, requests, origins] = await Promise.all([
        this.redis.get(`stats:${username}:last_seen`),
        this.redis.get(`stats:${username}:requests`),
        this.redis.sCard(`stats:${username}:origins`),
      ]);

      const requestVolume = parseInt(requests || '0', 10);
      const siteDiversity = origins || 0;
      
      // Calculate karma score
      const baseScore = Math.floor(requestVolume / 100);
      const diversityBonus = siteDiversity * 10;
      const karmaScore = baseScore + diversityBonus;

      return {
        last_seen: lastSeen ? parseInt(lastSeen, 10) : null,
        request_volume: requestVolume,
        site_diversity: siteDiversity,
        karma_score: karmaScore,
      };
    } catch (err) {
      console.error('Error fetching user stats:', err);
      return {
        last_seen: null,
        request_volume: 0,
        site_diversity: 0,
        karma_score: 0,
      };
    }
  }
}
```

**Update**: `packages/verifier-service/src/server.ts`
- Import `TelemetryLogger`
- Initialize with Redis and Postgres pool
- Use in `/authorize` endpoint

**Add Postgres dependency**: `packages/verifier-service/package.json`
```json
"dependencies": {
  "pg": "^8.11.3"
}
```

### 5. Registry Service Telemetry API

**New file**: `packages/registry-service/src/routes/telemetry.ts`

Create API endpoint to fetch user telemetry:

```typescript
import { Router } from 'express';
import { createClient } from 'redis';

const router = Router();

// Initialize Redis client
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const redisClient = createClient({ url: redisUrl });
redisClient.connect();

router.get('/:username', async (req, res) => {
  try {
    const { username } = req.params;

    // Fetch from Redis (real-time data)
    const [lastSeen, requests, origins] = await Promise.all([
      redisClient.get(`stats:${username}:last_seen`),
      redisClient.get(`stats:${username}:requests`),
      redisClient.sCard(`stats:${username}:origins`),
    ]);

    const requestVolume = parseInt(requests || '0', 10);
    const siteDiversity = origins || 0;
    
    // Calculate karma score
    const baseScore = Math.floor(requestVolume / 100);
    const diversityBonus = siteDiversity * 10;
    const karmaScore = baseScore + diversityBonus;

    res.json({
      username,
      last_seen: lastSeen ? new Date(parseInt(lastSeen, 10)).toISOString() : null,
      request_volume: requestVolume,
      site_diversity: siteDiversity,
      karma_score: karmaScore,
    });
  } catch (error: any) {
    console.error('Telemetry API error:', error);
    res.status(500).json({ error: 'Failed to fetch telemetry data' });
  }
});

export default router;
```

**File**: `packages/registry-service/src/server.ts`

Import and mount telemetry router:

```typescript
import telemetryRouter from './routes/telemetry.js';

// Mount routes (add after other routes)
app.use('/telemetry', telemetryRouter);
```

### 6. Frontend Display of Karma/Stats

**File**: `apps/registry-portal/src/pages/portal/PublicProfile.tsx`

Add state for telemetry stats (around line 61):

```typescript
const [telemetryStats, setTelemetryStats] = useState<{
  last_seen: string | null;
  request_volume: number;
  site_diversity: number;
  karma_score: number;
} | null>(null);
```

Add API call in `fetchProfile()` function (around line 96):

```typescript
// Fetch telemetry stats for this user
try {
  const stats = await api.getUserTelemetry(username!);
  setTelemetryStats(stats);
} catch (err) {
  console.error('Failed to fetch telemetry:', err);
  // Non-critical, continue without stats
}
```

Add stats card after profile header (around line 241, after the profile Card):

```typescript
{/* Telemetry Stats - Public */}
{telemetryStats && telemetryStats.request_volume > 0 && (
  <Card>
    <CardHeader>
      <CardTitle>Activity & Reputation</CardTitle>
      <CardDescription>
        Transparency from the hosted verifier service
      </CardDescription>
    </CardHeader>
    <CardContent>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <div className="text-2xl font-bold">{telemetryStats.request_volume.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground">Request Volume</div>
        </div>
        <div>
          <div className="text-2xl font-bold">{telemetryStats.site_diversity}</div>
          <div className="text-xs text-muted-foreground">Site Diversity</div>
        </div>
        <div>
          <div className="text-2xl font-bold">{telemetryStats.karma_score}</div>
          <div className="text-xs text-muted-foreground">Karma Score</div>
          {telemetryStats.karma_score > 100 && (
            <Badge variant="secondary" className="mt-1">Popular with publishers</Badge>
          )}
        </div>
        <div>
          <div className="text-2xl font-bold">
            {telemetryStats.last_seen 
              ? formatDistanceToNow(new Date(telemetryStats.last_seen), { addSuffix: true })
              : 'Never'}
          </div>
          <div className="text-xs text-muted-foreground">Last Seen</div>
        </div>
      </div>
    </CardContent>
  </Card>
)}
```

Add import for `formatDistanceToNow`:
```typescript
import { formatDistanceToNow } from 'date-fns';
```

**File**: `apps/registry-portal/src/lib/api.ts`

Add method to fetch telemetry:

```typescript
async getUserTelemetry(username: string) {
  const response = await fetch(`${this.baseUrl}/telemetry/${username}`);
  if (!response.ok) {
    throw new Error('Failed to fetch telemetry');
  }
  return response.json();
}
```

### 7. Update README

**File**: `README.md`

Add new section after "Features" (around line 50):

```markdown
## Transparency & Telemetry

When publishers use the hosted verifier at `verifier.openbotauth.org`, every verification request provides observability from the origin side:

### What You Get for Free

Every verification includes:
- Agent ID (JWKS URL)
- Target origin (e.g., blog.attach.dev)
- Request method and path

From this we derive:
- **Last seen timestamps** per agent
- **Request volume** per agent (rough metric)
- **Site diversity** - which origins an agent is visiting
- **Karma score** - "popular with publishers" reputation

This gives publishers:
- Real-time transparency on agent behavior
- Bad behavior signals (high traffic but often rejected)
- Agent reputation without centralized authority

### Privacy & Self-Hosting

If you self-host the verifier, you can:
- Keep all metrics local
- Opt-in to send anonymized stats back to OpenBotAuth (analytics "ping")
- Maintain full control over your data

Karma scores are displayed publicly on agent profile pages as a transparency feature.

See [docs/TELEMETRY.md](docs/TELEMETRY.md) for detailed documentation.
```

### 8. Create Comprehensive Telemetry Documentation

**New file**: `docs/TELEMETRY.md`

```markdown
# OpenBotAuth Telemetry & Karma System

## Overview

The hosted verifier service (`verifier.openbotauth.org`) provides origin-side observability. When publishers verify agent signatures, OpenBotAuth collects telemetry that benefits the entire ecosystem.

## How It Works

### 1. Verification Logging

When a publisher verifies an agent signature via `/authorize`:

1. Extract username from JWKS URL (`/jwks/{username}.json`)
2. Record verification attempt in Redis:
   - Increment request counter
   - Add target origin to set (for diversity)
   - Update last seen timestamp
3. Async log to database for persistence

### 2. Real-Time Counters (Redis)

Keys:
- `stats:{username}:requests` - INCR on each verification
- `stats:{username}:origins` - SADD target origins
- `stats:{username}:last_seen` - SET current timestamp

### 3. Database Persistence

Tables:
- `verification_logs` - Individual verification records
- `user_stats` - Aggregated statistics (updated periodically)

### 4. Karma Calculation

Formula:
```
base_score = request_volume / 100
diversity_bonus = unique_origins_count * 10
karma_score = base_score + diversity_bonus

# Penalties (future)
if rejection_rate > 50%:
  karma_score = 0
```

Thresholds:
- **Popular with publishers**: karma > 100
- **Bad behavior**: rejection rate > 50% (future)

### 5. Public Display

Stats shown on profile pages (`/{username}`):
- Last Seen (relative time)
- Request Volume (total count)
- Site Diversity (unique origins)
- Karma Score (calculated reputation)

## Privacy Considerations

- No request content is logged
- Only metadata: username, origin, method, success/failure
- Publicly visible by design (transparency)
- Self-hosters can disable telemetry

## Self-Hosting

To disable telemetry in your verifier:

```bash
# In your .env
ENABLE_TELEMETRY=false
```

To opt-in to anonymized stats:

```bash
OPENBOTAUTH_ANALYTICS_PING=true
```

## API Endpoints

### GET /telemetry/:username

Returns current stats for a user.

Response:
```json
{
  "username": "hammadtq",
  "last_seen": "2025-11-19T10:30:00Z",
  "request_volume": 1523,
  "site_diversity": 47,
  "karma_score": 485
}
```

### POST /telemetry/log (Internal)

Used by verifier service to log verifications.

Request:
```json
{
  "username": "hammadtq",
  "jwks_url": "https://api.openbotauth.org/jwks/hammadtq.json",
  "target_origin": "https://blog.attach.dev",
  "method": "GET",
  "verified": true
}
```

## Future Enhancements

- Separate agent identities from user accounts
- Per-agent karma scores
- Publisher-specific reputation
- Behavioral anomaly detection
- Rejection rate tracking
- Time-based decay of karma
- Leaderboards and badges
```

## Implementation Order

1. **Remove My Agents button** (2 minutes)
2. **Create Footer component** (15 minutes)
3. **Database migration** (5 minutes)
4. **Verifier telemetry logging** (30 minutes)
5. **Registry telemetry API** (20 minutes)
6. **Frontend display** (30 minutes)
7. **Update README** (10 minutes)
8. **Create TELEMETRY.md** (15 minutes)

**Total estimated time**: ~2 hours

## Testing

After implementation:

1. **Test footer**: Visit all pages and verify footer appears correctly
2. **Test telemetry collection**:
   - Run verifier service
   - Make a signed request using bot CLI
   - Check Redis keys: `redis-cli KEYS "stats:*"`
   - Verify database logs: `SELECT * FROM verification_logs;`
3. **Test API**: `curl http://localhost:8080/telemetry/hammadtq`
4. **Test frontend**: Visit profile page and verify stats card appears

## Environment Variables

Add to `.env`:

```bash
# Telemetry (optional, defaults shown)
ENABLE_TELEMETRY=true
REDIS_URL=redis://localhost:6379
```

## Notes

- Telemetry is non-blocking and won't affect verification performance
- Redis is used for real-time counters (fast)
- Database logs are async (persistent)
- Stats are publicly visible (transparency feature)
- Future: Add periodic sync job from Redis to `user_stats` table

