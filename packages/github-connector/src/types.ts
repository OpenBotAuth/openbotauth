/**
 * Type definitions for GitHub OAuth and session management
 */

export interface GitHubUser {
  id: number;
  login: string;
  email: string | null;
  name: string | null;
  avatar_url: string | null;
}

export interface User {
  id: string;
  email: string | null;
  github_id: string;
  github_username: string;
  avatar_url: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface Profile {
  id: string;
  username: string;
  client_name: string | null;
  client_uri: string | null;
  logo_uri: string | null;
  contacts: string[] | null;
  expected_user_agent: string | null;
  rfc9309_product_token: string | null;
  rfc9309_compliance: string[] | null;
  trigger: string | null;
  purpose: string | null;
  targeted_content: string | null;
  rate_control: string | null;
  rate_expectation: string | null;
  known_urls: string[] | null;
  avatar_url: string | null;
  github_username: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface Session {
  id: string;
  user_id: string;
  session_token: string;
  expires_at: Date;
  created_at: Date;
}

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
}

export interface OAuthState {
  state: string;
  redirectUrl: string;
}

export interface GitHubTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
}

