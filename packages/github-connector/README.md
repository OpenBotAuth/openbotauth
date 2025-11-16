# @openbotauth/github-connector

GitHub OAuth connector for OpenBotAuth, backed by Neon Postgres.

Replaces Supabase Auth with a custom implementation that stores users, profiles, and sessions in Neon.

## Features

- GitHub OAuth 2.0 flow
- Session management with secure tokens
- User and profile management
- Database operations via pg (PostgreSQL)
- No external auth service dependencies

## Installation

```bash
pnpm add @openbotauth/github-connector pg
```

## Usage

### Setup

```typescript
import { Pool } from 'pg';
import { GitHubOAuth, Database } from '@openbotauth/github-connector';

// Initialize database connection
const pool = new Pool({
  connectionString: process.env.NEON_DATABASE_URL,
});

const db = new Database(pool);

// Initialize GitHub OAuth
const oauth = new GitHubOAuth({
  clientId: process.env.GITHUB_CLIENT_ID!,
  clientSecret: process.env.GITHUB_CLIENT_SECRET!,
  callbackUrl: process.env.GITHUB_CALLBACK_URL!,
});
```

### OAuth Flow

#### 1. Initiate OAuth

```typescript
import { generateSessionToken } from '@openbotauth/github-connector';

// Generate state for CSRF protection
const state = oauth.generateState();

// Store state in temporary storage (Redis, session, etc.)
await redis.set(`oauth:state:${state}`, 'pending', 'EX', 600);

// Get authorization URL
const authUrl = oauth.getAuthorizationUrl(state);

// Redirect user to GitHub
res.redirect(authUrl);
```

#### 2. Handle Callback

```typescript
import { 
  generateSessionToken, 
  getSessionExpiration, 
  createSessionCookie 
} from '@openbotauth/github-connector';

// Verify state
const state = req.query.state as string;
const storedState = await redis.get(`oauth:state:${state}`);
if (!storedState) {
  throw new Error('Invalid state');
}

// Exchange code for user data
const code = req.query.code as string;
const githubUser = await oauth.handleCallback(code);

// Find or create user
let user = await db.findUserByGitHubId(githubUser.id.toString());

if (!user) {
  // Create new user
  user = await db.transaction(async (client) => {
    const newUser = await db.createUser(githubUser);
    
    // Create profile with username from GitHub
    await db.createProfile(newUser.id, githubUser.login);
    
    return newUser;
  });
} else {
  // Update existing user
  await db.updateUser(user.id, {
    email: githubUser.email,
    github_username: githubUser.login,
    avatar_url: githubUser.avatar_url,
  });
}

// Create session
const sessionToken = generateSessionToken();
const expiresAt = getSessionExpiration(30); // 30 days

await db.createSession(user.id, sessionToken, expiresAt);

// Set cookie
const cookie = createSessionCookie(sessionToken);
res.setHeader('Set-Cookie', cookie);

// Redirect to app
res.redirect('/dashboard');
```

### Session Management

#### Verify Session

```typescript
import { parseSessionCookie } from '@openbotauth/github-connector';

// Parse session from cookie
const sessionToken = parseSessionCookie(req.headers.cookie);

if (!sessionToken) {
  return res.status(401).json({ error: 'Not authenticated' });
}

// Get user and profile
const result = await db.getUserWithProfileBySession(sessionToken);

if (!result) {
  return res.status(401).json({ error: 'Invalid session' });
}

const { user, profile } = result;
```

#### Logout

```typescript
import { parseSessionCookie, deleteSessionCookie } from '@openbotauth/github-connector';

const sessionToken = parseSessionCookie(req.headers.cookie);

if (sessionToken) {
  await db.deleteSession(sessionToken);
}

const cookie = deleteSessionCookie();
res.setHeader('Set-Cookie', cookie);
res.json({ success: true });
```

#### Clean Up Expired Sessions

```typescript
// Run periodically (e.g., via cron job)
const deletedCount = await db.deleteExpiredSessions();
console.log(`Deleted ${deletedCount} expired sessions`);
```

### Database Operations

#### User Operations

```typescript
// Find user
const user = await db.findUserByGitHubId('12345');
const user = await db.findUserById('uuid');

// Create user
const user = await db.createUser(githubUser);

// Update user
const user = await db.updateUser(userId, {
  email: 'new@example.com',
  avatar_url: 'https://...',
});
```

#### Profile Operations

```typescript
// Find profile
const profile = await db.findProfileByUserId(userId);
const profile = await db.findProfileByUsername('mybot');

// Create profile
const profile = await db.createProfile(userId, 'mybot');

// Update profile
const profile = await db.updateProfile(userId, {
  client_name: 'My Bot',
  client_uri: 'https://example.com',
  rfc9309_compliance: ['User-Agent'],
});
```

## API Reference

### GitHubOAuth

#### `constructor(config: OAuthConfig)`

Initialize GitHub OAuth client.

```typescript
interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
}
```

#### `generateState(): string`

Generate a secure state parameter for CSRF protection.

#### `getAuthorizationUrl(state: string, scopes?: string[]): string`

Get the GitHub authorization URL.

Default scopes: `['read:user', 'user:email']`

#### `getAccessToken(code: string): Promise<string>`

Exchange authorization code for access token.

#### `getUser(accessToken: string): Promise<GitHubUser>`

Get GitHub user information.

#### `handleCallback(code: string): Promise<GitHubUser>`

Complete OAuth flow (exchange code + get user).

### Database

#### User Methods

- `findUserByGitHubId(githubId: string): Promise<User | null>`
- `findUserById(userId: string): Promise<User | null>`
- `createUser(githubUser: GitHubUser): Promise<User>`
- `updateUser(userId: string, updates: Partial<User>): Promise<User>`

#### Profile Methods

- `findProfileByUserId(userId: string): Promise<Profile | null>`
- `findProfileByUsername(username: string): Promise<Profile | null>`
- `createProfile(userId: string, username: string): Promise<Profile>`
- `updateProfile(userId: string, updates: Partial<Profile>): Promise<Profile>`

#### Session Methods

- `createSession(userId: string, token: string, expiresAt: Date): Promise<Session>`
- `findSessionByToken(token: string): Promise<Session | null>`
- `deleteSession(token: string): Promise<void>`
- `deleteExpiredSessions(): Promise<number>`
- `getUserWithProfileBySession(token: string): Promise<{user: User, profile: Profile} | null>`

#### Transaction Helper

- `transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T>`

### Session Utilities

- `generateSessionToken(): string` - Generate secure token
- `getSessionExpiration(days?: number): Date` - Get expiration date
- `parseSessionCookie(cookieHeader: string | null, name?: string): string | null`
- `createSessionCookie(token: string, options?: {...}): string`
- `deleteSessionCookie(name?: string, path?: string): string`

## Environment Variables

```bash
NEON_DATABASE_URL=postgresql://user:password@host.neon.tech/dbname?sslmode=require
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
GITHUB_CALLBACK_URL=http://localhost:8080/auth/github/callback
```

## GitHub OAuth App Setup

1. Go to GitHub Settings → Developer settings → OAuth Apps
2. Click "New OAuth App"
3. Fill in:
   - Application name: OpenBotAuth
   - Homepage URL: http://localhost:8080
   - Authorization callback URL: http://localhost:8080/auth/github/callback
4. Save Client ID and Client Secret to your `.env` file

## Security Considerations

- Always use HTTPS in production
- Set `secure: true` for cookies in production
- Implement rate limiting on OAuth endpoints
- Validate state parameter to prevent CSRF
- Store client secret securely (never commit to git)
- Regularly clean up expired sessions
- Use `httpOnly` cookies to prevent XSS attacks

## License

MIT

