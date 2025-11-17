/**
 * Agent Card Tests
 */

import { describe, it, expect } from 'vitest';
import { generateAgentCard, generateETag } from '../card-template.js';
import { validateAgentCard } from '../schema.js';
import type { AgentCardConfig } from '../types.js';

describe('Agent Card', () => {
  const config: AgentCardConfig = {
    jwksUrl: 'http://localhost:8080/jwks/openbotauth.json',
    mcpUrl: 'http://localhost:8082',
    a2aUrl: 'http://localhost:8080',
    enableA2A: false,
  };

  it('should generate valid agent card', () => {
    const card = generateAgentCard(config);
    
    expect(card.schema).toBe('a2a-agent-card');
    expect(card.version).toBe('0.1.0-draft');
    expect(card.agent.name).toBe('OpenBotAuth Service');
    expect(card.endpoints.mcp).toBe(config.mcpUrl);
    expect(card.endpoints.a2a).toBeNull();
    expect(card.auth['http-signatures']['signature-agent']).toBe(config.jwksUrl);
  });

  it('should include A2A endpoint when enabled', () => {
    const enabledConfig = { ...config, enableA2A: true };
    const card = generateAgentCard(enabledConfig);
    
    expect(card.endpoints.a2a).toBe(`${config.a2aUrl}/a2a`);
    expect(card.experimental.a2a).toBe(true);
  });

  it('should validate generated card', () => {
    const card = generateAgentCard(config);
    const result = validateAgentCard(card);
    
    expect(result.valid).toBe(true);
    expect(result.errors).toBeUndefined();
  });

  it('should generate consistent ETag', () => {
    const card = generateAgentCard(config);
    const etag1 = generateETag(card);
    const etag2 = generateETag(card);
    
    expect(etag1).toBe(etag2);
    expect(etag1).toMatch(/^"[a-f0-9]{16}"$/);
  });

  it('should include custom metadata', () => {
    const customConfig = {
      ...config,
      contact: 'custom@example.com',
      docsUrl: 'https://docs.example.com',
    };
    const card = generateAgentCard(customConfig);
    
    expect(card.metadata.contact).toBe('custom@example.com');
    expect(card.metadata.docs).toBe('https://docs.example.com');
  });
});

