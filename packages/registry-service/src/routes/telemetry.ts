import { Router, Request, Response } from 'express';
import { createClient } from 'redis';
import { Pool } from 'pg';
import { requireScope } from '../middleware/scopes.js';

const router: Router = Router();

// Initialize Redis client
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const redisClient = createClient({ url: redisUrl });

redisClient.on('error', (err: Error) => {
  console.error('Telemetry Redis error:', err);
});

redisClient.on('connect', () => {
  console.log('✅ Telemetry Redis connected');
});

redisClient.connect().catch((err: Error) => {
  console.error('Failed to connect Telemetry Redis:', err);
});

// Initialize PostgreSQL pool
const dbPool = process.env.NEON_DATABASE_URL
  ? new Pool({
      connectionString: process.env.NEON_DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    })
  : null;

// =============================================================================
// Radar Endpoints (Global ecosystem-wide telemetry)
// =============================================================================

/**
 * Helper: Get date keys for window
 */
function getDateKeys(window: string): string[] {
  const dates: string[] = [];
  const days = window === 'today' ? 1 : 7;

  for (let i = 0; i < days; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    dates.push(date.toISOString().split('T')[0]); // YYYY-MM-DD
  }

  return dates;
}

/**
 * GET /telemetry/overview?window=today|7d
 * Global overview stats for Radar dashboard
 */
router.get('/overview', async (req: Request, res: Response) => {
  try {
    const window = (req.query.window as string) || '7d';
    const validWindows = ['today', '7d'];

    if (!validWindows.includes(window)) {
      res.status(400).json({ error: 'Invalid window. Use "today" or "7d"' });
      return;
    }

    const dateKeys = getDateKeys(window);

    // Fetch counts from Redis
    const signedPromises = dateKeys.map(d => redisClient.get(`stats:global:signed:${d}`));
    const verifiedPromises = dateKeys.map(d => redisClient.get(`stats:global:verified:${d}`));
    const failedPromises = dateKeys.map(d => redisClient.get(`stats:global:failed:${d}`));

    const [signedResults, verifiedResults, failedResults] = await Promise.all([
      Promise.all(signedPromises),
      Promise.all(verifiedPromises),
      Promise.all(failedPromises),
    ]);

    const signed = signedResults.reduce((sum, val) => sum + parseInt(val || '0', 10), 0);
    const verified = verifiedResults.reduce((sum, val) => sum + parseInt(val || '0', 10), 0);
    const failed = failedResults.reduce((sum, val) => sum + parseInt(val || '0', 10), 0);

    // Get unique counts from Postgres
    let uniqueOrigins = 0;
    let uniqueAgents = 0;

    if (dbPool) {
      try {
        const days = window === 'today' ? 1 : 7;

        const [originsResult, agentsResult] = await Promise.all([
          dbPool.query(
            `SELECT COUNT(DISTINCT target_origin) as count
             FROM signed_attempt_logs
             WHERE timestamp > NOW() - $1 * INTERVAL '1 day'`,
            [days]
          ),
          dbPool.query(
            `SELECT COUNT(DISTINCT
              CASE
                WHEN s.username IS NOT NULL THEN 'github.com/' || COALESCE(u.github_username, p.github_username, s.username)
                ELSE
                  -- Extract hostname from signature_agent URL (handles dict and legacy formats)
                  COALESCE(
                    (regexp_match(
                      CASE
                        WHEN s.signature_agent LIKE 'sig%=%"%' THEN
                          substring(s.signature_agent FROM '"([^"]+)"')
                        ELSE s.signature_agent
                      END,
                      '^https?://([^/]+)'
                    ))[1],
                    s.signature_agent
                  )
              END
            ) as count
             FROM signed_attempt_logs s
             LEFT JOIN profiles p ON p.username = s.username
             LEFT JOIN users u ON u.id = p.id
             WHERE s.timestamp > NOW() - $1 * INTERVAL '1 day'`,
            [days]
          ),
        ]);

        uniqueOrigins = parseInt(originsResult.rows[0]?.count || '0', 10);
        uniqueAgents = parseInt(agentsResult.rows[0]?.count || '0', 10);
      } catch (err) {
        console.error('Error fetching unique counts:', err);
      }
    }

    res.json({
      window,
      signed,
      verified,
      failed,
      unique_origins: uniqueOrigins,
      unique_agents: uniqueAgents,
    });
  } catch (error: any) {
    console.error('Radar overview error:', error);
    res.status(500).json({ error: 'Failed to fetch overview data' });
  }
});

/**
 * GET /telemetry/timeseries?metric=signed|verified|failed&window=7d
 * Time-series data for Radar charts
 */
router.get('/timeseries', async (req: Request, res: Response) => {
  try {
    const metric = (req.query.metric as string) || 'verified';
    const window = (req.query.window as string) || '7d';

    const validMetrics = ['signed', 'verified', 'failed'];
    if (!validMetrics.includes(metric)) {
      res.status(400).json({ error: 'Invalid metric. Use "signed", "verified", or "failed"' });
      return;
    }

    const validWindows = ['today', '7d'];
    if (!validWindows.includes(window)) {
      res.status(400).json({ error: 'Invalid window. Use "today" or "7d"' });
      return;
    }

    const dateKeys = getDateKeys(window);

    // Fetch counts from Redis for each date
    const promises = dateKeys.map(d => redisClient.get(`stats:global:${metric}:${d}`));
    const results = await Promise.all(promises);

    const points = dateKeys.map((date, i) => ({
      date,
      count: parseInt(results[i] || '0', 10),
    }));

    // Sort by date ascending for chart display
    points.sort((a, b) => a.date.localeCompare(b.date));

    res.json({
      metric,
      window,
      points,
    });
  } catch (error: any) {
    console.error('Radar timeseries error:', error);
    res.status(500).json({ error: 'Failed to fetch timeseries data' });
  }
});

/**
 * GET /telemetry/top/agents?window=7d&limit=20
 * Top agents by verified count for Radar dashboard
 */
router.get('/top/agents', async (req: Request, res: Response) => {
  try {
    const window = (req.query.window as string) || '7d';
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

    const validWindows = ['today', '7d'];
    if (!validWindows.includes(window)) {
      res.status(400).json({ error: 'Invalid window. Use "today" or "7d"' });
      return;
    }

    if (!dbPool) {
      res.status(500).json({ error: 'Database not configured' });
      return;
    }

    const days = window === 'today' ? 1 : 7;

    // Parse signature_agent to extract clean identifier:
    // - Dict format: sig1="https://example.com/jwks.json" -> extract URL, then hostname
    // - Legacy format: https://example.com/jwks.json -> extract hostname
    const result = await dbPool.query(
      `SELECT
        CASE
          WHEN s.username IS NOT NULL THEN 'github.com/' || COALESCE(u.github_username, p.github_username, s.username)
          ELSE
            -- Extract hostname from signature_agent URL
            -- Handle dict format: sig1="url" or legacy format: url
            COALESCE(
              (regexp_match(
                CASE
                  WHEN s.signature_agent LIKE 'sig%=%"%' THEN
                    substring(s.signature_agent FROM '"([^"]+)"')
                  ELSE s.signature_agent
                END,
                '^https?://([^/]+)'
              ))[1],
              s.signature_agent
            )
        END AS agent_id,
        MAX(s.client_name) AS client_name,
        COUNT(*) FILTER (WHERE s.verified) AS verified_count,
        COUNT(*) FILTER (WHERE NOT s.verified) AS failed_count
      FROM signed_attempt_logs s
      LEFT JOIN profiles p ON p.username = s.username
      LEFT JOIN users u ON u.id = p.id
      WHERE s.timestamp > NOW() - $1 * INTERVAL '1 day'
      GROUP BY 1
      ORDER BY verified_count DESC
      LIMIT $2`,
      [days, limit]
    );

    res.json(result.rows.map(row => ({
      agent_id: row.agent_id,
      client_name: row.client_name,
      verified_count: parseInt(row.verified_count, 10),
      failed_count: parseInt(row.failed_count, 10),
    })));
  } catch (error: any) {
    console.error('Radar top agents error:', error);
    res.status(500).json({ error: 'Failed to fetch top agents' });
  }
});

/**
 * GET /telemetry/top/origins?window=7d&limit=20
 * Top origins by request count for Radar dashboard
 */
router.get('/top/origins', async (req: Request, res: Response) => {
  try {
    const window = (req.query.window as string) || '7d';
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

    const validWindows = ['today', '7d'];
    if (!validWindows.includes(window)) {
      res.status(400).json({ error: 'Invalid window. Use "today" or "7d"' });
      return;
    }

    if (!dbPool) {
      res.status(500).json({ error: 'Database not configured' });
      return;
    }

    const days = window === 'today' ? 1 : 7;

    const result = await dbPool.query(
      `SELECT
        target_origin,
        COUNT(*) FILTER (WHERE verified) as verified_count,
        COUNT(*) FILTER (WHERE NOT verified) as failed_count
      FROM signed_attempt_logs
      WHERE timestamp > NOW() - $1 * INTERVAL '1 day'
      GROUP BY target_origin
      ORDER BY (COUNT(*) FILTER (WHERE verified) + COUNT(*) FILTER (WHERE NOT verified)) DESC
      LIMIT $2`,
      [days, limit]
    );

    res.json(result.rows.map(row => ({
      origin: row.target_origin,
      verified_count: parseInt(row.verified_count, 10),
      failed_count: parseInt(row.failed_count, 10),
    })));
  } catch (error: any) {
    console.error('Radar top origins error:', error);
    res.status(500).json({ error: 'Failed to fetch top origins' });
  }
});

// =============================================================================
// Per-User Telemetry Endpoints (existing, unchanged for karma)
// =============================================================================

router.get('/:username', async (req: Request, res: Response) => {
  try {
    const { username } = req.params;

    // Check privacy setting from database
    let isPublic = true;
    if (dbPool) {
      try {
        const privacyResult = await dbPool.query(
          'SELECT is_public FROM user_stats WHERE username = $1',
          [username]
        );
        if (privacyResult.rows.length > 0) {
          isPublic = privacyResult.rows[0].is_public !== false;
        }
      } catch (err) {
        console.error('Error checking privacy setting:', err);
        // Default to public if error
      }
    }

    // Enforce privacy server-side: if not public and requester is not the owner, return minimal data
    if (!isPublic) {
      const isOwner = req.session?.profile?.username === username;
      if (!isOwner) {
        res.json({ username, is_public: false });
        return;
      }
    }

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
      is_public: isPublic,
    });
  } catch (error: any) {
    console.error('Telemetry API error:', error);
    res.status(500).json({ error: 'Failed to fetch telemetry data' });
  }
});

// Update telemetry visibility
router.put(
  '/:username/visibility',
  requireScope('profile:write'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { username } = req.params;
      const { is_public } = req.body;

      if (typeof is_public !== 'boolean') {
        res.status(400).json({ error: 'is_public must be a boolean' });
        return;
      }

      if (!req.session) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      if (req.session.profile.username !== username) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      if (!dbPool) {
        res.status(500).json({ error: 'Database not configured' });
        return;
      }

      // Upsert the privacy setting
      await dbPool.query(
        `INSERT INTO user_stats (username, is_public, updated_at)
         VALUES ($1, $2, now())
         ON CONFLICT (username)
         DO UPDATE SET is_public = $2, updated_at = now()`,
        [username, is_public]
      );

      res.json({ success: true, is_public });
    } catch (error: any) {
      console.error('Telemetry visibility update error:', error);
      res.status(500).json({ error: 'Failed to update visibility setting' });
    }
  }
);

export { router as telemetryRouter };
