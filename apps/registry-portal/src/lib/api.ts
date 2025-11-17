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

export interface Session {
  user: User;
  profile: Profile;
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
}

export const api = new RegistryAPI();

