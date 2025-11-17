/**
 * Key Generation Command
 * 
 * Generates Ed25519 key pair and saves configuration
 */

import { generateKeyPair } from '@openbotauth/registry-signer';
import { KeyStorage } from '../key-storage.js';
import type { BotConfig } from '../types.js';

export async function keygenCommand(options: {
  jwksUrl: string;
  kid: string;
}): Promise<void> {
  console.log('🔑 Generating Ed25519 key pair...\n');

  try {
    // Generate key pair
    const keyPair = await generateKeyPair();

    // Create configuration
    const config: BotConfig = {
      jwks_url: options.jwksUrl,
      kid: options.kid,
      private_key: keyPair.privateKey,
      public_key: keyPair.publicKey,
    };

    // Save configuration
    await KeyStorage.save(config);

    console.log('✅ Key pair generated successfully!\n');
    console.log('Configuration:');
    console.log(`  JWKS URL: ${config.jwks_url}`);
    console.log(`  Key ID: ${config.kid}`);
    console.log(`  Config file: ${KeyStorage.getConfigPath()}\n`);

    console.log('Public Key (Base64):');
    console.log(config.public_key);
    console.log('');

    console.log('⚠️  IMPORTANT:');
    console.log('  1. Register this public key in your OpenBotAuth registry');
    console.log('  2. Keep your private key secure (stored in config file)');
    console.log('  3. Never share your private key with anyone\n');
  } catch (error: any) {
    console.error('❌ Error generating key pair:', error.message);
    process.exit(1);
  }
}

