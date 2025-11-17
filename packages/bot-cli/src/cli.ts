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
  .requiredOption('--kid <id>', 'Key ID (kid) for this bot')
  .action(async (options) => {
    await keygenCommand({
      jwksUrl: options.jwksUrl,
      kid: options.kid,
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
  .action(async (url, options) => {
    await fetchCommand(url, {
      method: options.method,
      body: options.body,
      verbose: options.verbose,
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

  # Verbose mode
  $ oba-bot fetch https://example.com/api/data -v
`
);

// Parse arguments
program.parse();

