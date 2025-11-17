/**
 * Setup Bot CLI from Database
 * 
 * This script fetches your registered keys from the database
 * and configures the bot CLI to use them
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';

const { Pool } = pg;

async function main() {
  console.log('🔑 Setting up Bot CLI with your registered keys from database\n');

  // Load environment variables
  const envPath = join(process.cwd(), '.env');
  if (!existsSync(envPath)) {
    console.error('❌ .env file not found');
    process.exit(1);
  }

  const envContent = await readFile(envPath, 'utf-8');
  const databaseUrl = envContent.match(/DATABASE_URL=(.+)/)?.[1];

  if (!databaseUrl) {
    console.error('❌ DATABASE_URL not found in .env');
    process.exit(1);
  }

  // Connect to database
  const pool = new Pool({ connectionString: databaseUrl });

  try {
    // Get your user info
    const userResult = await pool.query(`
      SELECT u.id, p.username 
      FROM users u
      JOIN profiles p ON p.id = u.id
      ORDER BY u.created_at DESC
      LIMIT 1
    `);

    if (userResult.rows.length === 0) {
      console.error('❌ No users found in database');
      console.error('   Please register via the portal first: http://localhost:5173');
      process.exit(1);
    }

    const user = userResult.rows[0];
    console.log(`Found user: ${user.username}`);

    // Get public key
    const keyResult = await pool.query(`
      SELECT public_key 
      FROM public_keys 
      WHERE user_id = $1
    `, [user.id]);

    if (keyResult.rows.length === 0) {
      console.error('❌ No public key found for user');
      console.error('   Please generate keys in the portal: http://localhost:5173/setup');
      process.exit(1);
    }

    const publicKey = keyResult.rows[0].public_key;
    console.log('✅ Found public key');

    // Get key history to find the kid
    const historyResult = await pool.query(`
      SELECT id 
      FROM key_history 
      WHERE user_id = $1 AND is_active = true
      ORDER BY created_at DESC
      LIMIT 1
    `, [user.id]);

    if (historyResult.rows.length === 0) {
      console.error('❌ No active key found in history');
      process.exit(1);
    }

    const kid = historyResult.rows[0].id;
    console.log(`✅ Found key ID: ${kid}`);

    // Construct JWKS URL
    const jwksUrl = `http://localhost:8080/jwks/${user.username}.json`;

    console.log('\n⚠️  IMPORTANT: Private Key');
    console.log('The private key is NOT stored in the database (for security).');
    console.log('You need to provide the private key you saved when you generated keys.\n');

    console.log('Please paste your PRIVATE KEY (from when you generated keys in the portal):');
    console.log('It should look like:');
    console.log('-----BEGIN PRIVATE KEY-----');
    console.log('MC4CAQAwBQYDK2VwBCIEI...');
    console.log('-----END PRIVATE KEY-----\n');

    // Read private key from stdin
    const privateKey = await new Promise((resolve) => {
      let data = '';
      process.stdin.on('data', (chunk) => {
        data += chunk;
      });
      process.stdin.on('end', () => {
        resolve(data.trim());
      });
    });

    if (!privateKey || !privateKey.includes('BEGIN PRIVATE KEY')) {
      console.error('\n❌ Invalid private key format');
      process.exit(1);
    }

    // Create config
    const config = {
      jwks_url: jwksUrl,
      kid: kid,
      private_key: privateKey,
      public_key: publicKey,
    };

    // Save config
    const configDir = join(homedir(), '.openbotauth');
    if (!existsSync(configDir)) {
      await mkdir(configDir, { recursive: true });
    }

    const configFile = join(configDir, 'bot-config.json');
    await writeFile(configFile, JSON.stringify(config, null, 2));

    console.log('\n✅ Configuration saved!');
    console.log(`   File: ${configFile}`);
    console.log(`   JWKS URL: ${jwksUrl}`);
    console.log(`   Key ID: ${kid}`);
    console.log('\n🧪 Test it:');
    console.log('   cd packages/bot-cli');
    console.log('   pnpm dev fetch http://localhost:3000/protected -v');
    console.log('');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();

