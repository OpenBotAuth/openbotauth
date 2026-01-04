/**
 * RFC 9421 Signature Verifier
 * 
 * Verifies HTTP message signatures using Ed25519
 */

import { webcrypto } from 'node:crypto';
import type { JWKSCacheManager } from './jwks-cache.js';
import type { NonceManager } from './nonce-manager.js';
import type { VerificationRequest, VerificationResult } from './types.js';
import {
  parseSignatureInput,
  parseSignature,
  parseSignatureAgent,
  resolveJwksUrl,
  buildSignatureBase,
} from './signature-parser.js';

export class SignatureVerifier {
  private discoveryPaths: string[] | undefined;

  constructor(
    private jwksCache: JWKSCacheManager,
    private nonceManager: NonceManager,
    private trustedDirectories: string[] = [],
    private maxSkewSec: number = 300,
    discoveryPaths?: string[]
  ) {
    this.discoveryPaths = discoveryPaths;
  }

  /**
   * Verify an HTTP request signature
   */
  async verify(request: VerificationRequest): Promise<VerificationResult> {
    try {
      // 1. Extract required headers
      const signatureInput = request.headers['signature-input'];
      const signature = request.headers['signature'];
      const signatureAgent = request.headers['signature-agent'];

      if (!signatureInput || !signature || !signatureAgent) {
        return {
          verified: false,
          error: 'Missing required signature headers (Signature-Input, Signature, Signature-Agent)',
        };
      }

      // 2. Parse Signature-Agent (JWKS URL or identity URL)
      const parsedAgent = parseSignatureAgent(signatureAgent);
      if (!parsedAgent) {
        return {
          verified: false,
          error: 'Invalid Signature-Agent header',
        };
      }

      // 3. Resolve JWKS URL (with discovery if needed)
      let jwksUrl: string;
      if (parsedAgent.isJwks) {
        // Already a JWKS URL
        jwksUrl = parsedAgent.url;
      } else {
        // Attempt JWKS discovery
        const discoveredUrl = await resolveJwksUrl(parsedAgent.url, this.discoveryPaths);
        if (!discoveredUrl) {
          return {
            verified: false,
            error: `JWKS discovery failed for agent: ${parsedAgent.url}`,
          };
        }
        jwksUrl = discoveredUrl;
      }

      // 4. Check if JWKS URL is from a trusted directory
      if (this.trustedDirectories.length > 0) {
        const trusted = this.trustedDirectories.some(dir => jwksUrl.includes(dir));
        if (!trusted) {
          return {
            verified: false,
            error: `JWKS URL not from trusted directory: ${jwksUrl}`,
          };
        }
      }

      // 5. Parse signature components
      const components = parseSignatureInput(signatureInput);
      if (!components) {
        return {
          verified: false,
          error: 'Failed to parse Signature-Input header',
        };
      }

      const signatureValue = parseSignature(signature);
      if (!signatureValue) {
        return {
          verified: false,
          error: 'Failed to parse Signature header',
        };
      }

      components.signature = signatureValue;

      // 6. Validate timestamp
      if (components.created) {
        const timestampCheck = this.nonceManager.checkTimestamp(
          components.created,
          components.expires,
          this.maxSkewSec
        );

        if (!timestampCheck.valid) {
          return {
            verified: false,
            error: timestampCheck.error,
          };
        }
      }

      // 7. Check nonce for replay protection
      if (components.nonce) {
        const nonceValid = await this.nonceManager.checkNonce(
          components.nonce,
          jwksUrl,
          components.keyId
        );

        if (!nonceValid) {
          return {
            verified: false,
            error: 'Nonce already used (replay attack detected)',
          };
        }
      }

      // 8. Fetch JWKS and get the specific key
      const jwk = await this.jwksCache.getKey(jwksUrl, components.keyId);

      // 9. Build signature base
      const signatureBase = buildSignatureBase(components, {
        method: request.method,
        url: request.url,
        headers: request.headers,
      });

      // 10. Verify signature
      const isValid = await this.verifyEd25519Signature(
        signatureBase,
        components.signature,
        jwk
      );

      if (!isValid) {
        return {
          verified: false,
          error: 'Signature verification failed',
        };
      }

      // 11. Success! Return verification result
      const jwks = await this.jwksCache.getJWKS(jwksUrl);

      return {
        verified: true,
        agent: {
          jwks_url: jwksUrl,
          kid: components.keyId,
          client_name: jwks.client_name || jwks['rfc9309-product-token'],
        },
        created: components.created,
        expires: components.expires,
      };
    } catch (error: any) {
      console.error('Signature verification error:', error);
      return {
        verified: false,
        error: error.message || 'Internal verification error',
      };
    }
  }

  /**
   * Verify Ed25519 signature using Web Crypto API
   */
  private async verifyEd25519Signature(
    message: string,
    signatureBase64: string,
    jwk: any
  ): Promise<boolean> {
    try {
      // Import the public key from JWK
      const publicKey = await webcrypto.subtle.importKey(
        'jwk',
        jwk,
        {
          name: 'Ed25519',
        },
        false,
        ['verify']
      );

      // Convert signature from base64 to buffer
      const signatureBuffer = Buffer.from(signatureBase64, 'base64');

      // Convert message to buffer
      const messageBuffer = new TextEncoder().encode(message);

      // Verify signature
      const isValid = await webcrypto.subtle.verify(
        'Ed25519',
        publicKey,
        signatureBuffer,
        messageBuffer
      );

      return isValid;
    } catch (error) {
      console.error('Ed25519 verification error:', error);
      return false;
    }
  }
}

