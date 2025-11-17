# OpenBotAuth Registry Portal

Web UI for OpenBotAuth registry - agent and key management interface.

## Overview

The Registry Portal is a React-based web application that provides a user-friendly interface for:

- **GitHub OAuth Login** - Authenticate with your GitHub account
- **Agent Management** - Create, view, update, and delete agents
- **Key Generation** - Generate Ed25519 key pairs in the browser
- **JWKS Access** - View and access your public key endpoints
- **Activity Monitoring** - Track agent HTTP activity
- **Profile Management** - Update your profile and metadata

## Technology Stack

- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **Tailwind CSS** - Styling
- **shadcn/ui** - UI components
- **React Router** - Client-side routing
- **Tanstack Query** - Data fetching and caching
- **Lucide React** - Icons

## Architecture

The portal communicates with the `registry-service` backend via REST API:

```
Browser (React App) → Vite Dev Server (Proxy) → Registry Service (Express)
                                                         ↓
                                                   Neon Database
```

### API Proxy

The Vite dev server proxies API requests to avoid CORS issues:

- `/auth/*` → `http://localhost:8080/auth/*`
- `/agents/*` → `http://localhost:8080/agents/*`
- `/jwks/*` → `http://localhost:8080/jwks/*`
- `/agent-jwks/*` → `http://localhost:8080/agent-jwks/*`
- `/agent-activity/*` → `http://localhost:8080/agent-activity/*`
- `/profiles/*` → `http://localhost:8080/profiles/*`

## Setup

### Prerequisites

1. **Registry Service** must be running on `http://localhost:8080`
2. **Neon Database** must be migrated and accessible
3. **GitHub OAuth** must be configured

### Install Dependencies

```bash
cd /path/to/openbotauth
pnpm install
```

### Start Development Server

```bash
# From monorepo root
pnpm dev:portal

# Or from portal directory
cd apps/registry-portal
pnpm dev
```

The portal will be available at: **http://localhost:5173**

## Features

### 1. Authentication

- **GitHub OAuth Login** - Secure authentication via GitHub
- **Session Management** - Cookie-based sessions
- **Auto-redirect** - Redirect to login if not authenticated

### 2. Agent Management

- **Create Agents** - Generate new agents with Ed25519 keys
- **List Agents** - View all your registered agents
- **Update Agents** - Modify agent details and rotate keys
- **Delete Agents** - Remove agents you no longer need

### 3. Key Generation

- **Browser-based** - Generate Ed25519 keys using Web Crypto API
- **Secure** - Private keys never leave your browser
- **JWK Format** - Keys are in standard JSON Web Key format
- **Download** - Save private keys securely

### 4. JWKS Endpoints

- **User JWKS** - `http://localhost:8080/jwks/{username}.json`
- **Agent JWKS** - `http://localhost:8080/agent-jwks/{agent_id}`
- **Copy URLs** - Easy copy-to-clipboard functionality

### 5. Activity Monitoring

- **View Activity** - See all HTTP requests made by your agents
- **Filtering** - Filter by agent, date, status code
- **Metrics** - Response times, success rates, etc.

## Project Structure

```
apps/registry-portal/
├── src/
│   ├── components/          # React components
│   │   ├── ui/             # shadcn/ui components
│   │   ├── AddAgentModal.tsx
│   │   └── NavLink.tsx
│   ├── pages/              # Page components
│   │   ├── Index.tsx       # Home/dashboard
│   │   ├── Login.tsx       # GitHub OAuth login
│   │   ├── Setup.tsx       # Key setup page
│   │   ├── MyAgents.tsx    # Agent list
│   │   ├── AgentDetail.tsx # Agent details
│   │   ├── EditProfile.tsx # Profile editor
│   │   └── ...
│   ├── lib/                # Utilities
│   │   ├── api.ts          # API client
│   │   └── utils.ts        # Helper functions
│   ├── hooks/              # Custom React hooks
│   ├── App.tsx             # Main app component
│   └── main.tsx            # Entry point
├── public/                 # Static assets
├── index.html              # HTML template
├── vite.config.ts          # Vite configuration
├── tailwind.config.ts      # Tailwind configuration
├── tsconfig.json           # TypeScript configuration
└── package.json            # Dependencies
```

## API Client

The portal uses a custom API client (`src/lib/api.ts`) that replaces the old Supabase client:

```typescript
import { api } from '@/lib/api';

// Get session
const session = await api.getSession();

// List agents
const agents = await api.listAgents();

// Create agent
const agent = await api.createAgent({
  name: 'My Bot',
  agent_type: 'crawler',
  public_key: jwk,
});
```

## Migration from openbotregistry

This portal is migrated from the original `openbotregistry` Vite UI with the following changes:

### Removed
- ❌ Supabase client (`@supabase/supabase-js`)
- ❌ Supabase integration directory
- ❌ Direct database queries

### Added
- ✅ Custom API client (`lib/api.ts`)
- ✅ Session middleware integration
- ✅ Proxy configuration in Vite
- ✅ Integration with `@openbotauth/registry-signer`

### Updated
- ✅ All API calls now go through the registry service
- ✅ Authentication uses session cookies instead of Supabase auth
- ✅ Key generation uses shared `registry-signer` module

## Development

### Start Both Services

```bash
# Terminal 1: Start registry service
pnpm dev:service

# Terminal 2: Start portal
pnpm dev:portal
```

### Build for Production

```bash
# Build all packages first
pnpm build

# Build portal
pnpm --filter @openbotauth/registry-portal build

# Preview production build
cd apps/registry-portal
pnpm preview
```

### Linting

```bash
cd apps/registry-portal
pnpm lint
```

## Environment Variables

Create a `.env` file in the portal directory (optional):

```bash
# API base URL (defaults to http://localhost:8080)
VITE_API_URL=http://localhost:8080
```

## Troubleshooting

### "Cannot connect to registry service"

**Problem**: Portal can't reach the API

**Solution**:
1. Ensure registry service is running on port 8080
2. Check Vite proxy configuration in `vite.config.ts`
3. Verify CORS settings in registry service

### "Not authenticated" errors

**Problem**: Session not being passed

**Solution**:
1. Check that cookies are enabled in your browser
2. Verify session middleware is running in registry service
3. Try logging in again via `/auth/github`

### Build errors

**Problem**: TypeScript or dependency errors

**Solution**:
```bash
# Clean and reinstall
cd apps/registry-portal
rm -rf node_modules dist
cd ../..
pnpm install
pnpm build:all
```

## Next Steps

- [ ] Add real-time updates with WebSockets
- [ ] Implement agent activity charts
- [ ] Add bulk operations for agents
- [ ] Create agent templates
- [ ] Add export/import functionality
- [ ] Implement dark mode toggle
- [ ] Add more profile customization options

## Contributing

This is part of the OpenBotAuth monorepo. See the main README for contribution guidelines.

## License

MIT

