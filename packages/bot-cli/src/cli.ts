#!/usr/bin/env node

/**
 * OpenBotAuth Bot CLI
 * 
 * Demo bot for signing HTTP requests with RFC 9421
 */

import { Command } from 'commander';
import { keygenCommand } from './commands/keygen.js';
import { fetchCommand } from './commands/fetch.js';
import { configCommand } from './commands/config.js';
import { certIssueCommand } from './commands/cert.js';

const program = new Command();

program
  .name('oba-bot')
  .description('OpenBotAuth Bot CLI - Sign HTTP requests with RFC 9421')
  .version('0.1.0');

/**
 * keygen command - Generate Ed25519 key pair
 */
program
  .command('keygen')
  .description('Generate Ed25519 key pair and save configuration')
  .requiredOption('--jwks-url <url>', 'JWKS URL for this bot')
  .option('--kid <id>', 'Key ID (kid) - auto-generated from public key if omitted')
  .action(async (options) => {
    await keygenCommand({
      jwksUrl: options.jwksUrl,
      kid: options.kid || undefined,
    });
  });

/**
 * fetch command - Fetch URL with signed request
 */
program
  .command('fetch')
  .description('Fetch a URL with signed HTTP request')
  .argument('<url>', 'URL to fetch')
  .option('-m, --method <method>', 'HTTP method (default: GET)', 'GET')
  .option('-d, --body <data>', 'Request body (JSON)')
  .option('-v, --verbose', 'Verbose output')
  .option('--signature-agent-format <format>', 'Signature-Agent format: legacy|dict', 'dict')
  .action(async (url, options) => {
    await fetchCommand(url, {
      method: options.method,
      body: options.body,
      verbose: options.verbose,
      signatureAgentFormat: options.signatureAgentFormat,
    });
  });

/**
 * config command - Display configuration
 */
program
  .command('config')
  .description('Display current bot configuration')
  .action(async () => {
    await configCommand();
  });

/**
 * cert command - Certificate management
 */
const certCmd = program.command('cert').description('Certificate management');

certCmd
  .command('issue')
  .description('Issue an X.509 certificate for an agent (requires proof-of-possession)')
  .requiredOption('--agent-id <id>', 'Agent ID to issue certificate for')
  .option('--private-key-path <path>', 'Path to private key PEM file (if not using KeyStorage)')
  .option('--registry-url <url>', 'Registry URL (default: https://registry.openbotauth.com)')
  .option('--token <token>', 'Auth token (or set OPENBOTAUTH_TOKEN env var)')
  .action(async (options) => {
    await certIssueCommand({
      agentId: options.agentId,
      privateKeyPath: options.privateKeyPath,
      registryUrl: options.registryUrl,
      token: options.token,
    });
  });

/**
 * Examples
 */
program.addHelpText(
  'after',
  `
Examples:
  # Generate a new key pair
  $ oba-bot keygen --jwks-url http://localhost:8080/jwks/mybot.json --kid my-key-123

  # Fetch a URL with signed request
  $ oba-bot fetch https://example.com/api/data

  # Fetch with POST and body
  $ oba-bot fetch https://example.com/api/create -m POST -d '{"name":"test"}'

  # Show configuration
  $ oba-bot config

  # Issue an X.509 certificate for an agent
  $ oba-bot cert issue --agent-id <uuid> --token <pat>

  # Verbose mode
  $ oba-bot fetch https://example.com/api/data -v
`
);

// Parse arguments
program.parse();
