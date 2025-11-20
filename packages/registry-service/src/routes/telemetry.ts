import { Router, Request, Response } from 'express';
import { createClient } from 'redis';
import { Pool } from 'pg';

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
router.put('/:username/visibility', async (req: Request, res: Response): Promise<void> => {
  try {
    const { username } = req.params;
    const { is_public } = req.body;

    if (typeof is_public !== 'boolean') {
      res.status(400).json({ error: 'is_public must be a boolean' });
      return;
    }

    // TODO: Add authentication check - only profile owner should be able to update
    // For now, we'll allow any request (will be secured when auth is added)

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
});

export { router as telemetryRouter };

