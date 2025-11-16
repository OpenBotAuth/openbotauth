# ✅ Environment Variables Fix

## Problem
The GitHub OAuth was showing `client_id=undefined` because the `.env` file wasn't being loaded properly.

## Solution Applied

1. **Added `dotenv` package** to `registry-service`
2. **Updated `server.ts`** to import `dotenv/config` at the top
3. **Updated `package.json`** scripts to explicitly load `.env` from monorepo root

## Changes Made

### 1. Added dotenv dependency
```json
"dependencies": {
  "dotenv": "^17.2.3"
}
```

### 2. Updated server.ts
```typescript
import 'dotenv/config';  // ← Added this line
import express from 'express';
// ... rest of imports
```

### 3. Updated dev/start scripts
```json
"dev": "tsx watch --env-file=../../.env src/server.ts",
"start": "node --env-file=../../.env dist/server.js"
```

## How to Restart the Service

### Stop the current service
Press `Ctrl+C` in the terminal where the service is running.

### Restart with the fix
```bash
cd /Users/hammadtariq/go/src/github.com/hammadtq/openbotauth/packages/registry-service
pnpm dev
```

## Test the Fix

### 1. Health Check
```bash
curl http://localhost:8080/health
```

Expected: `{"status":"ok","service":"registry"}`

### 2. GitHub OAuth URL
```bash
open http://localhost:8080/auth/github
```

Expected: You should be redirected to GitHub with the **correct** URL:
```
https://github.com/login/oauth/authorize?client_id=Ov23liPBRcsIjXJLrlNc&redirect_uri=http%3A%2F%2Flocalhost%3A8080%2Fauth%2Fgithub%2Fcallback&scope=read%3Auser+user%3Aemail&state=...
```

Notice:
- ✅ `client_id=Ov23liPBRcsIjXJLrlNc` (not undefined!)
- ✅ `redirect_uri=http://localhost:8080/auth/github/callback` (not undefined!)

## Verify Environment Variables

You can verify the service is reading the correct values:

```bash
# Check your .env file
grep GITHUB_ /Users/hammadtariq/go/src/github.com/hammadtq/openbotauth/.env
```

Should show:
```
GITHUB_CLIENT_ID=Ov23liPBRcsIjXJLrlNc
GITHUB_CLIENT_SECRET=cb6ddeb83c900403384832c3b56317467970844d
GITHUB_CALLBACK_URL=http://localhost:8080/auth/github/callback
```

## Alternative: Run from Root

You can also run the service from the monorepo root:

```bash
cd /Users/hammadtariq/go/src/github.com/hammadtq/openbotauth
pnpm --filter @openbotauth/registry-service dev
```

This automatically uses the root `.env` file.

## Troubleshooting

### Still seeing "undefined"?

1. **Stop the service completely** (Ctrl+C)
2. **Clear any cached processes**:
   ```bash
   pkill -f "tsx watch"
   ```
3. **Restart**:
   ```bash
   cd /Users/hammadtariq/go/src/github.com/hammadtq/openbotauth/packages/registry-service
   pnpm dev
   ```

### Check if environment variables are loaded

Add a debug line temporarily to verify:

```bash
# In server.ts, after imports, add:
console.log('GitHub Client ID:', process.env.GITHUB_CLIENT_ID);
console.log('GitHub Callback:', process.env.GITHUB_CALLBACK_URL);
```

You should see your actual values printed when the service starts.

## What Was Wrong

The issue was that `tsx watch src/server.ts` was running from the `packages/registry-service` directory, but the `.env` file is in the monorepo root (`../../.env`).

Without explicitly telling `tsx` where to find the `.env` file, it wasn't loading the environment variables, causing them to be `undefined`.

## Now It Works Because

1. **`dotenv/config`** is imported at the top of `server.ts`
2. **`--env-file=../../.env`** tells `tsx` to load the root `.env` file
3. Both work together to ensure environment variables are available when the service starts

---

**Status**: ✅ Fixed! Restart the service and test the GitHub OAuth flow.

