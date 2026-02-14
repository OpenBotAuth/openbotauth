/**
 * Update agent key command
 */

import { Command } from 'commander';
import chalk from 'chalk';
import prompts from 'prompts';
import ora from 'ora';
import { generateKeyPair, publicKeyToJWK, generateKid } from '@openbotauth/registry-signer';
import { RegistryAPI } from '../api.js';

export const updateKeyCommand = new Command('update-key')
  .description('Update agent public key')
  .argument('<agent-id>', 'Agent ID')
  .option('--api-url <url>', 'Registry API URL', process.env.REGISTRY_URL || 'http://localhost:8080')
  .option('--session <token>', 'Session token', process.env.SESSION_TOKEN)
  .action(async (agentId, options) => {
    console.log(chalk.blue.bold('\n🔄 Update Agent Key\n'));

    if (!options.session) {
      console.log(chalk.red('Error: Session token required'));
      process.exit(1);
    }

    const api = new RegistryAPI(options.apiUrl, options.session);

    try {
      // Verify agent exists
      const agent = await api.getAgent(agentId);

      const confirm = await prompts({
        type: 'confirm',
        name: 'value',
        message: `Update key for agent "${agent.name}"?`,
        initial: false,
      });

      if (!confirm.value) {
        console.log(chalk.yellow('Update cancelled'));
        return;
      }

      // Generate new key pair
      const spinner = ora('Generating new Ed25519 key pair...').start();
      const { publicKey, privateKey } = generateKeyPair();
      const kid = generateKid(publicKey);
      
      const now = Math.floor(Date.now() / 1000);
      const jwk = publicKeyToJWK(publicKey, kid, {
        nbf: now,
        exp: now + (90 * 24 * 60 * 60),
        alg: 'EdDSA',
      });
      
      spinner.succeed('New key pair generated');

      // Update agent
      spinner.start('Updating agent...');
      await api.updateAgent(agentId, { public_key: jwk as unknown as Record<string, unknown> });
      spinner.succeed('Agent key updated successfully!');

      // Get session to show user JWKS URL
      const session = await api.getSession();
      const username = session.profile?.username || session.user.github_username;
      const jwksUrl = api.getUserJWKSUrl(username);
      console.log(chalk.yellow.bold('\n🔑 JWKS Endpoint:'));
      console.log(chalk.white(jwksUrl));
      console.log(chalk.dim('(Your agent key is included in your user JWKS)'));

      console.log(chalk.red.bold('\n⚠️  NEW PRIVATE KEY (Save this securely!):\n'));
      console.log(chalk.gray(privateKey));
    } catch (error) {
      console.error(chalk.red((error as Error).message));
      process.exit(1);
    }
  });

