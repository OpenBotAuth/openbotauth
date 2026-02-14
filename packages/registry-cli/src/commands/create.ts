/**
 * Create agent command
 */

import { Command } from 'commander';
import chalk from 'chalk';
import prompts from 'prompts';
import ora from 'ora';
import { generateKeyPair, publicKeyToJWK, generateKid } from '@openbotauth/registry-signer';
import { RegistryAPI } from '../api.js';

export const createCommand = new Command('create')
  .description('Create a new agent with key pair')
  .option('--api-url <url>', 'Registry API URL', process.env.REGISTRY_URL || 'http://localhost:8080')
  .option('--session <token>', 'Session token', process.env.SESSION_TOKEN)
  .action(async (options) => {
    console.log(chalk.blue.bold('\n🤖 OpenBot Agent Creator\n'));

    // Check authentication
    if (!options.session) {
      console.log(chalk.red('Error: Session token required'));
      console.log(chalk.yellow('Please login first or provide --session token'));
      process.exit(1);
    }

    const api = new RegistryAPI(options.apiUrl, options.session);

    // Collect agent information
    const agentInfo = await prompts([
      {
        type: 'text',
        name: 'name',
        message: 'Agent name:',
        validate: (value: string) => value.length > 0 ? true : 'Name is required',
      },
      {
        type: 'text',
        name: 'description',
        message: 'Agent description (optional):',
      },
      {
        type: 'select',
        name: 'agent_type',
        message: 'Agent type:',
        choices: [
          { title: 'Web Scraper', value: 'web_scraper' },
          { title: 'Trading Bot', value: 'trading_bot' },
          { title: 'Research Assistant', value: 'research_assistant' },
          { title: 'Automation', value: 'automation' },
          { title: 'Other', value: 'other' },
        ],
      },
    ]);

    if (!agentInfo.name) {
      console.log(chalk.red('Agent creation cancelled'));
      process.exit(0);
    }

    // Generate key pair
    const spinner = ora('Generating Ed25519 key pair...').start();
    const { publicKey, privateKey } = generateKeyPair();
    const kid = generateKid(publicKey);
    
    const now = Math.floor(Date.now() / 1000);
    const jwk = publicKeyToJWK(publicKey, kid, {
      nbf: now,
      exp: now + (90 * 24 * 60 * 60), // 90 days
      alg: 'EdDSA',
    });
    
    spinner.succeed('Key pair generated');

    // Create agent
    spinner.start('Creating agent...');
    
    try {
      const agent = await api.createAgent({
        name: agentInfo.name,
        description: agentInfo.description || undefined,
        agent_type: agentInfo.agent_type,
        public_key: jwk as unknown as Record<string, unknown>,
      });

      spinner.succeed('Agent created successfully!');

      // Display results
      console.log(chalk.green.bold('\n✅ Agent Created\n'));
      console.log(chalk.cyan('Agent ID:'), agent.id);
      console.log(chalk.cyan('Name:'), agent.name);
      console.log(chalk.cyan('Type:'), agent.agent_type);
      console.log(chalk.cyan('Status:'), agent.status);

      // Get session to show user JWKS URL
      const session = await api.getSession();
      const username = session.profile?.username || session.user.github_username;
      if (username) {
        const jwksUrl = api.getUserJWKSUrl(username);
        console.log(chalk.yellow.bold('\n🔑 JWKS Endpoint:'));
        console.log(chalk.white(jwksUrl));
        console.log(chalk.dim('(Your agent key is included in your user JWKS)'));
      } else {
        console.log(chalk.yellow('\n⚠️  Could not determine username for JWKS URL'));
      }

      console.log(chalk.red.bold('\n⚠️  PRIVATE KEY (Save this securely - it will not be shown again!):\n'));
      console.log(chalk.gray(privateKey));

      console.log(chalk.dim('\n⭐ Like OpenBotAuth? Star us: https://github.com/OpenBotAuth/openbotauth'));
    } catch (error) {
      spinner.fail('Failed to create agent');
      console.error(chalk.red((error as Error).message));
      process.exit(1);
    }
  });

