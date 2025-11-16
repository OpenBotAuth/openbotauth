# GitHub OAuth App Setup Guide

## Step-by-Step Instructions

### 1. Go to GitHub Developer Settings

Open your browser and navigate to:
```
https://github.com/settings/developers
```

Or manually:
1. Click your profile picture (top right)
2. Click **Settings**
3. Scroll down to **Developer settings** (bottom of left sidebar)
4. Click **OAuth Apps**

### 2. Create New OAuth App

Click the **"New OAuth App"** button (or **"Register a new application"**)

### 3. Fill in Application Details

#### For Local Development:

| Field | Value |
|-------|-------|
| **Application name** | `OpenBotAuth Local Dev` |
| **Homepage URL** | `http://localhost:8080` |
| **Application description** | `OpenBotAuth registry service for local development` (optional) |
| **Authorization callback URL** | `http://localhost:8080/auth/github/callback` |

⚠️ **IMPORTANT**: The callback URL must match **exactly** - including the protocol (`http://`), port (`:8080`), and path (`/auth/github/callback`)

### 4. Register the Application

Click **"Register application"**

### 5. Get Your Credentials

After registration, you'll see:

1. **Client ID** - A string like `Iv1.a1b2c3d4e5f6g7h8`
2. **Client secrets** section with a **"Generate a new client secret"** button

Click **"Generate a new client secret"** and copy it immediately (you won't be able to see it again!)

### 6. Update Your .env File

Open `/Users/hammadtariq/go/src/github.com/hammadtq/openbotauth/.env` and update:

```bash
GITHUB_CLIENT_ID=Iv1.a1b2c3d4e5f6g7h8
GITHUB_CLIENT_SECRET=your_generated_secret_here_very_long_string
```

### 7. Verify Configuration

Your `.env` file should now look like:

```bash
# Neon Database Connection
NEON_DATABASE_URL=postgresql://neondb_owner:npg_OkmnSZFsM29g@ep-old-pine-a4y5hogq-pooler.us-east-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require

# Redis
REDIS_URL=redis://localhost:6379

# Registry Service
PORT=8080

# GitHub OAuth
GITHUB_CLIENT_ID=Iv1.a1b2c3d4e5f6g7h8
GITHUB_CLIENT_SECRET=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
GITHUB_CALLBACK_URL=http://localhost:8080/auth/github/callback

# Frontend
FRONTEND_URL=http://localhost:5173

# Session
SESSION_SECRET=change-this-to-a-long-random-string-in-production

# Environment
NODE_ENV=development
```

## Testing the OAuth Flow

### 1. Start the Registry Service

```bash
cd /Users/hammadtariq/go/src/github.com/hammadtq/openbotauth
pnpm install
pnpm build
cd packages/registry-service
pnpm dev
```

### 2. Test the OAuth Initiation

Open your browser and go to:
```
http://localhost:8080/auth/github
```

You should be redirected to GitHub's authorization page.

### 3. Authorize the Application

1. Review the permissions (read:user, user:email)
2. Click **"Authorize [your-username]"**
3. You'll be redirected back to `http://localhost:8080/auth/github/callback`
4. Then redirected to your frontend (or see a success message)

### 4. Verify Session

After successful login, check your session:

```bash
# Get the session cookie from your browser's developer tools
# Then test the session endpoint:
curl http://localhost:8080/auth/session \
  -H "Cookie: session=YOUR_SESSION_TOKEN_HERE"
```

You should see your user and profile information.

## For Production Deployment

### 1. Create a Separate OAuth App

Create a **new** OAuth app for production:

| Field | Value |
|-------|-------|
| **Application name** | `OpenBotAuth Production` |
| **Homepage URL** | `https://yourdomain.com` |
| **Authorization callback URL** | `https://yourdomain.com/auth/github/callback` |

### 2. Update Production Environment

Set environment variables on your hosting platform:

```bash
GITHUB_CLIENT_ID=your_production_client_id
GITHUB_CLIENT_SECRET=your_production_client_secret
GITHUB_CALLBACK_URL=https://yourdomain.com/auth/github/callback
NODE_ENV=production
```

### 3. Enable HTTPS

⚠️ **CRITICAL**: Always use HTTPS in production!

Update your production `.env`:
```bash
# Use HTTPS for callback
GITHUB_CALLBACK_URL=https://yourdomain.com/auth/github/callback

# Frontend should also use HTTPS
FRONTEND_URL=https://yourdomain.com
```

## Troubleshooting

### "The redirect_uri MUST match the registered callback URL"

**Problem**: Callback URL mismatch

**Solution**: 
1. Check your GitHub OAuth app settings
2. Ensure the callback URL is **exactly**: `http://localhost:8080/auth/github/callback`
3. No trailing slash
4. Correct protocol (http vs https)
5. Correct port

### "Bad credentials" or "Invalid client"

**Problem**: Wrong Client ID or Secret

**Solution**:
1. Double-check you copied the Client ID correctly
2. Regenerate the Client Secret if needed
3. Make sure there are no extra spaces in `.env`

### Session not persisting

**Problem**: Cookies not being set

**Solution**:
1. Check browser console for cookie errors
2. Ensure `SESSION_SECRET` is set in `.env`
3. For HTTPS, ensure `secure` flag is set correctly

### "Application suspended"

**Problem**: GitHub suspended your OAuth app

**Solution**:
1. Check your GitHub email for suspension notice
2. Review GitHub's OAuth app policies
3. Contact GitHub support if needed

## Security Best Practices

### 1. Keep Secrets Secret

- ❌ **NEVER** commit `.env` to git
- ❌ **NEVER** share Client Secret publicly
- ✅ Use environment variables
- ✅ Use secret management in production (AWS Secrets Manager, etc.)

### 2. Rotate Secrets Regularly

1. Generate new Client Secret in GitHub
2. Update production environment
3. Deploy changes
4. Revoke old secret

### 3. Limit Scopes

Only request the scopes you need:
- `read:user` - Read user profile
- `user:email` - Read user email

Don't request unnecessary permissions!

### 4. Monitor Usage

Check your OAuth app's usage in GitHub settings:
- Active installations
- API rate limits
- Suspicious activity

## Quick Reference

### URLs

- **GitHub OAuth Settings**: https://github.com/settings/developers
- **Local OAuth Initiate**: http://localhost:8080/auth/github
- **Local Callback**: http://localhost:8080/auth/github/callback
- **Session Check**: http://localhost:8080/auth/session

### Required Scopes

```
read:user user:email
```

### Callback URL Format

```
{protocol}://{host}:{port}/auth/github/callback
```

Examples:
- Local: `http://localhost:8080/auth/github/callback`
- Production: `https://api.yourdomain.com/auth/github/callback`

## Next Steps

After setting up GitHub OAuth:

1. ✅ Register OAuth app
2. ✅ Update `.env` file
3. ⏳ Start registry service
4. ⏳ Test OAuth flow
5. ⏳ Create your first agent
6. ⏳ Test JWKS endpoints

## Need Help?

- GitHub OAuth Documentation: https://docs.github.com/en/developers/apps/building-oauth-apps
- OpenBotAuth Setup Guide: `SETUP.md`
- Architecture Documentation: `docs/ARCHITECTURE.md`

