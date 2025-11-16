/**
 * GitHub OAuth flow implementation
 */

import { randomBytes } from 'crypto';
import type { OAuthConfig, GitHubUser, GitHubTokenResponse } from './types.js';

export class GitHubOAuth {
  constructor(private config: OAuthConfig) {}

  /**
   * Generate OAuth state parameter
   */
  generateState(): string {
    return randomBytes(32).toString('base64url');
  }

  /**
   * Get authorization URL for GitHub OAuth
   */
  getAuthorizationUrl(state: string, scopes: string[] = ['read:user', 'user:email']): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.callbackUrl,
      scope: scopes.join(' '),
      state,
    });

    return `https://github.com/login/oauth/authorize?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token
   */
  async getAccessToken(code: string): Promise<string> {
    const response = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        code,
      }),
    });

    if (!response.ok) {
      throw new Error(`GitHub token exchange failed: ${response.statusText}`);
    }

    const data = (await response.json()) as GitHubTokenResponse;
    
    if (!data.access_token) {
      throw new Error('No access token in GitHub response');
    }

    return data.access_token;
  }

  /**
   * Get GitHub user information
   */
  async getUser(accessToken: string): Promise<GitHubUser> {
    const response = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'OpenBotAuth/0.1',
      },
    });

    if (!response.ok) {
      throw new Error(`GitHub user fetch failed: ${response.statusText}`);
    }

    const user = await response.json() as {
      id: number;
      login: string;
      email?: string | null;
      name?: string | null;
      avatar_url?: string | null;
    };

    // Fetch email if not public
    if (!user.email) {
      const emailResponse = await fetch('https://api.github.com/user/emails', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'OpenBotAuth/0.1',
        },
      });

      if (emailResponse.ok) {
        const emails = await emailResponse.json() as Array<{ primary: boolean; email: string }>;
        const primaryEmail = emails.find((e) => e.primary);
        if (primaryEmail) {
          user.email = primaryEmail.email;
        }
      }
    }

    return {
      id: user.id,
      login: user.login,
      email: user.email || null,
      name: user.name || null,
      avatar_url: user.avatar_url || null,
    };
  }

  /**
   * Complete OAuth flow: exchange code for token and get user
   */
  async handleCallback(code: string): Promise<GitHubUser> {
    const accessToken = await this.getAccessToken(code);
    return await this.getUser(accessToken);
  }
}

