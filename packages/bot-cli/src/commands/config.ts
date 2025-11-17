/**
 * Config Command
 * 
 * Display current configuration
 */

import { KeyStorage } from '../key-storage.js';

export async function configCommand(): Promise<void> {
  console.log('🔧 Bot Configuration\n');

  try {
    const config = await KeyStorage.load();

    if (!config) {
      console.log('❌ No configuration found.');
      console.log('Run "oba-bot keygen" to generate a key pair.\n');
      return;
    }

    console.log('Configuration File:', KeyStorage.getConfigPath());
    console.log('');
    console.log('Settings:');
    console.log(`  JWKS URL: ${config.jwks_url}`);
    console.log(`  Key ID: ${config.kid}`);
    console.log('');
    console.log('Public Key (Base64):');
    console.log(`  ${config.public_key}`);
    console.log('');
    console.log('Private Key: ✓ (stored securely)');
    console.log('');
  } catch (error: any) {
    console.error('❌ Error loading configuration:', error.message);
    process.exit(1);
  }
}

