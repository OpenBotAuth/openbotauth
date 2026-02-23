/**
 * RFC 9421 Signature Verifier
 * 
 * Verifies HTTP message signatures using Ed25519
 */

import { webcrypto } from 'node:crypto';
import type { JWKSCacheManager } from './jwks-cache.js';
import type { NonceManager } from './nonce-manager.js';
import type { VerificationRequest, VerificationResult } from './types.js';
import { validateJwkX509 } from './x509.js';
import {
  parseSignatureInput,
  parseSignature,
  parseSignatureAgent,
  resolveJwksUrl,
  buildSignatureBase,
} from './signature-parser.js';

export class SignatureVerifier {
  private discoveryPaths: string[] | undefined;
  private x509Enabled: boolean;
  private x509TrustAnchors: string[];

  constructor(
    private jwksCache: JWKSCacheManager,
    private nonceManager: NonceManager,
    private trustedDirectories: string[] = [],
    private maxSkewSec: number = 300,
    discoveryPaths?: string[],
    x509Enabled: boolean = false,
    x509TrustAnchors: string[] = []
  ) {
    this.discoveryPaths = discoveryPaths;
    this.x509Enabled = x509Enabled;
    this.x509TrustAnchors = x509TrustAnchors;
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

      // 2. Parse signature components (needed for label selection)
      const components = parseSignatureInput(signatureInput);
      if (!components) {
        return {
          verified: false,
          error: 'Failed to parse Signature-Input header',
        };
      }

      // 3. Parse Signature-Agent (Structured Dictionary or legacy URL)
      const parsedAgent = parseSignatureAgent(signatureAgent, components.label);
      if (!parsedAgent) {
        return {
          verified: false,
          error: 'Invalid Signature-Agent header',
        };
      }

      // 4. Resolve JWKS URL (with discovery if needed)
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

      // 5. Check if JWKS URL is from a trusted directory
      if (this.trustedDirectories.length > 0) {
        const trusted = this.isTrustedDirectory(jwksUrl);
        if (!trusted) {
          return {
            verified: false,
            error: `JWKS URL not from trusted directory: ${jwksUrl}`,
          };
        }
      }

      const signatureValue = parseSignature(signature, components.label);
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

      // 9. Optional X.509 delegation validation (x5c/x5u)
      if (this.x509Enabled && (jwk?.x5c || jwk?.x5u)) {
        const x509Result = await validateJwkX509(jwk, {
          trustAnchors: this.x509TrustAnchors,
        });
        if (!x509Result.valid) {
          return {
            verified: false,
            error: x509Result.error || 'X.509 validation failed',
          };
        }
      }

      // 10. Build signature base
      const signatureBase = buildSignatureBase(components, {
        method: request.method,
        url: request.url,
        headers: request.headers,
      });

      // 11. Verify signature
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

      // 12. Success! Return verification result
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
   * Check if a JWKS URL is from a trusted directory using proper hostname validation.
   *
   * This validates the URL's hostname against configured trusted directories,
   * preventing substring-based bypasses (e.g., evil-trusted.com.attacker.com).
   */
  private isTrustedDirectory(jwksUrl: string): boolean {
    try {
      const jwksUrlParsed = new URL(jwksUrl);
      const jwksHostname = jwksUrlParsed.hostname.toLowerCase();
      const jwksPort = this.getEffectivePort(jwksUrlParsed);

      return this.trustedDirectories.some(dir => {
        const rawDir = dir.trim();
        if (!rawDir) return false;

        try {
          const hasScheme = rawDir.includes('://');
          // Normalize trusted directory for URL parsing.
          const normalizedDir = hasScheme ? rawDir : `https://${rawDir}`;
          const trustedUrl = new URL(normalizedDir);
          const trustedHostname = trustedUrl.hostname.toLowerCase();
          const trustedPort = this.getEffectivePort(trustedUrl);
          const hasExplicitPort = trustedUrl.port.length > 0;

          // Exact match or subdomain match (e.g., api.example.com matches example.com)
          const hostnameMatches =
            jwksHostname === trustedHostname ||
            jwksHostname.endsWith('.' + trustedHostname);
          if (!hostnameMatches) return false;

          // If scheme is configured, enforce exact scheme match.
          if (hasScheme && jwksUrlParsed.protocol !== trustedUrl.protocol) {
            return false;
          }

          // If a trusted entry specifies a port, enforce exact port match.
          if (hasExplicitPort && jwksPort !== trustedPort) {
            return false;
          }

          // If scheme is configured without explicit port, treat it as origin pinning
          // and enforce default/effective port for that scheme as well.
          if (hasScheme && !hasExplicitPort && jwksPort !== trustedPort) {
            return false;
          }

          return true;
        } catch {
          // Treat as hostname pattern if URL parsing fails
          const trustedHostname = rawDir.toLowerCase();
          return jwksHostname === trustedHostname ||
                 jwksHostname.endsWith('.' + trustedHostname);
        }
      });
    } catch {
      // Invalid JWKS URL
      return false;
    }
  }

  private getEffectivePort(url: URL): string {
    if (url.port) return url.port;
    if (url.protocol === 'https:') return '443';
    if (url.protocol === 'http:') return '80';
    return '';
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
