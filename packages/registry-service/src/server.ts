/**
 * Registry Service
 * 
 * Provides JWKS endpoints, agent management, and GitHub OAuth integration.
 * Backed by Neon Postgres.
 */

import 'dotenv/config';
import express from 'express';
import { Pool } from 'pg';
import { Database, GitHubOAuth } from '@openbotauth/github-connector';
import { jwksRouter } from './routes/jwks.js';
import { agentRouter } from './routes/agents.js';
import { authRouter } from './routes/auth.js';
import { activityRouter } from './routes/activity.js';

const app = express();
const port = parseInt(process.env.PORT || '8080', 10);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }
  
  next();
});

// Database connection
const pool = new Pool({
  connectionString: process.env.NEON_DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

const db = new Database(pool);

// GitHub OAuth
const oauth = new GitHubOAuth({
  clientId: process.env.GITHUB_CLIENT_ID!,
  clientSecret: process.env.GITHUB_CLIENT_SECRET!,
  callbackUrl: process.env.GITHUB_CALLBACK_URL!,
});

// Make db and oauth available to routes
app.locals.db = db;
app.locals.oauth = oauth;

// Health check
app.get('/health', (_req: express.Request, res: express.Response) => {
  res.json({ status: 'ok', service: 'registry' });
});

// Routes
app.use('/jwks', jwksRouter);
app.use('/agent-jwks', agentRouter);
app.use('/auth', authRouter);
app.use('/agent-activity', activityRouter);

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// Start server
app.listen(port, () => {
  console.log(`Registry service listening on port ${port}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing connections...');
  await pool.end();
  process.exit(0);
});

