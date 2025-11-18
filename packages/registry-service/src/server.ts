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
import { mountAgentCard } from '@openbotauth/a2a-card';
import { jwksRouter } from './routes/jwks.js';
import { agentRouter } from './routes/agents.js';
import { agentsAPIRouter } from './routes/agents-api.js';
import { authRouter } from './routes/auth.js';
import { activityRouter } from './routes/activity.js';
import { profilesRouter } from './routes/profiles.js';
import { keysRouter } from './routes/keys.js';
import { sessionMiddleware } from './middleware/session.js';

const app = express();
const port = parseInt(process.env.PORT || '8080', 10);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS - Allow portal to access API with credentials
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:3000',
    process.env.FRONTEND_URL,
  ].filter(Boolean);

  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cookie');
  
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

// Session middleware
app.use(sessionMiddleware);

// Mount A2A Card
mountAgentCard(app as any, {
  jwksUrl: process.env.AGENTCARD_JWKS_URL || 'http://localhost:8080/jwks/openbotauth.json',
  mcpUrl: process.env.MCP_BASE_URL || 'http://localhost:8082',
  a2aUrl: process.env.A2A_BASE_URL || 'http://localhost:8080',
  enableA2A: process.env.ENABLE_A2A === 'true',
  contact: process.env.AGENTCARD_CONTACT,
  docsUrl: process.env.AGENTCARD_DOCS_URL,
  sigAlgs: process.env.AGENTCARD_SIG_ALGS?.split(',').map(s => s.trim()),
});

// Health check
app.get('/health', (_req: express.Request, res: express.Response) => {
  res.json({ status: 'ok', service: 'registry' });
});

// Routes
app.use('/jwks', jwksRouter);
app.use('/agent-jwks', agentRouter);
app.use('/agents', agentsAPIRouter);
app.use('/auth', authRouter);
app.use('/agent-activity', activityRouter);
app.use('/profiles', profilesRouter);
app.use('/keys', keysRouter);

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

