/**
 * Certificate Commands
 *
 * Issue and manage X.509 certificates for agents
 */

import { readFile } from "node:fs/promises";
import { webcrypto } from "node:crypto";
import { KeyStorage } from "../key-storage.js";

const DEFAULT_REGISTRY_URL =
  process.env.OPENBOTAUTH_REGISTRY_URL || "https://registry.openbotauth.com";

export async function certIssueCommand(options: {
  agentId: string;
  registryUrl?: string;
  token?: string;
  privateKeyPath?: string;
}): Promise<void> {
  console.log("🔏 Issuing certificate with proof-of-possession...\n");

  try {
    // Load private key - either from explicit path or from KeyStorage
    let privateKeyPem: string;

    if (options.privateKeyPath) {
      console.log(`Loading private key from: ${options.privateKeyPath}`);
      try {
        privateKeyPem = await readFile(options.privateKeyPath, "utf-8");
      } catch (err: any) {
        console.error(`❌ Failed to read private key file: ${err.message}`);
        process.exit(1);
      }
    } else {
      const config = await KeyStorage.load();
      if (!config) {
        console.error(
          "❌ No configuration found. Either:\n" +
          "   - Use --private-key-path to specify the agent's private key, or\n" +
          "   - Run 'oba-bot keygen' first to generate keys"
        );
        process.exit(1);
      }
      privateKeyPem = config.private_key;
    }

    const registryUrl = options.registryUrl || DEFAULT_REGISTRY_URL;
    const token = options.token || process.env.OPENBOTAUTH_TOKEN;

    if (!token) {
      console.error(
        "❌ No auth token provided. Set OPENBOTAUTH_TOKEN or use --token"
      );
      process.exit(1);
    }

    // Generate proof-of-possession
    const timestamp = Math.floor(Date.now() / 1000);
    const message = `cert-issue:${options.agentId}:${timestamp}`;

    console.log(`Generating proof for agent: ${options.agentId}`);
    console.log(`Proof message: ${message}\n`);

    // Sign the message
    const privateKey = await webcrypto.subtle.importKey(
      "pkcs8",
      pemToBuffer(privateKeyPem),
      { name: "Ed25519" },
      false,
      ["sign"]
    );

    const messageBuffer = new TextEncoder().encode(message);
    const signatureBuffer = await webcrypto.subtle.sign(
      { name: "Ed25519" },
      privateKey,
      messageBuffer
    );

    const signature = Buffer.from(signatureBuffer).toString("base64");

    // Make API request
    const response = await fetch(`${registryUrl}/v1/certs/issue`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        agent_id: options.agentId,
        proof: {
          message,
          signature,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      console.error(`❌ Certificate issuance failed: ${error.error || response.statusText}`);
      process.exit(1);
    }

    const result = await response.json();

    console.log("✅ Certificate issued successfully!\n");
    console.log("Certificate details:");
    console.log(`  Serial: ${result.serial}`);
    console.log(`  Fingerprint: ${result.fingerprint_sha256}`);
    console.log(`  Not Before: ${result.not_before}`);
    console.log(`  Not After: ${result.not_after}`);
    console.log("");

    if (result.cert_pem) {
      console.log("Certificate PEM:");
      console.log(result.cert_pem);
    }
  } catch (error: any) {
    console.error("❌ Error issuing certificate:", error.message);
    process.exit(1);
  }
}

function pemToBuffer(pem: string): ArrayBuffer {
  const base64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s/g, "");

  const buffer = Buffer.from(base64, "base64");
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  );
}
