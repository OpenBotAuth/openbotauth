/**
 * Agent Card Template
 * Generates A2A agent card from configuration
 */

import { createHash } from 'crypto';
import type { AgentCard, AgentCardConfig } from './types.js';

/**
 * Generate agent card from configuration
 */
export function generateAgentCard(config: AgentCardConfig): AgentCard {
  const card: AgentCard = {
    schema: 'a2a-agent-card',
    version: '0.1.0-draft',
    agent: {
      name: 'OpenBotAuth Service',
      version: '0.1.0',
    },
    endpoints: {
      mcp: config.mcpUrl,
      a2a: config.enableA2A ? `${config.a2aUrl}/a2a` : null,
    },
    experimental: {
      a2a: config.enableA2A,
    },
    auth: {
      'http-signatures': {
        'signature-agent': config.jwksUrl,
        alg: config.sigAlgs || ['ed25519'],
      },
    },
    capabilities: ['policy.apply', 'payments.create_intent', 'meter.ingest'],
    metadata: {
      contact: config.contact || 'security@openbotauth.org',
      docs: config.docsUrl || 'https://docs.openbotauth.org/a2a',
      updated_at: new Date().toISOString(),
    },
  };

  return card;
}

/**
 * Generate ETag from card content
 */
export function generateETag(card: AgentCard): string {
  const content = JSON.stringify(card);
  const hash = createHash('sha256').update(content).digest('hex');
  return `"${hash.substring(0, 16)}"`;
}

/**
 * Get Content-Type header with profile
 */
export function getContentType(): string {
  return 'application/json; profile="https://openbotauth.org/schemas/a2a-agent-card/0.1.0"';
}

/**
 * Get Cache-Control header
 */
export function getCacheControl(): string {
  return 'public, max-age=3600';
}

