/**
 * Authentication routes
 *
 * GitHub OAuth flow implementation.
 * Supports two login modes:
 *   - 'web'  — normal browser login, redirects to FRONTEND_URL
 *   - 'cli'  — CLI tool login via /auth/cli, creates a PAT and redirects to localhost
 */

import crypto from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import type { Database, GitHubOAuth } from '@openbotauth/github-connector';
import {
  generateSessionToken,
  getSessionExpiration,
  createSessionCookie,
  deleteSessionCookie,
  parseSessionCookie,
} from '@openbotauth/github-connector';
import { hashToken } from '../utils/crypto.js';
import { MAX_TOKENS_PER_USER, tokensRouter } from './tokens.js';

export const authRouter: Router = Router();

// Mount token management routes
authRouter.use('/tokens', tokensRouter);

// In-memory state storage (use Redis in production)
type OAuthStateData = {
  created: number;
  mode: 'web' | 'cli';
  callbackPort?: number;  // cli only
  cliState?: string;      // cli only — returned to CLI for its own CSRF check
};
const oauthStates = new Map<string, OAuthStateData>();

// Clean up old states every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [state, data] of oauthStates.entries()) {
    if (now - data.created > 10 * 60 * 1000) {
      oauthStates.delete(state);
    }
  }
}, 10 * 60 * 1000);

/**
 * GET /auth/cli
 *
 * Initiate GitHub OAuth flow for CLI tools.
 * Accepts `port` (localhost callback port) and `state` (CLI-side CSRF token).
 * After successful auth, OBA creates a PAT and redirects to http://127.0.0.1:PORT/callback.
 */
authRouter.get('/cli', (req, res) => {
  const oauth: GitHubOAuth = req.app.locals.oauth;
  const portStr = req.query.port as string | undefined;
  const cliState = req.query.state as string | undefined;

  // Validate port — only unprivileged ports allowed
  const port = Number(portStr);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    res.status(400).json({ error: 'Invalid port (must be 1024-65535)' });
    return;
  }

  // Validate CLI state (minimum 16 chars for CSRF token)
  if (!cliState || typeof cliState !== 'string' || cliState.length < 16) {
    res.status(400).json({ error: 'Invalid state parameter' });
    return;
  }

  // Generate separate OAuth state for the GitHub leg
  const oauthState = oauth.generateState();
  oauthStates.set(oauthState, {
    created: Date.now(),
    mode: 'cli',
    callbackPort: port,
    cliState,
  });

  res.redirect(oauth.getAuthorizationUrl(oauthState));
});

/**
 * GET /auth/github
 *
 * Initiate GitHub OAuth flow (web portal)
 */
authRouter.get('/github', (req, res) => {
  const oauth: GitHubOAuth = req.app.locals.oauth;

  const state = oauth.generateState();
  oauthStates.set(state, { created: Date.now(), mode: 'web' });

  res.redirect(oauth.getAuthorizationUrl(state));
});

/**
 * GET /auth/github/callback
 * 
 * Handle GitHub OAuth callback
 */
authRouter.get('/github/callback', async (req: Request, res: Response): Promise<void> => {
  try {
    const { code, state } = req.query;
    const db: Database = req.app.locals.db;
    const oauth: GitHubOAuth = req.app.locals.oauth;

    // Verify state
    const stateData = oauthStates.get(state as string);
    if (!state || !stateData) {
      res.status(400).json({ error: 'Invalid state' });
      return;
    }
    oauthStates.delete(state as string);

    if (!code) {
      res.status(400).json({ error: 'Missing code' });
      return;
    }

    // Exchange code for user data
    const githubUser = await oauth.handleCallback(code as string);

    // Find or create user
    let user = await db.findUserByGitHubId(githubUser.id.toString());

    if (!user) {
      // Create new user
      user = await db.transaction(async () => {
        const newUser = await db.createUser(githubUser);

        // Create profile with username from GitHub
        await db.createProfile(newUser.id, githubUser.login);

        return newUser;
      });
    } else {
      // Update existing user
      await db.updateUser(user.id, {
        email: githubUser.email || undefined,
        github_username: githubUser.login,
        avatar_url: githubUser.avatar_url || undefined,
      });
    }

    // Create session
    const sessionToken = generateSessionToken();
    const expiresAt = getSessionExpiration(30); // 30 days

    await db.createSession(user.id, sessionToken, expiresAt);

    // Set cookie
    const cookie = createSessionCookie(sessionToken, {
      secure: process.env.NODE_ENV === 'production',
    });
    res.setHeader('Set-Cookie', cookie);

    // Get user's profile for redirect
    const profile = await db.findProfileByUserId(user.id);

    if (stateData.mode === 'cli' && stateData.callbackPort) {
      // ── CLI flow: create PAT server-side, redirect to localhost ──
      const rawHex = crypto.randomBytes(32).toString('hex');
      const rawToken = `oba_${rawHex}`;
      const hash = hashToken(rawToken);
      const prefix = `oba_${rawHex.slice(0, 4)}`;
      const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000); // 90 days

      // Rotate inside a transaction so we never end up with "deleted but insert failed".
      const pool = db.getPool();
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          `DELETE FROM api_tokens WHERE user_id = $1 AND name = 'openclaw-cli'`,
          [user.id]
        );
        const countResult = await client.query(
          `SELECT count(*)::int AS cnt FROM api_tokens WHERE user_id = $1`,
          [user.id]
        );
        if (countResult.rows[0].cnt >= MAX_TOKENS_PER_USER) {
          await client.query('ROLLBACK');
          const callbackUrl = new URL(`http://127.0.0.1:${stateData.callbackPort}/callback`);
          callbackUrl.searchParams.set('error', 'token_limit');
          callbackUrl.searchParams.set('state', stateData.cliState!);
          res.redirect(callbackUrl.toString());
          return;
        }
        await client.query(
          `INSERT INTO api_tokens (user_id, name, token_hash, token_prefix, scopes, expires_at)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [user.id, 'openclaw-cli', hash, prefix,
           ['agents:read', 'agents:write', 'keys:read', 'keys:write', 'profile:read'],
           expiresAt]
        );
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }

      const callbackUrl = new URL(`http://127.0.0.1:${stateData.callbackPort}/callback`);
      callbackUrl.searchParams.set('token', rawToken);
      callbackUrl.searchParams.set('state', stateData.cliState!);
      res.redirect(callbackUrl.toString());
      return;
    }

    // ── Web flow: redirect to frontend ──
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const redirectPath = profile ? `/${profile.username}` : '/setup';
    res.redirect(`${frontendUrl}${redirectPath}`);
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

/**
 * GET /auth/session
 * 
 * Get current session info
 */
authRouter.get('/session', async (req: Request, res: Response): Promise<void> => {
  try {
    const sessionToken = parseSessionCookie(req.headers.cookie || null);
    const db: Database = req.app.locals.db;

    if (!sessionToken) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const result = await db.getUserWithProfileBySession(sessionToken);

    if (!result) {
      res.status(401).json({ error: 'Invalid session' });
      return;
    }

    const { user, profile } = result;

    res.json({
      user: {
        id: user.id,
        email: user.email,
        github_username: user.github_username,
        avatar_url: user.avatar_url,
      },
      profile: {
        username: profile.username,
        client_name: profile.client_name,
      },
    });
  } catch (error) {
    console.error('Session check error:', error);
    res.status(500).json({ error: 'Failed to check session' });
  }
});

/**
 * GET /auth/success
 * 
 * Success page after OAuth login
 */
authRouter.get('/success', async (req: Request, res: Response): Promise<void> => {
  try {
    const sessionToken = parseSessionCookie(req.headers.cookie || null);
    const db: Database = req.app.locals.db;

    if (!sessionToken) {
      res.status(401).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Not Authenticated - OpenBotAuth</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
            .error { background: #fee; border: 2px solid #fcc; border-radius: 8px; padding: 20px; }
          </style>
        </head>
        <body>
          <div class="error">
            <h1>❌ Not Authenticated</h1>
            <p>Please <a href="/auth/github">log in with GitHub</a> first.</p>
          </div>
        </body>
        </html>
      `);
      return;
    }

    const result = await db.getUserWithProfileBySession(sessionToken);

    if (!result) {
      res.status(401).send('Invalid session');
      return;
    }

    const { user, profile } = result;

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Welcome - OpenBotAuth</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            max-width: 800px;
            margin: 50px auto;
            padding: 20px;
            background: #f5f5f5;
          }
          .container {
            background: white;
            border-radius: 12px;
            padding: 40px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          }
          .success {
            background: #d4edda;
            border: 2px solid #c3e6cb;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 30px;
          }
          .user-info {
            background: #f8f9fa;
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
          }
          .user-info h3 {
            margin-top: 0;
            color: #495057;
          }
          .user-info p {
            margin: 10px 0;
            color: #6c757d;
          }
          .next-steps {
            background: #fff3cd;
            border: 2px solid #ffeaa7;
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
          }
          .next-steps h3 {
            margin-top: 0;
            color: #856404;
          }
          .next-steps ol {
            margin: 10px 0;
            padding-left: 20px;
          }
          .next-steps li {
            margin: 10px 0;
            color: #856404;
          }
          code {
            background: #f4f4f4;
            padding: 2px 6px;
            border-radius: 4px;
            font-family: 'Monaco', 'Courier New', monospace;
            font-size: 0.9em;
          }
          pre {
            background: #2d2d2d;
            color: #f8f8f2;
            padding: 15px;
            border-radius: 8px;
            overflow-x: auto;
            font-size: 0.9em;
          }
          .api-links {
            margin: 20px 0;
          }
          .api-links a {
            display: inline-block;
            margin: 5px 10px 5px 0;
            padding: 10px 20px;
            background: #007bff;
            color: white;
            text-decoration: none;
            border-radius: 6px;
            transition: background 0.2s;
          }
          .api-links a:hover {
            background: #0056b3;
          }
          .logout {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #dee2e6;
          }
          .logout a {
            color: #dc3545;
            text-decoration: none;
          }
          .logout a:hover {
            text-decoration: underline;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="success">
            <h1>✅ Successfully Authenticated!</h1>
            <p>You've successfully logged in with GitHub OAuth.</p>
          </div>

          <div class="user-info">
            <h3>👤 Your Profile</h3>
            <p><strong>GitHub Username:</strong> ${user.github_username || 'N/A'}</p>
            <p><strong>Email:</strong> ${user.email || 'N/A'}</p>
            <p><strong>Username:</strong> ${profile.username}</p>
            <p><strong>User ID:</strong> ${user.id}</p>
          </div>

          <div class="next-steps">
            <h3>🚀 Next Steps</h3>
            <ol>
              <li><strong>Create an Agent</strong> - Use the CLI to create your first agent with Ed25519 keys</li>
              <li><strong>Get JWKS</strong> - Access your public keys via JWKS endpoints</li>
              <li><strong>Test Activity Logging</strong> - Log agent activity to the database</li>
            </ol>
          </div>

          <h3>📡 API Endpoints</h3>
          <div class="api-links">
            <a href="/auth/session" target="_blank">View Session</a>
            <a href="/jwks/${profile.username}.json" target="_blank">Your JWKS</a>
          </div>

          <h3>🔧 Using the CLI</h3>
          <p>Install the CLI globally and create your first agent:</p>
          <pre>cd /Users/hammadtariq/go/src/github.com/hammadtq/openbotauth/packages/registry-cli
pnpm link --global

# Create an agent (you'll need your session token)
openbot create --session YOUR_SESSION_TOKEN

# List your agents
openbot list --session YOUR_SESSION_TOKEN</pre>

          <h3>🍪 Your Session Token</h3>
          <p>Your session is stored in a cookie. To use the CLI, extract your session token from the browser cookies:</p>
          <ol>
            <li>Open browser DevTools (F12)</li>
            <li>Go to Application → Cookies → http://localhost:8080</li>
            <li>Copy the value of the <code>session</code> cookie</li>
            <li>Use it with the CLI commands above</li>
          </ol>

          <h3>📚 Documentation</h3>
          <ul>
            <li><a href="https://github.com/hammadtq/openbotauth" target="_blank">Project README</a></li>
            <li>QUICKSTART.md - Setup guide</li>
            <li>GITHUB_OAUTH_SETUP.md - OAuth configuration</li>
            <li>docs/ARCHITECTURE.md - System architecture</li>
          </ul>

          <div class="logout">
            <p><a href="#" onclick="logout(); return false;">🚪 Logout</a></p>
          </div>
        </div>

        <script>
          async function logout() {
            try {
              await fetch('/auth/logout', { method: 'POST' });
              window.location.href = '/auth/github';
            } catch (error) {
              console.error('Logout failed:', error);
              alert('Logout failed. Please try again.');
            }
          }
        </script>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Success page error:', error);
    res.status(500).send('Failed to load success page');
  }
});

/**
 * POST /auth/logout
 * 
 * Logout and delete session
 */
authRouter.post('/logout', async (req, res) => {
  try {
    const sessionToken = parseSessionCookie(req.headers.cookie || null);
    const db: Database = req.app.locals.db;

    if (sessionToken) {
      await db.deleteSession(sessionToken);
    }

    const cookie = deleteSessionCookie();
    res.setHeader('Set-Cookie', cookie);

    res.json({ success: true });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
});
