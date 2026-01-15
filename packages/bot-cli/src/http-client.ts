/**
 * HTTP Client with RFC 9421 Signatures
 * 
 * Handles signed requests and 402 payment flows
 */

import type { SignedRequest, FetchResult, PaymentInfo } from './types.js';

export class HttpClient {
  /**
   * Execute a signed request
   */
  async fetch(signedRequest: SignedRequest): Promise<FetchResult> {
    try {
      const response = await fetch(signedRequest.url, {
        method: signedRequest.method,
        headers: signedRequest.headers,
        body: signedRequest.body,
      });

      // Read response body
      const body = await response.text();

      // Extract headers
      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });

      const result: FetchResult = {
        status: response.status,
        statusText: response.statusText,
        headers,
        body,
      };

      // Handle 402 Payment Required
      if (response.status === 402) {
        result.payment = this.parsePaymentInfo(response, body);
      }

      return result;
    } catch (error: any) {
      throw new Error(`Request failed: ${error.message}`);
    }
  }

  /**
   * Parse payment information from 402 response
   */
  private parsePaymentInfo(response: Response, body: string): PaymentInfo | undefined {
    try {
      // Try to parse JSON body
      const data = JSON.parse(body);

      // Extract payment info from body or headers
      const paymentInfo: PaymentInfo = {
        price_cents: data.price_cents || 0,
        currency: data.currency || 'USD',
        pay_url: data.pay_url || this.extractPaymentLink(response),
        request_hash: data.request_hash || '',
      };

      return paymentInfo;
    } catch (error) {
      // If body is not JSON, try to extract from Link header
      const payUrl = this.extractPaymentLink(response);
      if (payUrl) {
        return {
          price_cents: 0,
          currency: 'USD',
          pay_url: payUrl,
          request_hash: '',
        };
      }
      return undefined;
    }
  }

  /**
   * Extract payment URL from Link header
   * 
   * Example: Link: <https://pay.example.com/intent/123>; rel="payment"
   */
  private extractPaymentLink(response: Response): string {
    const linkHeader = response.headers.get('Link');
    if (!linkHeader) {
      return '';
    }

    // Parse Link header for rel="payment"
    const match = linkHeader.match(/<([^>]+)>;\s*rel="payment"/);
    return match ? match[1] : '';
  }

  /**
   * Retry request with payment receipt
   */
  async retryWithReceipt(
    signedRequest: SignedRequest,
    receipt: string
  ): Promise<FetchResult> {
    // Add receipt header
    const headers = {
      ...signedRequest.headers,
      'OpenBotAuth-Receipt': receipt,
    };

    return this.fetch({
      ...signedRequest,
      headers,
    });
  }

  /**
   * Display response in a readable format
   */
  formatResponse(result: FetchResult): string {
    const lines: string[] = [];

    lines.push(`Status: ${result.status} ${result.statusText}`);
    lines.push('');

    // Show important headers
    const importantHeaders = [
      'content-type',
      'x-oba-decision',
      'x-obauth-verified',
      'x-obauth-agent',
      'link',
    ];

    lines.push('Headers:');
    for (const header of importantHeaders) {
      if (result.headers[header]) {
        lines.push(`  ${header}: ${result.headers[header]}`);
      }
    }

    lines.push('');

    // Show payment info if 402
    if (result.payment) {
      lines.push('Payment Required:');
      lines.push(`  Price: ${result.payment.price_cents / 100} ${result.payment.currency}`);
      lines.push(`  Pay URL: ${result.payment.pay_url}`);
      lines.push(`  Request Hash: ${result.payment.request_hash}`);
      lines.push('');
    }

    // Show body (truncate if too long)
    lines.push('Body:');
    if (result.body.length > 500) {
      lines.push(result.body.substring(0, 500) + '...');
      lines.push(`(truncated, ${result.body.length} bytes total)`);
    } else {
      lines.push(result.body);
    }

    return lines.join('\n');
  }
}

