/**
 * Fetch Command
 * 
 * Fetch a URL with signed request
 */

import { KeyStorage } from '../key-storage.js';
import { RequestSigner } from '../request-signer.js';
import { HttpClient } from '../http-client.js';

export async function fetchCommand(
  url: string,
  options: {
    method?: string;
    body?: string;
    verbose?: boolean;
  }
): Promise<void> {
  const method = options.method || 'GET';

  console.log(`🤖 Fetching ${url} with signed request...\n`);

  try {
    // Load configuration
    const config = await KeyStorage.load();
    if (!config) {
      console.error('❌ No configuration found. Run "oba-bot keygen" first.');
      process.exit(1);
    }

    if (options.verbose) {
      console.log('Configuration:');
      console.log(`  JWKS URL: ${config.jwks_url}`);
      console.log(`  Key ID: ${config.kid}\n`);
    }

    // Create signer and client
    const signer = new RequestSigner(config);
    const client = new HttpClient();

    // Sign request
    const signedRequest = await signer.sign(method, url, options.body);

    if (options.verbose) {
      console.log('Signature Headers:');
      console.log(`  Signature-Input: ${signedRequest.headers['Signature-Input']}`);
      console.log(`  Signature: ${signedRequest.headers['Signature']}`);
      console.log(`  Signature-Agent: ${signedRequest.headers['Signature-Agent']}\n`);
    }

    // Execute request
    console.log('📡 Sending request...\n');
    const result = await client.fetch(signedRequest);

    // Display result
    console.log(client.formatResponse(result));

    // Handle 402 Payment Required
    if (result.status === 402 && result.payment) {
      console.log('\n💳 Payment Required!');
      console.log('To complete this request:');
      console.log(`  1. Visit: ${result.payment.pay_url}`);
      console.log('  2. Complete payment');
      console.log('  3. Retry with receipt: oba-bot fetch --receipt <receipt> ${url}');
    }

    // Exit with error code if not successful
    if (result.status >= 400) {
      process.exit(1);
    }
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

