/**
 * Test Commands
 *
 * Tests signature verification and certificate issuance flows
 */

import { readFile } from "node:fs/promises";
import { webcrypto } from "node:crypto";
import chalk from "chalk";
import ora from "ora";
import { KeyStorage } from "../key-storage.js";
import { RequestSigner } from "../request-signer.js";

const DEFAULT_VERIFIER_URL =
  process.env.OPENBOTAUTH_VERIFIER_URL || "http://localhost:8081";
const DEFAULT_REGISTRY_URL =
  process.env.OPENBOTAUTH_REGISTRY_URL || "https://registry.openbotauth.com";

type NodeCryptoKey = webcrypto.CryptoKey;

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  details?: string;
}

interface VerifyResponse {
  verified: boolean;
  error?: string;
  agent?: {
    jwks_url: string;
    kid: string;
    client_name?: string;
  };
}

interface CertIssueResponse {
  serial?: string;
  fingerprint_sha256?: string;
  not_before?: string;
  not_after?: string;
  error?: string;
}

/**
 * Test signature verification against verifier service
 */
export async function testSignCommand(options: {
  verifierUrl?: string;
  targetUrl?: string;
  verbose?: boolean;
}): Promise<void> {
  const verifierUrl = options.verifierUrl || DEFAULT_VERIFIER_URL;
  const targetUrl = options.targetUrl || "https://example.com/test";

  console.log(chalk.bold("\n=== OpenBotAuth Signature Test ===\n"));
  console.log(`Verifier URL: ${verifierUrl}`);
  console.log(`Target URL: ${targetUrl}\n`);

  // Load configuration
  const config = await KeyStorage.load();
  if (!config) {
    console.error(
      chalk.red('No configuration found. Run "oba-bot keygen" first.')
    );
    process.exit(1);
  }

  const results: TestResult[] = [];
  const signer = new RequestSigner(config);

  // Test 1: Legacy format signature
  const legacySpinner = ora("Testing legacy format signature...").start();
  try {
    const legacyResult = await testSignatureFormat(
      signer,
      verifierUrl,
      targetUrl,
      "legacy",
      config.jwks_url,
      options.verbose
    );
    if (legacyResult.passed) {
      legacySpinner.succeed(chalk.green("Legacy format: PASS"));
    } else {
      legacySpinner.fail(
        chalk.red(`Legacy format: FAIL - ${legacyResult.error}`)
      );
    }
    results.push(legacyResult);
  } catch (error: any) {
    legacySpinner.fail(chalk.red(`Legacy format: ERROR - ${error.message}`));
    results.push({ name: "Legacy format", passed: false, error: error.message });
  }

  // Test 2: Dict format signature (RFC 8941)
  const dictSpinner = ora("Testing dict format signature...").start();
  try {
    const dictResult = await testSignatureFormat(
      signer,
      verifierUrl,
      targetUrl,
      "dict",
      config.jwks_url,
      options.verbose
    );
    if (dictResult.passed) {
      dictSpinner.succeed(chalk.green("Dict format: PASS"));
    } else {
      dictSpinner.fail(chalk.red(`Dict format: FAIL - ${dictResult.error}`));
    }
    results.push(dictResult);
  } catch (error: any) {
    dictSpinner.fail(chalk.red(`Dict format: ERROR - ${error.message}`));
    results.push({ name: "Dict format", passed: false, error: error.message });
  }

  // Test 3: Well-known directory format (IETF standard)
  const wellKnownSpinner = ora("Testing well-known directory format...").start();
  try {
    const wellKnownResult = await testWellKnownFormat(
      signer,
      verifierUrl,
      targetUrl,
      config.jwks_url,
      options.verbose
    );
    if (wellKnownResult.passed) {
      wellKnownSpinner.succeed(chalk.green("Well-known format: PASS"));
    } else {
      wellKnownSpinner.fail(chalk.red(`Well-known format: FAIL - ${wellKnownResult.error}`));
    }
    results.push(wellKnownResult);
  } catch (error: any) {
    wellKnownSpinner.fail(chalk.red(`Well-known format: ERROR - ${error.message}`));
    results.push({ name: "Well-known format", passed: false, error: error.message });
  }

  // Summary
  printTestSummary(results);
}

/**
 * Test a specific signature format against the verifier
 */
async function testSignatureFormat(
  signer: RequestSigner,
  verifierUrl: string,
  targetUrl: string,
  format: "legacy" | "dict",
  jwksUrl: string,
  verbose?: boolean
): Promise<TestResult> {
  const method = "GET";

  // Generate signed request
  const signedRequest = await signer.sign(method, targetUrl, undefined, {
    signatureAgentFormat: format,
  });

  if (verbose) {
    console.log(
      `\n  Signature-Input: ${signedRequest.headers["Signature-Input"]}`
    );
    console.log(
      `  Signature: ${signedRequest.headers["Signature"].substring(0, 50)}...`
    );
    console.log(`  Signature-Agent: ${signedRequest.headers["Signature-Agent"]}\n`);
  }

  // Call verifier service /verify endpoint
  const verifyPayload = {
    method,
    url: targetUrl,
    headers: {
      "signature-input": signedRequest.headers["Signature-Input"],
      signature: signedRequest.headers["Signature"],
      "signature-agent": signedRequest.headers["Signature-Agent"],
    },
    jwks_url: jwksUrl, // Provide JWKS URL out-of-band for testing
  };

  const response = await fetch(`${verifierUrl}/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(verifyPayload),
  });

  const result = (await response.json()) as VerifyResponse;

  if (result.verified === true) {
    return {
      name: `${format} format`,
      passed: true,
      details: `Agent: ${result.agent?.client_name || "unknown"}, Kid: ${result.agent?.kid}`,
    };
  } else {
    return {
      name: `${format} format`,
      passed: false,
      error: result.error || "Verification failed",
    };
  }
}

/**
 * Test well-known directory format (IETF http-message-signatures-directory)
 * Uses /.well-known/http-message-signatures-directory path
 */
async function testWellKnownFormat(
  signer: RequestSigner,
  verifierUrl: string,
  targetUrl: string,
  jwksUrl: string,
  verbose?: boolean
): Promise<TestResult> {
  const method = "GET";

  // Extract username and base URL from jwks_url
  // e.g., https://api.openbotauth.org/jwks/hammadtq.json -> hammadtq
  const jwksMatch = jwksUrl.match(/\/jwks\/([^/.]+)\.json$/);
  if (!jwksMatch) {
    return {
      name: "Well-known format",
      passed: false,
      error: `Cannot extract username from JWKS URL: ${jwksUrl}`,
    };
  }

  const username = jwksMatch[1];
  const baseUrl = jwksUrl.replace(/\/jwks\/[^/]+\.json$/, "");
  const wellKnownUrl = `${baseUrl}/.well-known/http-message-signatures-directory?username=${encodeURIComponent(username)}`;

  // Generate signed request with well-known URL as Signature-Agent
  // Use legacy format since well-known URL is explicit
  const signedRequest = await signer.sign(method, targetUrl, undefined, {
    signatureAgentFormat: "legacy",
  });

  // Override Signature-Agent with well-known URL
  const headers = { ...signedRequest.headers };
  headers["Signature-Agent"] = wellKnownUrl;

  // Update Signature-Input to reference the new Signature-Agent value
  // Since we changed Signature-Agent, we need to re-sign
  // For simplicity, we'll test with the well-known URL as out-of-band jwks_url
  // This tests that the verifier can fetch JWKS from the well-known path

  if (verbose) {
    console.log(`\n  Well-known URL: ${wellKnownUrl}`);
    console.log(`  Signature-Input: ${signedRequest.headers["Signature-Input"]}`);
    console.log(`  Signature-Agent: ${signedRequest.headers["Signature-Agent"]}\n`);
  }

  // Call verifier - provide well-known URL as out-of-band for testing
  // The verifier will follow the redirect to /jwks/{username}.json
  const verifyPayload = {
    method,
    url: targetUrl,
    headers: {
      "signature-input": signedRequest.headers["Signature-Input"],
      signature: signedRequest.headers["Signature"],
      "signature-agent": signedRequest.headers["Signature-Agent"],
    },
    jwks_url: wellKnownUrl, // Verifier will follow redirect to actual JWKS
  };

  const response = await fetch(`${verifierUrl}/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(verifyPayload),
  });

  const result = (await response.json()) as VerifyResponse;

  if (result.verified === true) {
    return {
      name: "Well-known format",
      passed: true,
      details: `Agent: ${result.agent?.client_name || "unknown"}, Path: /.well-known/http-message-signatures-directory`,
    };
  } else {
    return {
      name: "Well-known format",
      passed: false,
      error: result.error || "Verification failed",
    };
  }
}

/**
 * Test certificate issuance flow
 */
export async function testCertCommand(options: {
  agentId: string;
  registryUrl?: string;
  token?: string;
  privateKeyPath?: string;
  verbose?: boolean;
}): Promise<void> {
  console.log(chalk.bold("\n=== OpenBotAuth Certificate Test ===\n"));

  const registryUrl = options.registryUrl || DEFAULT_REGISTRY_URL;
  const token = options.token || process.env.OPENBOTAUTH_TOKEN;

  console.log(`Registry URL: ${registryUrl}`);
  console.log(`Agent ID: ${options.agentId}\n`);

  if (!token) {
    console.error(
      chalk.red("No auth token provided. Set OPENBOTAUTH_TOKEN or use --token")
    );
    process.exit(1);
  }

  const results: TestResult[] = [];

  // Test 1: Verify agent configuration and load private key
  const agentSpinner = ora("Checking agent configuration...").start();
  let privateKey: NodeCryptoKey;
  try {
    privateKey = await loadPrivateKey(options.privateKeyPath);
    agentSpinner.succeed(chalk.green("Agent configuration: OK"));
    results.push({ name: "Agent configuration", passed: true });
  } catch (error: any) {
    agentSpinner.fail(
      chalk.red(`Agent configuration: FAIL - ${error.message}`)
    );
    results.push({
      name: "Agent configuration",
      passed: false,
      error: error.message,
    });
    printTestSummary(results);
    process.exit(1);
  }

  // Test 2: Test certificate issuance
  const issueSpinner = ora("Testing certificate issuance endpoint...").start();
  try {
    // Generate proof-of-possession
    const timestamp = Math.floor(Date.now() / 1000);
    const message = `cert-issue:${options.agentId}:${timestamp}`;

    if (options.verbose) {
      console.log(`\n  Proof message: ${message}`);
    }

    const messageBuffer = new TextEncoder().encode(message);
    const signatureBuffer = await webcrypto.subtle.sign(
      { name: "Ed25519" },
      privateKey,
      messageBuffer
    );
    const signature = Buffer.from(signatureBuffer).toString("base64");

    if (options.verbose) {
      console.log(`  Signature: ${signature.substring(0, 50)}...\n`);
    }

    // Make API request
    const response = await fetch(`${registryUrl}/v1/certs/issue`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        agent_id: options.agentId,
        proof: { message, signature },
      }),
    });

    const result = (await response.json()) as CertIssueResponse;

    if (response.ok && result.serial) {
      issueSpinner.succeed(chalk.green("Certificate issuance: PASS"));
      results.push({
        name: "Certificate issuance",
        passed: true,
        details: `Serial: ${result.serial}, Fingerprint: ${result.fingerprint_sha256?.substring(0, 16)}...`,
      });
    } else if (response.status === 429) {
      // Rate limited - endpoint works
      issueSpinner.warn(
        chalk.yellow("Certificate issuance: RATE LIMITED (endpoint works)")
      );
      results.push({
        name: "Certificate issuance",
        passed: true,
        details: "Endpoint reachable, rate limit applied",
      });
    } else if (response.status === 409) {
      // Active cert already exists
      issueSpinner.warn(
        chalk.yellow("Certificate issuance: CONFLICT (cert exists)")
      );
      results.push({
        name: "Certificate issuance",
        passed: true,
        details: "Endpoint reachable, active certificate exists",
      });
    } else {
      issueSpinner.fail(
        chalk.red(`Certificate issuance: FAIL - ${result.error}`)
      );
      results.push({
        name: "Certificate issuance",
        passed: false,
        error: result.error || `HTTP ${response.status}`,
      });
    }
  } catch (error: any) {
    issueSpinner.fail(
      chalk.red(`Certificate issuance: ERROR - ${error.message}`)
    );
    results.push({
      name: "Certificate issuance",
      passed: false,
      error: error.message,
    });
  }

  // Summary
  printTestSummary(results);
}

/**
 * Load private key from file or KeyStorage
 */
async function loadPrivateKey(
  privateKeyPath?: string
): Promise<NodeCryptoKey> {
  let content: string;

  if (privateKeyPath) {
    content = await readFile(privateKeyPath, "utf-8");
  } else {
    const config = await KeyStorage.load();
    if (!config) {
      throw new Error("No configuration found. Run 'oba-bot keygen' first.");
    }
    content = config.private_key;
  }

  return importPrivateKey(content);
}

/**
 * Import private key from JWK or PEM format
 */
async function importPrivateKey(content: string): Promise<NodeCryptoKey> {
  const trimmed = content.trim();

  // JWK format
  if (trimmed.startsWith("{")) {
    const jwk = JSON.parse(trimmed);
    if (
      jwk.kty !== "OKP" ||
      jwk.crv !== "Ed25519" ||
      typeof jwk.x !== "string" ||
      typeof jwk.d !== "string"
    ) {
      throw new Error("Invalid JWK: must be Ed25519 private key");
    }
    return webcrypto.subtle.importKey(
      "jwk",
      { kty: "OKP", crv: "Ed25519", x: jwk.x, d: jwk.d },
      { name: "Ed25519" },
      false,
      ["sign"]
    );
  }

  // PEM format
  if (trimmed.includes("-----BEGIN PRIVATE KEY-----")) {
    const pemMatch = trimmed.match(
      /-----BEGIN PRIVATE KEY-----[\s\S]*?-----END PRIVATE KEY-----/
    );
    if (!pemMatch) {
      throw new Error("Invalid PEM format");
    }
    const base64 = pemMatch[0]
      .replace(/-----BEGIN PRIVATE KEY-----/, "")
      .replace(/-----END PRIVATE KEY-----/, "")
      .replace(/\s/g, "");
    const buffer = Buffer.from(base64, "base64");
    return webcrypto.subtle.importKey(
      "pkcs8",
      buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
      { name: "Ed25519" },
      false,
      ["sign"]
    );
  }

  throw new Error("Unrecognized key format. Expected JWK or PEM.");
}

/**
 * Print test summary
 */
function printTestSummary(results: TestResult[]): void {
  console.log(chalk.bold("\n=== Test Summary ===\n"));

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  for (const result of results) {
    const status = result.passed ? chalk.green("PASS") : chalk.red("FAIL");
    console.log(`  ${status} ${result.name}`);
    if (result.details) {
      console.log(chalk.gray(`       ${result.details}`));
    }
    if (result.error && !result.passed) {
      console.log(chalk.red(`       Error: ${result.error}`));
    }
  }

  console.log("");
  if (failed === 0) {
    console.log(chalk.green.bold(`All ${passed} tests passed!`));
  } else {
    console.log(chalk.yellow(`${passed} passed, ${failed} failed`));
    process.exit(1);
  }
}
