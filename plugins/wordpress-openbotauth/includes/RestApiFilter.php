<?php
/**
 * REST API Filter
 *
 * Applies signature verification and policy enforcement to WordPress REST API requests.
 * This prevents bots from bypassing content protection by using /wp-json/ endpoints.
 *
 * @package OpenBotAuth
 * @since 1.0.1
 */

namespace OpenBotAuth;

// Prevent direct access.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * REST API Filter.
 *
 * Intercepts REST API requests and applies signature verification + policy.
 */
class RestApiFilter {

	/**
	 * The verifier instance.
	 *
	 * @var Verifier
	 */
	private $verifier;

	/**
	 * The policy engine instance.
	 *
	 * @var PolicyEngine
	 */
	private $policy_engine;

	/**
	 * The plugin instance.
	 *
	 * @var Plugin
	 */
	private $plugin;

	/**
	 * Constructor.
	 *
	 * @param Verifier     $verifier      The verifier instance.
	 * @param PolicyEngine $policy_engine The policy engine instance.
	 * @param Plugin       $plugin        The plugin instance.
	 */
	public function __construct( $verifier, $policy_engine, $plugin ) {
		$this->verifier      = $verifier;
		$this->policy_engine = $policy_engine;
		$this->plugin        = $plugin;
	}

	/**
	 * Register REST API hooks.
	 *
	 * @return void
	 */
	public function register_hooks() {
		// Filter REST API responses to apply teaser/deny policies.
		add_filter( 'rest_post_dispatch', array( $this, 'filter_rest_response' ), 10, 3 );
	}

	/**
	 * Filter REST API response based on signature verification and policy.
	 *
	 * @param \WP_REST_Response $response The response object.
	 * @param \WP_REST_Server   $server   The REST server.
	 * @param \WP_REST_Request  $request  The request object.
	 * @return \WP_REST_Response Modified response.
	 */
	public function filter_rest_response( $response, $server, $request ) {
		// Only filter posts/pages endpoints.
		$route = $request->get_route();
		if ( ! $this->is_content_route( $route ) ) {
			return $response;
		}

		// Skip if user is logged in (has valid auth).
		if ( is_user_logged_in() ) {
			return $response;
		}

		// Check for signature headers.
		if ( ! $this->verifier->has_signature_headers() ) {
			// No signature headers - this could be a browser or unsigned bot.
			// For REST API, we may want to be more restrictive.
			// Check if request looks like a bot (no referer, specific patterns).
			if ( $this->looks_like_bot_request() ) {
				return $this->apply_unsigned_bot_policy( $response, $request );
			}
			return $response;
		}

		// Has signature headers - verify and apply policy.
		Analytics::incrementMeta( 'signed_total' );

		// Track per-bot signed count.
		$ua     = isset( $_SERVER['HTTP_USER_AGENT'] )
			? sanitize_text_field( wp_unslash( $_SERVER['HTTP_USER_AGENT'] ) )
			: '';
		$bot_id = BotDetector::detect_bot_id_from_user_agent( $ua );
		if ( $bot_id ) {
			Analytics::incrementBotStat( $bot_id, 'signed_total' );
		}

		// Get verification result.
		$verification = $this->plugin->get_verification();

		// Track verified count.
		if ( ! empty( $verification['verified'] ) ) {
			Analytics::incrementMeta( 'verified_total' );
			if ( $bot_id ) {
				Analytics::incrementBotStat( $bot_id, 'verified_total' );
			}
		}

		// Get post ID from route or response.
		$post_id = $this->get_post_id_from_request( $request, $response );
		if ( ! $post_id ) {
			return $response;
		}

		$post = get_post( $post_id );
		if ( ! $post ) {
			return $response;
		}

		// Get and apply policy.
		$policy = $this->policy_engine->get_policy( $post );
		$result = $this->policy_engine->apply_policy( $policy, $verification, $post );

		// Track decision.
		if ( ! empty( $result['effect'] ) ) {
			Analytics::increment( $result['effect'] );
		}

		// Set decision header.
		$response->header( 'X-OBA-Decision', $result['effect'] );

		// Apply policy effect.
		return $this->apply_policy_to_response( $response, $result, $policy );
	}

	/**
	 * Check if a REST route is a content route (posts, pages, etc.).
	 *
	 * @param string $route The REST route.
	 * @return bool True if content route.
	 */
	private function is_content_route( $route ) {
		// Match /wp/v2/posts, /wp/v2/posts/123, /wp/v2/pages, etc.
		return (bool) preg_match( '#^/wp/v2/(posts|pages)(/\d+)?$#', $route );
	}

	/**
	 * Check if request looks like an unsigned bot (heuristics).
	 *
	 * @return bool True if likely a bot.
	 */
	private function looks_like_bot_request() {
		// Check User-Agent for known bot patterns.
		$ua = isset( $_SERVER['HTTP_USER_AGENT'] )
			? sanitize_text_field( wp_unslash( $_SERVER['HTTP_USER_AGENT'] ) )
			: '';

		// Known bot User-Agent patterns that might use REST API.
		$bot_patterns = array(
			'ChatGPT',
			'GPTBot',
			'Anthropic',
			'Claude',
			'Perplexity',
			'OpenAI',
		);

		foreach ( $bot_patterns as $pattern ) {
			if ( false !== stripos( $ua, $pattern ) ) {
				return true;
			}
		}

		// Check for missing typical browser headers.
		$referer = isset( $_SERVER['HTTP_REFERER'] ) ? $_SERVER['HTTP_REFERER'] : '';
		$accept  = isset( $_SERVER['HTTP_ACCEPT'] ) ? $_SERVER['HTTP_ACCEPT'] : '';

		// Direct API calls often lack referer and have application/json accept.
		if ( empty( $referer ) && false !== strpos( $accept, 'application/json' ) ) {
			// Could be a programmatic request - apply some protection.
			return true;
		}

		return false;
	}

	/**
	 * Apply policy for unsigned bot requests.
	 *
	 * @param \WP_REST_Response $response The response.
	 * @param \WP_REST_Request  $request  The request.
	 * @return \WP_REST_Response Modified response.
	 */
	private function apply_unsigned_bot_policy( $response, $request ) {
		// Get default policy.
		$policy = $this->policy_engine->get_default_policy();
		$effect = $policy['effect'] ?? 'teaser';

		// For unsigned bots on REST API, apply the default policy.
		$result = array(
			'effect'       => $effect,
			'teaser_words' => $policy['teaser_words'] ?? 100,
		);

		$response->header( 'X-OBA-Decision', $effect . '-unsigned' );

		return $this->apply_policy_to_response( $response, $result, $policy );
	}

	/**
	 * Get post ID from request or response.
	 *
	 * @param \WP_REST_Request  $request  The request.
	 * @param \WP_REST_Response $response The response.
	 * @return int|null Post ID or null.
	 */
	private function get_post_id_from_request( $request, $response ) {
		// Try to get from URL parameter.
		$url_params = $request->get_url_params();
		if ( isset( $url_params['id'] ) ) {
			return absint( $url_params['id'] );
		}

		// Try to get from response data (for single post responses).
		$data = $response->get_data();
		if ( is_array( $data ) && isset( $data['id'] ) ) {
			return absint( $data['id'] );
		}

		return null;
	}

	/**
	 * Apply policy effect to REST response.
	 *
	 * @param \WP_REST_Response $response The response.
	 * @param array             $result   The policy result.
	 * @param array             $policy   The policy configuration.
	 * @return \WP_REST_Response Modified response.
	 */
	private function apply_policy_to_response( $response, $result, $policy ) {
		$effect = $result['effect'] ?? 'allow';

		switch ( $effect ) {
			case 'deny':
				return new \WP_REST_Response(
					array(
						'code'    => 'openbotauth_access_denied',
						'message' => 'Access denied. Valid signature required.',
						'data'    => array( 'status' => 403 ),
					),
					403
				);

			case 'teaser':
				$teaser_words = $result['teaser_words'] ?? $policy['teaser_words'] ?? 100;
				return $this->create_teaser_response( $response, $teaser_words );

			case 'pay':
				return new \WP_REST_Response(
					array(
						'code'        => 'openbotauth_payment_required',
						'message'     => 'Payment required to access this content.',
						'price_cents' => $result['price_cents'] ?? 0,
						'currency'    => $result['currency'] ?? 'USD',
						'data'        => array( 'status' => 402 ),
					),
					402
				);

			case 'rate_limit':
				$retry_after = $result['retry_after'] ?? 60;
				$rest_response = new \WP_REST_Response(
					array(
						'code'        => 'openbotauth_rate_limited',
						'message'     => 'Rate limit exceeded. Please try again later.',
						'retry_after' => $retry_after,
						'data'        => array( 'status' => 429 ),
					),
					429
				);
				$rest_response->header( 'Retry-After', $retry_after );
				return $rest_response;

			case 'allow':
			default:
				return $response;
		}
	}

	/**
	 * Create teaser response from full content.
	 *
	 * @param \WP_REST_Response $response     The original response.
	 * @param int               $teaser_words Number of words for teaser.
	 * @return \WP_REST_Response Modified response with truncated content.
	 */
	private function create_teaser_response( $response, $teaser_words ) {
		$data = $response->get_data();

		// Handle single post response.
		if ( is_array( $data ) && isset( $data['content'] ) ) {
			$data = $this->truncate_post_content( $data, $teaser_words );
			$response->set_data( $data );
		}

		// Handle collection response (array of posts).
		if ( is_array( $data ) && isset( $data[0] ) && is_array( $data[0] ) ) {
			foreach ( $data as $key => $post_data ) {
				if ( isset( $post_data['content'] ) ) {
					$data[ $key ] = $this->truncate_post_content( $post_data, $teaser_words );
				}
			}
			$response->set_data( $data );
		}

		// Add teaser indicator.
		$response->header( 'X-OBA-Content', 'teaser' );

		return $response;
	}

	/**
	 * Truncate post content to teaser length.
	 *
	 * @param array $post_data   The post data array.
	 * @param int   $word_count  Number of words.
	 * @return array Modified post data.
	 */
	private function truncate_post_content( $post_data, $word_count ) {
		// Truncate rendered content.
		if ( isset( $post_data['content']['rendered'] ) ) {
			$post_data['content']['rendered'] = $this->truncate_text(
				$post_data['content']['rendered'],
				$word_count
			);
		}

		// Truncate excerpt if present.
		if ( isset( $post_data['excerpt']['rendered'] ) ) {
			$post_data['excerpt']['rendered'] = $this->truncate_text(
				$post_data['excerpt']['rendered'],
				min( $word_count, 55 ) // Excerpt is typically shorter.
			);
		}

		// Add teaser metadata.
		$post_data['openbotauth'] = array(
			'is_teaser'    => true,
			'teaser_words' => $word_count,
			'message'      => 'Content truncated. Verify agent signature for full access.',
		);

		return $post_data;
	}

	/**
	 * Truncate HTML text to word count.
	 *
	 * @param string $html       The HTML content.
	 * @param int    $word_count Number of words.
	 * @return string Truncated HTML.
	 */
	private function truncate_text( $html, $word_count ) {
		// Strip HTML for word counting.
		$text  = wp_strip_all_tags( $html );
		$words = preg_split( '/\s+/', $text, -1, PREG_SPLIT_NO_EMPTY );

		if ( count( $words ) <= $word_count ) {
			return $html; // Already short enough.
		}

		// Get first N words.
		$teaser_words = array_slice( $words, 0, $word_count );
		$teaser_text  = implode( ' ', $teaser_words ) . '...';

		// Wrap in paragraph.
		return '<p>' . esc_html( $teaser_text ) . '</p>';
	}
}
