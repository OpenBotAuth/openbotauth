/**
 * JSON Schema for A2A Agent Card
 */

export const agentCardSchema = {
  $id: 'https://openbotauth.org/schemas/a2a-agent-card/0.1.0.json',
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'A2A Agent Card',
  description: 'Discovery document for Agent-to-Agent interoperability',
  type: 'object',
  required: ['schema', 'version', 'agent', 'endpoints', 'auth', 'capabilities'],
  properties: {
    schema: {
      type: 'string',
      const: 'a2a-agent-card',
      description: 'Schema identifier',
    },
    version: {
      type: 'string',
      pattern: '^0\\.1\\.0-draft$',
      description: 'Schema version',
    },
    agent: {
      type: 'object',
      required: ['name', 'version'],
      properties: {
        name: {
          type: 'string',
          minLength: 1,
          description: 'Agent name',
        },
        version: {
          type: 'string',
          pattern: '^\\d+\\.\\d+\\.\\d+$',
          description: 'Agent version (semver)',
        },
      },
    },
    endpoints: {
      type: 'object',
      required: ['mcp'],
      properties: {
        mcp: {
          type: 'string',
          format: 'uri',
          description: 'MCP endpoint URL',
        },
        a2a: {
          oneOf: [
            { type: 'string', format: 'uri' },
            { type: 'null' },
          ],
          description: 'A2A endpoint URL (null if disabled)',
        },
      },
    },
    experimental: {
      type: 'object',
      properties: {
        a2a: {
          type: 'boolean',
          description: 'Whether A2A is experimental',
        },
      },
    },
    auth: {
      type: 'object',
      required: ['http-signatures'],
      properties: {
        'http-signatures': {
          type: 'object',
          required: ['signature-agent', 'alg'],
          properties: {
            'signature-agent': {
              type: 'string',
              format: 'uri',
              description: 'JWKS URL for signature verification',
            },
            alg: {
              type: 'array',
              items: {
                type: 'string',
                enum: ['ed25519', 'rsa-pss-sha512', 'ecdsa-p256-sha256'],
              },
              minItems: 1,
              description: 'Supported signature algorithms',
            },
          },
        },
      },
    },
    capabilities: {
      type: 'array',
      items: {
        type: 'string',
      },
      minItems: 1,
      description: 'List of supported capabilities',
    },
    metadata: {
      type: 'object',
      properties: {
        contact: {
          type: 'string',
          format: 'email',
          description: 'Contact email',
        },
        docs: {
          type: 'string',
          format: 'uri',
          description: 'Documentation URL',
        },
        updated_at: {
          type: 'string',
          format: 'date-time',
          description: 'Last updated timestamp',
        },
      },
    },
  },
};

/**
 * Validate agent card against schema
 */
export function validateAgentCard(card: any): { valid: boolean; errors?: string[] } {
  const errors: string[] = [];

  // Basic structure validation
  if (!card || typeof card !== 'object') {
    return { valid: false, errors: ['Card must be an object'] };
  }

  // Required fields
  const requiredFields = ['schema', 'version', 'agent', 'endpoints', 'auth', 'capabilities'];
  for (const field of requiredFields) {
    if (!(field in card)) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // Schema field
  if (card.schema !== 'a2a-agent-card') {
    errors.push('Invalid schema field, must be "a2a-agent-card"');
  }

  // Version field
  if (card.version !== '0.1.0-draft') {
    errors.push('Invalid version field, must be "0.1.0-draft"');
  }

  // Agent field
  if (card.agent) {
    if (!card.agent.name || typeof card.agent.name !== 'string') {
      errors.push('agent.name is required and must be a string');
    }
    if (!card.agent.version || typeof card.agent.version !== 'string') {
      errors.push('agent.version is required and must be a string');
    }
  }

  // Endpoints field
  if (card.endpoints) {
    if (!card.endpoints.mcp || typeof card.endpoints.mcp !== 'string') {
      errors.push('endpoints.mcp is required and must be a string');
    }
    if ('a2a' in card.endpoints && card.endpoints.a2a !== null && typeof card.endpoints.a2a !== 'string') {
      errors.push('endpoints.a2a must be a string or null');
    }
  }

  // Auth field
  if (card.auth) {
    if (!card.auth['http-signatures']) {
      errors.push('auth.http-signatures is required');
    } else {
      const httpSig = card.auth['http-signatures'];
      if (!httpSig['signature-agent'] || typeof httpSig['signature-agent'] !== 'string') {
        errors.push('auth.http-signatures.signature-agent is required and must be a string');
      }
      if (!Array.isArray(httpSig.alg) || httpSig.alg.length === 0) {
        errors.push('auth.http-signatures.alg is required and must be a non-empty array');
      }
    }
  }

  // Capabilities field
  if (!Array.isArray(card.capabilities) || card.capabilities.length === 0) {
    errors.push('capabilities is required and must be a non-empty array');
  }

  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined,
  };
}

