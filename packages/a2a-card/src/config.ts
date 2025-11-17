/**
 * Configuration Validation
 * Validates environment configuration and fails fast on errors
 */

import type { AgentCardConfig } from './types.js';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate agent card configuration
 */
export function validateConfig(config: AgentCardConfig): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const isProduction = process.env.NODE_ENV === 'production';

  // Validate JWKS URL
  if (!config.jwksUrl) {
    errors.push('AGENTCARD_JWKS_URL is required');
  } else {
    try {
      const url = new URL(config.jwksUrl);
      if (isProduction && url.protocol !== 'https:') {
        errors.push('AGENTCARD_JWKS_URL must use HTTPS in production');
      }
    } catch {
      errors.push('AGENTCARD_JWKS_URL must be a valid URL');
    }
  }

  // Validate MCP URL
  if (!config.mcpUrl) {
    errors.push('MCP_BASE_URL is required');
  } else {
    try {
      const url = new URL(config.mcpUrl);
      if (isProduction && url.protocol !== 'https:') {
        warnings.push('MCP_BASE_URL should use HTTPS in production');
      }
    } catch {
      errors.push('MCP_BASE_URL must be a valid URL');
    }
  }

  // Validate A2A configuration
  if (config.enableA2A) {
    if (!config.a2aUrl) {
      errors.push('A2A_BASE_URL is required when ENABLE_A2A=true');
    } else {
      try {
        const url = new URL(config.a2aUrl);
        if (isProduction && url.protocol !== 'https:') {
          warnings.push('A2A_BASE_URL should use HTTPS in production');
        }
      } catch {
        errors.push('A2A_BASE_URL must be a valid URL');
      }
    }
  }

  // Validate signature algorithms
  if (config.sigAlgs && config.sigAlgs.length > 0) {
    const validAlgs = ['ed25519', 'rsa-pss-sha512', 'ecdsa-p256-sha256'];
    for (const alg of config.sigAlgs) {
      if (!validAlgs.includes(alg)) {
        warnings.push(`Unknown signature algorithm: ${alg}`);
      }
    }
  }

  // Validate contact email
  if (config.contact) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(config.contact)) {
      warnings.push('AGENTCARD_CONTACT should be a valid email address');
    }
  }

  // Validate docs URL
  if (config.docsUrl) {
    try {
      new URL(config.docsUrl);
    } catch {
      warnings.push('AGENTCARD_DOCS_URL should be a valid URL');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Load configuration from environment variables
 */
export function loadConfig(): AgentCardConfig {
  return {
    jwksUrl: process.env.AGENTCARD_JWKS_URL || 'http://localhost:8080/jwks/openbotauth.json',
    mcpUrl: process.env.MCP_BASE_URL || 'http://localhost:8082',
    a2aUrl: process.env.A2A_BASE_URL || 'http://localhost:8080',
    enableA2A: process.env.ENABLE_A2A === 'true',
    contact: process.env.AGENTCARD_CONTACT,
    docsUrl: process.env.AGENTCARD_DOCS_URL,
    sigAlgs: process.env.AGENTCARD_SIG_ALGS
      ? process.env.AGENTCARD_SIG_ALGS.split(',').map((s) => s.trim())
      : ['ed25519'],
  };
}

/**
 * Validate and load configuration (throws on error)
 */
export function loadAndValidateConfig(): AgentCardConfig {
  const config = loadConfig();
  const result = validateConfig(config);

  if (result.warnings.length > 0) {
    console.warn('Configuration warnings:');
    result.warnings.forEach((warning) => console.warn(`  - ${warning}`));
  }

  if (!result.valid) {
    console.error('Configuration errors:');
    result.errors.forEach((error) => console.error(`  - ${error}`));
    throw new Error('Invalid configuration');
  }

  // Log configuration summary
  console.log('A2A Card Configuration:');
  console.log(`  JWKS URL: ${config.jwksUrl}`);
  console.log(`  MCP URL: ${config.mcpUrl}`);
  console.log(`  A2A Enabled: ${config.enableA2A}`);
  if (config.enableA2A) {
    console.log(`  A2A URL: ${config.a2aUrl}`);
  }
  console.log(`  Signature Algorithms: ${config.sigAlgs?.join(', ')}`);

  return config;
}

