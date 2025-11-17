/**
 * A2A Agent Card Types
 */

export interface AgentCardConfig {
  jwksUrl: string;
  mcpUrl: string;
  a2aUrl: string;
  enableA2A: boolean;
  contact?: string;
  docsUrl?: string;
  sigAlgs?: string[];
}

export interface AgentCard {
  schema: 'a2a-agent-card';
  version: string;
  agent: {
    name: string;
    version: string;
  };
  endpoints: {
    mcp: string;
    a2a: string | null;
  };
  experimental: {
    a2a: boolean;
  };
  auth: {
    'http-signatures': {
      'signature-agent': string;
      alg: string[];
    };
  };
  capabilities: string[];
  metadata: {
    contact: string;
    docs: string;
    updated_at: string;
  };
}

export interface TaskCreateResponse {
  task_id: string;
  status: 'pending';
  created_at: string;
}

export interface ExperimentalResponse {
  experimental: true;
  message: string;
}

