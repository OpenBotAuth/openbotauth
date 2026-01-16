<?php
/**
 * Policy Engine
 *
 * Evaluates policies and determines access control decisions for bot requests.
 *
 * @package OpenBotAuth
 * @since 0.1.0
 */

namespace OpenBotAuth;

// Prevent direct access.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Policy Engine.
 *
 * Evaluates policies and determines access control.
 */
class PolicyEngine {

	/**
	 * Get policy for a post.
	 *
	 * @param \WP_Post $post The post object.
	 * @return array Policy configuration.
	 */
	public function get_policy( $post ) {
		// Check for post-specific policy.
		$post_policy = get_post_meta( $post->ID, '_openbotauth_policy', true );

		if ( ! empty( $post_policy ) ) {
			$policy = json_decode( $post_policy, true );
			// Guard against invalid JSON - fall back to default if decode fails.
			if ( ! is_array( $policy ) ) {
				$policy = $this->get_default_policy();
			}
		} else {
			// Fall back to default policy.
			$policy = $this->get_default_policy();
		}

		/**
		 * Filter the policy before applying it.
		 *
		 * @param array    $policy The policy configuration.
		 * @param \WP_Post $post   The current post.
		 */
		$policy = apply_filters( 'openbotauth_policy', $policy, $post );

		// Final safety check - ensure we always return an array.
		if ( ! is_array( $policy ) ) {
			$policy = $this->get_default_policy();
		}

		return $policy;
	}

	/**
	 * Get default policy.
	 *
	 * @return array The default policy configuration.
	 */
	public function get_default_policy() {
		$policy_json = get_option( 'openbotauth_policy', '{}' );
		$policy      = json_decode( $policy_json, true );

		if ( ! is_array( $policy ) ) {
			return array(
				'effect'       => 'teaser',
				'teaser_words' => 100,
			);
		}

		$default = $policy['default'] ?? array();
		if ( ! is_array( $default ) ) {
			$default = array();
		}

		$default = $this->sanitize_policy_array( $default );

		return array(
			'effect'       => $default['effect'] ?? 'teaser',
			'teaser_words' => $default['teaser_words'] ?? 100,
			'price_cents'  => $default['price_cents'] ?? 0,
			'currency'     => $default['currency'] ?? 'USD',
			'whitelist'    => $default['whitelist'] ?? array(),
			'blacklist'    => $default['blacklist'] ?? array(),
			'rate_limit'   => $default['rate_limit'] ?? array(),
		);
	}

	/**
	 * Apply policy to determine access.
	 *
	 * @param array    $policy       Policy configuration.
	 * @param array    $verification Verification result from Verifier.
	 * @param \WP_Post $post         Current post.
	 * @return array Result with 'effect', 'price_cents', etc.
	 */
	public function apply_policy( $policy, $verification, $post ) {
		// If not verified, check if policy allows anonymous.
		if ( ! $verification['verified'] ) {
			return $this->handle_unverified( $policy, $verification );
		}

		// Verified request - check agent-specific rules.
		$agent = $verification['agent'];

		// Check whitelist.
		// Whitelist-only semantics: If a whitelist is defined and non-empty,
		// only agents matching the whitelist are allowed. All other agents are denied.
		// This provides strict access control for sites that only want specific bots.
		if ( ! empty( $policy['whitelist'] ) ) {
			if ( $this->matches_agent_pattern( $agent, $policy['whitelist'] ) ) {
				return array( 'effect' => 'allow' );
			}
			// Agent is signed but not in whitelist - deny access.
			return array(
				'effect' => 'deny',
				'reason' => 'Agent not in whitelist',
			);
		}

		// Check blacklist.
		if ( ! empty( $policy['blacklist'] ) ) {
			if ( $this->matches_agent_pattern( $agent, $policy['blacklist'] ) ) {
				return array(
					'effect' => 'deny',
					'reason' => 'Agent blacklisted',
				);
			}
		}

		// Check rate limits.
		if ( ! empty( $policy['rate_limit'] ) ) {
			$rate_check = $this->check_rate_limit( $agent, $policy['rate_limit'] );
			if ( ! $rate_check['allowed'] ) {
				return array(
					'effect'      => 'rate_limit',
					'reason'      => 'Rate limit exceeded',
					'retry_after' => $rate_check['retry_after'],
				);
			}
		}

		// Check payment requirement.
		if ( ! empty( $policy['price_cents'] ) && $policy['price_cents'] > 0 ) {
			// Check if payment has been made.
			$has_paid = $this->check_payment( $agent, $post->ID );

			if ( ! $has_paid ) {
				return array(
					'effect'      => 'pay',
					'price_cents' => $policy['price_cents'],
					'currency'    => $policy['currency'] ?? 'USD',
					'pay_url'     => $this->generate_payment_url( $agent, $post ),
				);
			}
		}

		// Default allow.
		return array( 'effect' => 'allow' );
	}

	/**
	 * Handle unverified requests.
	 *
	 * @param array $policy       The policy configuration.
	 * @param array $verification The verification result.
	 * @return array The policy result.
	 */
	private function handle_unverified( $policy, $verification ) {
		$effect = $policy['effect'] ?? 'allow';

		switch ( $effect ) {
			case 'deny':
				return array(
					'effect' => 'deny',
					'reason' => 'Signature required',
				);

			case 'teaser':
				return array(
					'effect'       => 'teaser',
					'teaser_words' => absint( $policy['teaser_words'] ?? 100 ),
				);

			case 'allow':
			default:
				return array( 'effect' => 'allow' );
		}
	}

	/**
	 * Check if agent matches any pattern in list.
	 *
	 * @param array        $agent    The agent data.
	 * @param array|string $patterns The patterns to match against.
	 * @return bool True if agent matches any pattern.
	 */
	private function matches_agent_pattern( $agent, $patterns ) {
		if ( ! is_array( $patterns ) ) {
			$patterns = array( $patterns );
		}

		$agent_id = $agent['jwks_url'] ?? '';
		$kid      = $agent['kid'] ?? '';

		foreach ( $patterns as $pattern ) {
			// Exact match on JWKS URL.
			if ( $pattern === $agent_id ) {
				return true;
			}

			// Wildcard match.
			if ( fnmatch( $pattern, $agent_id ) ) {
				return true;
			}

			// Match on kid.
			if ( $pattern === $kid ) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Check rate limit for agent.
	 *
	 * @param array $agent       The agent data.
	 * @param array $rate_config The rate limit configuration.
	 * @return array Result with 'allowed' and optionally 'retry_after'.
	 */
	private function check_rate_limit( $agent, $rate_config ) {
		$agent_id = $agent['jwks_url'] ?? 'unknown';
		$key      = 'openbotauth_rate_' . md5( $agent_id );

		$requests = get_transient( $key );
		if ( false === $requests ) {
			$requests = array();
		}

		$now          = time();
		$window       = $rate_config['window_seconds'] ?? 3600;
		$max_requests = $rate_config['max_requests'] ?? 100;

		// Remove old requests outside window.
		$requests = array_filter(
			$requests,
			function ( $timestamp ) use ( $now, $window ) {
				return ( $now - $timestamp ) < $window;
			}
		);

		if ( count( $requests ) >= $max_requests ) {
			$oldest      = min( $requests );
			$retry_after = $window - ( $now - $oldest );

			return array(
				'allowed'     => false,
				'retry_after' => $retry_after,
			);
		}

		// Add current request.
		$requests[] = $now;
		set_transient( $key, $requests, $window );

		return array( 'allowed' => true );
	}

	/**
	 * Recursively sanitize policy array values.
	 *
	 * Mirrors admin-side sanitization to protect against malformed options.
	 *
	 * @param mixed $policy The decoded policy value (array or scalar).
	 * @return array Sanitized policy array.
	 */
	private function sanitize_policy_array( $policy ) {
		if ( ! is_array( $policy ) ) {
			return array();
		}

		$sanitized      = array();
		$valid_effects  = array( 'allow', 'teaser', 'deny', 'pay', 'rate_limit' );
		$integer_fields = array( 'teaser_words', 'price_cents', 'max_requests', 'window_seconds' );

		foreach ( $policy as $key => $value ) {
			// Sanitize the key.
			$key = sanitize_key( $key );
			if ( empty( $key ) ) {
				continue;
			}

			if ( is_array( $value ) ) {
				// Handle whitelist/blacklist URL arrays specially.
				if ( in_array( $key, array( 'whitelist', 'blacklist' ), true ) ) {
					$sanitized[ $key ] = array_values( array_filter( array_map( 'esc_url_raw', $value ) ) );
				} else {
					// Recursively sanitize nested arrays (like 'rate_limit').
					$sanitized[ $key ] = $this->sanitize_policy_array( $value );
				}
			} elseif ( 'effect' === $key ) {
				// Validate effect is one of allowed values.
				$sanitized[ $key ] = in_array( $value, $valid_effects, true ) ? $value : 'teaser';
			} elseif ( in_array( $key, $integer_fields, true ) ) {
				// Integer fields.
				$sanitized[ $key ] = absint( $value );
			} elseif ( 'currency' === $key ) {
				// Currency code (3 uppercase letters, e.g., USD, EUR).
				$clean             = preg_replace( '/[^A-Za-z]/', '', (string) $value );
				$sanitized[ $key ] = strtoupper( substr( $clean, 0, 3 ) );
			} else {
				// Default: sanitize as text field.
				$sanitized[ $key ] = sanitize_text_field( (string) $value );
			}
		}

		return $sanitized;
	}

	/**
	 * Check if agent has paid for post.
	 *
	 * @param array $agent   The agent data.
	 * @param int   $post_id The post ID.
	 * @return bool True if agent has paid.
	 */
	private function check_payment( $agent, $post_id ) {
		$agent_id = $agent['jwks_url'] ?? 'unknown';
		$key      = 'openbotauth_payment_' . md5( $agent_id . '_' . $post_id );

		$paid = get_transient( $key );
		return 'paid' === $paid;
	}

	/**
	 * Generate payment URL.
	 *
	 * @param array    $agent The agent data.
	 * @param \WP_Post $post  The post object.
	 * @return string|null The payment URL or null.
	 */
	private function generate_payment_url( $agent, $post ) {
		$base_url = get_option( 'openbotauth_payment_url', '' );

		if ( empty( $base_url ) ) {
			return null;
		}

		$params = array(
			'post_id'    => $post->ID,
			'agent'      => $agent['jwks_url'] ?? 'unknown',
			'return_url' => get_permalink( $post->ID ),
		);

		return add_query_arg( $params, $base_url );
	}

	/**
	 * Record payment.
	 *
	 * @param string $agent_id         The agent ID.
	 * @param int    $post_id          The post ID.
	 * @param int    $duration_seconds The payment duration in seconds.
	 * @return void
	 */
	public function record_payment( $agent_id, $post_id, $duration_seconds = 86400 ) {
		$key = 'openbotauth_payment_' . md5( $agent_id . '_' . $post_id );
		set_transient( $key, 'paid', $duration_seconds );
	}
}
