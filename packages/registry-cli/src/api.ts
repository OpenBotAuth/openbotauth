/**
 * API client for registry service
 */

export interface Agent {
  id: string;
  name: string;
  description: string | null;
  agent_type: string;
  status: string;
  public_key: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Session {
  user: {
    id: string;
    github_username: string | null;
    avatar_url: string | null;
  };
  profile: {
    username: string;
    client_name: string | null;
  } | null;
}

export class RegistryAPI {
  constructor(
    private baseUrl: string,
    private sessionToken?: string
  ) {}

  private async fetch(path: string, options: RequestInit = {}): Promise<any> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };

    if (this.sessionToken) {
      headers['Cookie'] = `session=${this.sessionToken}`;
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText })) as { error?: string };
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  async createAgent(data: {
    name: string;
    description?: string;
    agent_type: string;
    public_key: Record<string, unknown>;
  }): Promise<Agent> {
    return this.fetch('/agents', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async listAgents(): Promise<Agent[]> {
    return this.fetch('/agents');
  }

  async getAgent(agentId: string): Promise<Agent> {
    return this.fetch(`/agents/${agentId}`);
  }

  async updateAgent(agentId: string, data: Partial<Agent>): Promise<Agent> {
    return this.fetch(`/agents/${agentId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async getSession(): Promise<Session> {
    return this.fetch('/auth/session');
  }

  getUserJWKSUrl(username: string): string {
    return `${this.baseUrl}/jwks/${username}.json`;
  }
}

