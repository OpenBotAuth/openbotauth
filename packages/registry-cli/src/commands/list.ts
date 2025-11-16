/**
 * List agents command
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { RegistryAPI } from '../api.js';

export const listCommand = new Command('list')
  .description('List all your agents')
  .option('--api-url <url>', 'Registry API URL', process.env.REGISTRY_URL || 'http://localhost:8080')
  .option('--session <token>', 'Session token', process.env.SESSION_TOKEN)
  .action(async (options) => {
    if (!options.session) {
      console.log(chalk.red('Error: Session token required'));
      console.log(chalk.yellow('Please login first or provide --session token'));
      process.exit(1);
    }

    const api = new RegistryAPI(options.apiUrl, options.session);
    const spinner = ora('Fetching agents...').start();

    try {
      const agents = await api.listAgents();
      spinner.succeed(`Found ${agents.length} agent(s)`);

      if (agents.length === 0) {
        console.log(chalk.yellow('\nNo agents found. Create one with: openbot create'));
        return;
      }

      console.log(chalk.blue.bold('\n📋 Your Agents\n'));

      agents.forEach((agent, index) => {
        console.log(chalk.cyan(`${index + 1}. ${agent.name}`));
        console.log(chalk.gray(`   ID: ${agent.id}`));
        console.log(chalk.gray(`   Type: ${agent.agent_type}`));
        console.log(chalk.gray(`   Status: ${agent.status}`));
        console.log(chalk.gray(`   JWKS: ${options.apiUrl}/agent-jwks/${agent.id}`));
        console.log();
      });
    } catch (error) {
      spinner.fail('Failed to fetch agents');
      console.error(chalk.red((error as Error).message));
      process.exit(1);
    }
  });

