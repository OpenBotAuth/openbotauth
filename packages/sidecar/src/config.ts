import type { SidecarConfig } from './types.js';

/**
 * Load configuration from environment variables
 */
export function loadConfig(): SidecarConfig {
  const port = parseInt(process.env.PORT || '8088', 10);
  const upstreamUrl = process.env.UPSTREAM_URL || 'http://localhost:8080';
  const verifierUrl = process.env.OBA_VERIFIER_URL || 'https://verifier.openbotauth.org/verify';
  const mode = (process.env.OBA_MODE || 'observe') as 'observe' | 'require-verified';
  const timeoutMs = parseInt(process.env.OBA_TIMEOUT_MS || '5000', 10);

  // Protected paths are paths that require verification in require-verified mode
  // Default: /protected
  const protectedPathsEnv = process.env.OBA_PROTECTED_PATHS || '/protected';
  const protectedPaths = protectedPathsEnv.split(',').map(p => p.trim()).filter(Boolean);

  if (mode !== 'observe' && mode !== 'require-verified') {
    throw new Error(`Invalid OBA_MODE: ${mode}. Must be 'observe' or 'require-verified'`);
  }

  return {
    port,
    upstreamUrl,
    verifierUrl,
    mode,
    timeoutMs,
    protectedPaths,
  };
}
