/**
 * Shared constants for profile field validation
 */

/**
 * Allowlist of profile columns that may be updated via API.
 * Excludes: id, username, github_username, created_at, updated_at
 * (immutable, OAuth-managed, or DB-managed fields).
 */
export const SAFE_PROFILE_COLUMNS = new Set([
  'client_name',
  'client_uri',
  'logo_uri',
  'contacts',
  'expected_user_agent',
  'rfc9309_product_token',
  'rfc9309_compliance',
  'trigger',
  'purpose',
  'targeted_content',
  'rate_control',
  'rate_expectation',
  'known_urls',
  'avatar_url',
]);
