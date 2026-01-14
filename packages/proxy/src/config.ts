import type { ProxyConfig } from './types.js';
import type { CLIOptions } from './cli.js';

/**
 * Load configuration from CLI arguments and environment variables
 * CLI arguments take precedence over environment variables
 */
export function loadConfig(cliOptions: CLIOptions = {}): ProxyConfig {
  // CLI args override env vars
  const port = cliOptions.port ?? parseInt(process.env.PORT || '8088', 10);
  const upstreamUrl = cliOptions.upstream ?? process.env.UPSTREAM_URL ?? 'http://localhost:8080';
  const verifierUrl = cliOptions.verifier ?? process.env.OBA_VERIFIER_URL ?? 'https://verifier.openbotauth.org/verify';
  const mode = cliOptions.mode ?? (process.env.OBA_MODE || 'observe') as 'observe' | 'require-verified';
  const timeoutMs = cliOptions.timeout ?? parseInt(process.env.OBA_TIMEOUT_MS || '5000', 10);

  // Protected paths are paths that require verification in require-verified mode
  // Default: /protected
  const protectedPathsEnv = cliOptions.paths ?? process.env.OBA_PROTECTED_PATHS ?? '/protected';
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
