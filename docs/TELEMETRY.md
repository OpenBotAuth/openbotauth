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

## Implementation Details

### Verifier Service

The verifier service logs telemetry after successful verification:

```typescript
// After verification success
if (result.verified && result.agent && telemetryLogger) {
  const username = extractUsernameFromJWKS(result.agent.jwks_url);
  const targetOrigin = new URL(url).origin;
  
  telemetryLogger.logVerification({
    username,
    jwksUrl: result.agent.jwks_url,
    targetOrigin,
    method: request.method,
    verified: true,
  });
}
```

### Registry Service

The registry service exposes telemetry data via API:

```typescript
// GET /telemetry/:username
router.get('/:username', async (req, res) => {
  const { username } = req.params;
  
  // Fetch from Redis
  const stats = await fetchUserStats(username);
  
  res.json(stats);
});
```

### Frontend Display

The portal displays stats on public profile pages:

```typescript
// Fetch telemetry
const stats = await api.getUserTelemetry(username);

// Display stats card
<Card>
  <CardHeader>
    <CardTitle>Activity & Reputation</CardTitle>
  </CardHeader>
  <CardContent>
    <div>Request Volume: {stats.request_volume}</div>
    <div>Site Diversity: {stats.site_diversity}</div>
    <div>Karma Score: {stats.karma_score}</div>
    <div>Last Seen: {formatDistanceToNow(stats.last_seen)}</div>
  </CardContent>
</Card>
```

## Database Schema

### verification_logs

```sql
CREATE TABLE verification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jwks_url TEXT NOT NULL,
  username TEXT NOT NULL,
  target_origin TEXT NOT NULL,
  method TEXT NOT NULL,
  verified BOOLEAN NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

CREATE INDEX idx_verification_logs_username ON verification_logs(username);
CREATE INDEX idx_verification_logs_timestamp ON verification_logs(timestamp);
CREATE INDEX idx_verification_logs_origin ON verification_logs(target_origin);
```

### user_stats

```sql
CREATE TABLE user_stats (
  username TEXT PRIMARY KEY,
  last_seen TIMESTAMP WITH TIME ZONE,
  total_requests BIGINT DEFAULT 0,
  unique_origins_count INTEGER DEFAULT 0,
  karma_score INTEGER DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

CREATE INDEX idx_user_stats_karma ON user_stats(karma_score DESC);
```

## Environment Variables

Add to `.env`:

```bash
# Telemetry (optional, defaults shown)
ENABLE_TELEMETRY=true
REDIS_URL=redis://localhost:6379
NEON_DATABASE_URL=postgresql://user:password@localhost:5432/openbotauth
```

## Testing

After implementation:

1. **Test telemetry collection**:
   - Run verifier service
   - Make a signed request using bot CLI
   - Check Redis keys: `redis-cli KEYS "stats:*"`
   - Verify database logs: `SELECT * FROM verification_logs;`

2. **Test API**: 
   ```bash
   curl http://localhost:8080/telemetry/hammadtq
   ```

3. **Test frontend**: 
   - Visit profile page at `/{username}`
   - Verify stats card appears with correct data

## Radar: Ecosystem-Wide Telemetry

The Radar dashboard provides a global view of OpenBotAuth ecosystem activity, similar to Cloudflare Radar. It tracks all signed requests (verified and failed) separately from the per-user karma system.

### Design Principle: Separation of Concerns

- **Karma stats** (`verification_logs`, `stats:{username}:*`) - Only verified successes, used for reputation
- **Radar stats** (`signed_attempt_logs`, `stats:global:*`) - All signed attempts, used for ecosystem insights

This separation ensures that failed verification attempts don't pollute karma scores.

### Radar Database Schema

```sql
-- signed_attempt_logs (all signed requests - verified + failed)
CREATE TABLE signed_attempt_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signature_agent TEXT,           -- Claimed Signature-Agent header
  target_origin TEXT NOT NULL,    -- Origin only (scheme+host)
  method TEXT NOT NULL,
  verified BOOLEAN NOT NULL,
  failure_reason TEXT,            -- NULL if verified, else: missing_headers, bad_signature, etc.
  username TEXT,                  -- Extracted if parseable, NULL otherwise
  jwks_url TEXT,
  client_name TEXT,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);
```

### Radar Redis Keys

Global counters (daily granularity):
- `stats:global:signed:YYYY-MM-DD` - All signed requests
- `stats:global:verified:YYYY-MM-DD` - Verified requests
- `stats:global:failed:YYYY-MM-DD` - Failed requests

### Radar API Endpoints

#### GET /telemetry/overview?window=today|7d

Returns ecosystem-wide stats.

```json
{
  "window": "7d",
  "signed": 1690,
  "verified": 1234,
  "failed": 456,
  "unique_origins": 98,
  "unique_agents": 41
}
```

#### GET /telemetry/timeseries?metric=verified|failed&window=7d

Returns daily counts for charting.

```json
{
  "metric": "verified",
  "window": "7d",
  "points": [
    {"date": "2025-12-19", "count": 150},
    {"date": "2025-12-18", "count": 120}
  ]
}
```

#### GET /telemetry/top/agents?window=7d&limit=20

Top agents by verified count.

```json
[
  {"agent_id": "openai", "client_name": "ChatGPT Agent", "verified_count": 523, "failed_count": 12}
]
```

#### GET /telemetry/top/origins?window=7d&limit=20

Top publisher origins.

```json
[
  {"origin": "https://example.com", "verified_count": 90, "failed_count": 10}
]
```

### Failure Reasons

Coarse categories for failed verification attempts:
- `missing_headers` - Required signature headers incomplete
- `bad_signature` - Signature verification failed
- `untrusted_directory` - JWKS URL not in trusted list
- `jwks_fetch_failed` - Could not fetch JWKS
- `expired` - Signature timestamp expired
- `nonce_reuse` - Replay attack detected

### Portal: /radar Page

The Radar page at `/radar` shows:
- Big numbers: Signed, Verified, Failed, Unique Agents
- Line chart: Verified vs Failed over 7 days
- Top Agents table
- Top Origins table

### WordPress Plugin Counters

The WordPress plugin tracks local counters separately:
- `openbotauth_meta_stats_{date}` with `signed_total` and `verified_total`
- Displayed in admin UI: "Signed Agent Requests: X | Verified: Y (Z%)"

## Future Enhancements

- Separate agent identities from user accounts
- Per-agent karma scores
- Publisher-specific reputation
- Behavioral anomaly detection
- Rejection rate tracking
- Time-based decay of karma
- Leaderboards and badges
- Geographic diversity metrics
- Response time tracking
- Success/failure ratio trends

## Notes

- Telemetry is non-blocking and won't affect verification performance
- Redis is used for real-time counters (fast)
- Database logs are async (persistent)
- Stats are publicly visible (transparency feature)
- Future: Add periodic sync job from Redis to `user_stats` table

## References

- [ARCHITECTURE.md](ARCHITECTURE.md) - System architecture overview
- [TESTING_GUIDE.md](TESTING_GUIDE.md) - Testing instructions
- [README.md](../README.md) - Main project documentation

