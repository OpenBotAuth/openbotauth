/**
 * RFC 9421 HTTP Request Signer
 * 
 * Signs HTTP requests using Ed25519 private keys
 */

import { webcrypto } from 'node:crypto';
import type { BotConfig, SignedRequest, SignatureParams } from './types.js';

export class RequestSigner {
  constructor(private config: BotConfig) {}

  /**
   * Sign an HTTP request
   */
  async sign(method: string, url: string, body?: string): Promise<SignedRequest> {
    const urlObj = new URL(url);
    
    // Generate signature parameters
    const params: SignatureParams = {
      created: Math.floor(Date.now() / 1000),
      expires: Math.floor(Date.now() / 1000) + 300, // 5 minutes
      nonce: this.generateNonce(),
      keyId: this.config.kid,
      algorithm: 'ed25519',
      headers: ['@method', '@path', '@authority'],
    };

    // Add content-type if there's a body
    if (body) {
      params.headers.push('content-type');
    }

    // Build signature base
    // RFC 9421 Section 2.2.3: @path is the target path EXCLUDING query string
    const signatureBase = this.buildSignatureBase(params, {
      method: method.toUpperCase(),
      path: urlObj.pathname,
      authority: urlObj.host,
      contentType: body ? 'application/json' : undefined,
    });

    // Sign the base string
    const signature = await this.signString(signatureBase);

    // Build headers
    const headers: Record<string, string> = {
      'Signature-Input': this.buildSignatureInput(params),
      'Signature': `sig1=:${signature}:`,
      'Signature-Agent': this.config.jwks_url,
      'User-Agent': 'OpenBotAuth-CLI/0.1.0',
    };

    if (body) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(body).toString();
    }

    return {
      method: method.toUpperCase(),
      url,
      headers,
      body,
    };
  }

  /**
   * Build signature base string per RFC 9421
   */
  private buildSignatureBase(
    params: SignatureParams,
    request: {
      method: string;
      path: string;
      authority: string;
      contentType?: string;
    }
  ): string {
    const lines: string[] = [];

    for (const component of params.headers) {
      if (component.startsWith('@')) {
        // Derived components
        switch (component) {
          case '@method':
            lines.push(`"@method": ${request.method}`);
            break;
          case '@path':
            lines.push(`"@path": ${request.path}`);
            break;
          case '@authority':
            lines.push(`"@authority": ${request.authority}`);
            break;
        }
      } else {
        // Regular headers
        if (component === 'content-type' && request.contentType) {
          lines.push(`"content-type": ${request.contentType}`);
        }
      }
    }

    // Add signature parameters
    const paramParts: string[] = [];
    paramParts.push(`(${params.headers.map(h => `"${h}"`).join(' ')})`);
    paramParts.push(`created=${params.created}`);
    paramParts.push(`expires=${params.expires}`);
    paramParts.push(`nonce="${params.nonce}"`);
    paramParts.push(`keyid="${params.keyId}"`);
    paramParts.push(`alg="${params.algorithm}"`);

    lines.push(`"@signature-params": ${paramParts.join(';')}`);

    return lines.join('\n');
  }

  /**
   * Build Signature-Input header value
   */
  private buildSignatureInput(params: SignatureParams): string {
    const components = params.headers.map(h => `"${h}"`).join(' ');
    return `sig1=(${components});created=${params.created};expires=${params.expires};nonce="${params.nonce}";keyid="${params.keyId}";alg="${params.algorithm}"`;
  }

  /**
   * Sign a string using Ed25519 private key
   */
  private async signString(message: string): Promise<string> {
    try {
      // Import private key from PEM
      const privateKey = await webcrypto.subtle.importKey(
        'pkcs8',
        this.pemToBuffer(this.config.private_key),
        {
          name: 'Ed25519',
        },
        false,
        ['sign']
      );

      // Sign the message
      const messageBuffer = new TextEncoder().encode(message);
      const signatureBuffer = await webcrypto.subtle.sign(
        'Ed25519',
        privateKey,
        messageBuffer
      );

      // Return base64-encoded signature
      return Buffer.from(signatureBuffer).toString('base64');
    } catch (error) {
      console.error('Error signing message:', error);
      throw new Error('Failed to sign message');
    }
  }

  /**
   * Convert PEM to buffer
   */
  private pemToBuffer(pem: string): ArrayBuffer {
    const base64 = pem
      .replace(/-----BEGIN PRIVATE KEY-----/, '')
      .replace(/-----END PRIVATE KEY-----/, '')
      .replace(/\s/g, '');
    
    const buffer = Buffer.from(base64, 'base64');
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  }

  /**
   * Generate a random nonce
   */
  private generateNonce(): string {
    const bytes = webcrypto.getRandomValues(new Uint8Array(16));
    return Buffer.from(bytes).toString('base64url');
  }
}

