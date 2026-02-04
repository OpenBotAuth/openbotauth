/**
 * API Client for OpenBotAuth Registry Service
 * Replaces Supabase client with direct API calls
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

export interface User {
  id: string;
  email: string | null;
  github_username: string | null;
  avatar_url: string | null;
}

export interface Profile {
  id: string;
  username: string;
  client_name: string | null;
  client_uri: string | null;
  logo_uri: string | null;
  contacts: string[] | null;
  expected_user_agent: string | null;
  rfc9309_product_token: string | null;
  rfc9309_compliance: string[] | null;
  trigger: string | null;
  purpose: string | null;
  targeted_content: string[] | null;
  rate_control: string | null;
  rate_expectation: string | null;
  known_urls: string[] | null;
  github_username: string | null;
}

export interface Agent {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  agent_type: string;
  status: string;
  public_key: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ApiToken {
  id: string;
  name: string;
  token_prefix: string;
  scopes: string[];
  expires_at: string;
  last_used_at: string | null;
  created_at: string;
}

export interface CreateTokenResponse extends ApiToken {
  token: string; // raw token, returned exactly once
}

export interface Session {
  user: User;
  profile: Profile;
}

// Radar types
export interface RadarOverview {
  window: 'today' | '7d';
  signed: number;
  verified: number;
  failed: number;
  unique_origins: number;
  unique_agents: number;
}

export interface TimeseriesPoint {
  date: string;
  count: number;
}

export interface TimeseriesResponse {
  metric: 'signed' | 'verified' | 'failed';
  window: string;
  points: TimeseriesPoint[];
}

export interface TopAgent {
  agent_id: string;
  client_name: string | null;
  verified_count: number;
  failed_count: number;
}

export interface TopOrigin {
  origin: string;
  verified_count: number;
  failed_count: number;
}

class RegistryAPI {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  private async fetch(path: string, options: RequestInit = {}): Promise<Response> {
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      ...options,
      credentials: 'include', // Include cookies
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    return response;
  }

  /**
   * Get current session
   */
  async getSession(): Promise<Session | null> {
    try {
      const response = await this.fetch('/auth/session');
      if (!response.ok) {
        return null;
      }
      return await response.json();
    } catch (error) {
      console.error('Session fetch error:', error);
      return null;
    }
  }

  /**
   * Logout
   */
  async logout(): Promise<void> {
    await this.fetch('/auth/logout', { method: 'POST' });
  }

  /**
   * Get all profiles (public registry)
   */
  async getAllProfiles(): Promise<{ username: string; created_at: string }[]> {
    try {
      const response = await this.fetch('/profiles');
      if (!response.ok) {
        return [];
      }
      return await response.json();
    } catch (error) {
      console.error('Get all profiles error:', error);
      return [];
    }
  }

  /**
   * Get user profile by username
   */
  async getProfileByUsername(username: string): Promise<Profile | null> {
    try {
      // We'll need to add this endpoint to the registry service
      const response = await this.fetch(`/profiles/${username}`);
      if (!response.ok) {
        return null;
      }
      return await response.json();
    } catch (error) {
      console.error('Profile fetch error:', error);
      return null;
    }
  }

  /**
   * Update profile
   */
  async updateProfile(updates: Partial<Profile>): Promise<Profile> {
    const response = await this.fetch('/profiles', {
      method: 'PUT',
      body: JSON.stringify(updates),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || 'Failed to update profile');
    }

    return await response.json();
  }

  /**
   * List agents for current user
   */
  async listAgents(): Promise<Agent[]> {
    const response = await this.fetch('/agents');
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || 'Failed to list agents');
    }

    return await response.json();
  }

  /**
   * Get agent by ID
   */
  async getAgent(agentId: string): Promise<Agent> {
    const response = await this.fetch(`/agents/${agentId}`);
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || 'Failed to get agent');
    }

    return await response.json();
  }

  /**
   * Create agent
   */
  async createAgent(data: {
    name: string;
    description?: string;
    agent_type: string;
    public_key: Record<string, unknown>;
  }): Promise<Agent> {
    const response = await this.fetch('/agents', {
      method: 'POST',
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || 'Failed to create agent');
    }

    return await response.json();
  }

  /**
   * Update agent
   */
  async updateAgent(agentId: string, updates: Partial<Agent>): Promise<Agent> {
    const response = await this.fetch(`/agents/${agentId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || 'Failed to update agent');
    }

    return await response.json();
  }

  /**
   * Log agent activity
   */
  async logActivity(data: {
    agent_id: string;
    target_url: string;
    method: string;
    status_code: number;
    response_time_ms?: number;
  }): Promise<void> {
    const response = await this.fetch('/agent-activity', {
      method: 'POST',
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || 'Failed to log activity');
    }
  }

  /**
   * Get agent activity
   */
  async getAgentActivity(agentId: string, limit = 100, offset = 0): Promise<any[]> {
    const response = await this.fetch(`/agent-activity/${agentId}?limit=${limit}&offset=${offset}`);
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || 'Failed to get activity');
    }

    const data = await response.json();
    return data.activity || [];
  }

  /**
   * Get JWKS URL for agent
   */
  getAgentJWKSUrl(agentId: string): string {
    return `${this.baseUrl}/agent-jwks/${agentId}`;
  }

  /**
   * Get JWKS URL for user
   */
  getUserJWKSUrl(username: string): string {
    return `${this.baseUrl}/jwks/${username}.json`;
  }

  /**
   * GitHub OAuth login URL
   */
  getGitHubLoginUrl(): string {
    return `${this.baseUrl}/auth/github`;
  }

  /**
   * Register or update public key
   */
  async registerPublicKey(publicKey: string, isUpdate = false): Promise<void> {
    const response = await this.fetch('/keys', {
      method: 'POST',
      body: JSON.stringify({ public_key: publicKey, is_update: isUpdate }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || 'Failed to register public key');
    }
  }

  /**
   * Get current user's public key
   */
  async getPublicKey(): Promise<{ public_key: string } | null> {
    try {
      const response = await this.fetch('/keys');
      if (!response.ok) {
        return null;
      }
      return await response.json();
    } catch (error) {
      console.error('Get public key error:', error);
      return null;
    }
  }

  /**
   * Get key history
   */
  async getKeyHistory(): Promise<any[]> {
    try {
      const response = await this.fetch('/keys/history');
      if (!response.ok) {
        return [];
      }
      return await response.json();
    } catch (error) {
      console.error('Get key history error:', error);
      return [];
    }
  }

  /**
   * Get telemetry stats for a user
   */
  async getUserTelemetry(username: string): Promise<{
    username: string;
    last_seen: string | null;
    request_volume: number;
    site_diversity: number;
    karma_score: number;
    is_public?: boolean;
  }> {
    const response = await this.fetch(`/telemetry/${username}`);
    if (!response.ok) {
      throw new Error('Failed to fetch telemetry');
    }
    return await response.json();
  }

  /**
   * Update telemetry visibility (public/private)
   */
  async updateTelemetryVisibility(username: string, isPublic: boolean): Promise<void> {
    const response = await this.fetch(`/telemetry/${username}/visibility`, {
      method: 'PUT',
      body: JSON.stringify({ is_public: isPublic }),
    });
    
    if (!response.ok) {
      throw new Error('Failed to update telemetry visibility');
    }
  }

  // ==========================================================================
  // Radar API Methods (Global ecosystem telemetry)
  // ==========================================================================

  /**
   * Get Radar overview stats
   */
  async getRadarOverview(window: 'today' | '7d' = '7d'): Promise<RadarOverview> {
    const response = await this.fetch(`/telemetry/overview?window=${window}`);
    if (!response.ok) {
      throw new Error('Failed to fetch radar overview');
    }
    return await response.json();
  }

  /**
   * Get Radar timeseries data
   */
  async getRadarTimeseries(
    metric: 'signed' | 'verified' | 'failed' = 'verified',
    window: '7d' | 'today' = '7d'
  ): Promise<TimeseriesResponse> {
    const response = await this.fetch(`/telemetry/timeseries?metric=${metric}&window=${window}`);
    if (!response.ok) {
      throw new Error('Failed to fetch radar timeseries');
    }
    return await response.json();
  }

  /**
   * Get top agents by verified count
   */
  async getTopAgents(window: '7d' | 'today' = '7d', limit: number = 20): Promise<TopAgent[]> {
    const response = await this.fetch(`/telemetry/top/agents?window=${window}&limit=${limit}`);
    if (!response.ok) {
      throw new Error('Failed to fetch top agents');
    }
    return await response.json();
  }

  /**
   * Get top origins by request count
   */
  async getTopOrigins(window: '7d' | 'today' = '7d', limit: number = 20): Promise<TopOrigin[]> {
    const response = await this.fetch(`/telemetry/top/origins?window=${window}&limit=${limit}`);
    if (!response.ok) {
      throw new Error('Failed to fetch top origins');
    }
    return await response.json();
  }

  // ==========================================================================
  // Personal Access Token (PAT) Methods
  // ==========================================================================

  /**
   * List all tokens for the current user
   */
  async listTokens(): Promise<ApiToken[]> {
    const response = await this.fetch('/auth/tokens');
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || 'Failed to list tokens');
    }
    return await response.json();
  }

  /**
   * Create a new personal access token
   */
  async createToken(data: {
    name: string;
    scopes: string[];
    expires_in_days?: number;
  }): Promise<CreateTokenResponse> {
    const response = await this.fetch('/auth/tokens', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || 'Failed to create token');
    }
    return await response.json();
  }

  /**
   * Delete (revoke) a token
   */
  async deleteToken(tokenId: string): Promise<void> {
    const response = await this.fetch(`/auth/tokens/${tokenId}`, { method: 'DELETE' });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || 'Failed to delete token');
    }
  }
}

export const api = new RegistryAPI();

