/**
 * Get JWKS URL command
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { RegistryAPI } from '../api.js';

export const jwksCommand = new Command('jwks')
  .description('Get JWKS endpoint URL for an agent')
  .argument('<agent-id>', 'Agent ID')
  .option('--api-url <url>', 'Registry API URL', process.env.REGISTRY_URL || 'http://localhost:8080')
  .option('--session <token>', 'Session token', process.env.SESSION_TOKEN)
  .action(async (agentId, options) => {
    if (!options.session) {
      console.log(chalk.red('Error: Session token required'));
      process.exit(1);
    }

    const api = new RegistryAPI(options.apiUrl, options.session);

    try {
      const agent = await api.getAgent(agentId);
      const jwksUrl = await api.getJWKSUrl(agentId);

      console.log(chalk.blue.bold(`\n🔑 JWKS Endpoint for "${agent.name}"\n`));
      console.log(chalk.white(jwksUrl));
      console.log();
    } catch (error) {
      console.error(chalk.red((error as Error).message));
      process.exit(1);
    }
  });

