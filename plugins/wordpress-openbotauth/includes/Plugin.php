<?php
/**
 * Main Plugin Class
 *
 * Initializes the OpenBotAuth plugin and coordinates all components.
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
 * Main Plugin Class.
 */
class Plugin {

	/**
	 * Singleton instance.
	 *
	 * @var Plugin|null
	 */
	private static $instance = null;

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
	 * The content filter instance.
	 *
	 * @var ContentFilter
	 */
	private $content_filter;

	/**
	 * The admin instance.
	 *
	 * @var Admin
	 */
	private $admin;

	/**
	 * AI Artifacts metadata provider.
	 *
	 * @var Content\MetadataProviderInterface
	 */
	private $metadata_provider;

	/**
	 * AI Artifacts router.
	 *
	 * @var Endpoints\Router
	 */
	private $router;

	/**
	 * Cache verification result to avoid duplicate verifications.
	 *
	 * @var array|null
	 */
	private $verification_cache = null;

	/**
	 * Get the singleton instance.
	 *
	 * @return Plugin
	 */
	public static function get_instance() {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	/**
	 * Private constructor for singleton pattern.
	 */
	private function __construct() {
		// Singleton.
	}

	/**
	 * Check if Yoast SEO is active.
	 *
	 * Used to gracefully defer llms.txt ownership to Yoast when detected.
	 *
	 * @return bool True if Yoast SEO is active.
	 */
	public static function yoast_is_active(): bool {
		return defined( 'WPSEO_VERSION' ) || class_exists( 'WPSEO_Meta' );
	}

	/**
	 * Initialize the plugin.
	 *
	 * @return void
	 */
	public function init() {
		// Initialize components.
		$this->verifier       = new Verifier();
		$this->policy_engine  = new PolicyEngine();
		$this->content_filter = new ContentFilter( $this->verifier, $this->policy_engine, $this );

		// AI Artifacts: Initialize metadata provider and router.
		$this->metadata_provider = Content\MetadataProviderFactory::make();
		$this->router            = new Endpoints\Router( $this->metadata_provider );

		// Yoast compatibility: only disable OUR llms.txt if user explicitly opts in.
		// Default: OpenBotAuth llms.txt stays enabled (always works, no silent failures).
		if ( self::yoast_is_active() && (bool) get_option( 'openbotauth_prefer_yoast_llms', false ) ) {
			add_filter( 'openbotauth_should_serve_llms_txt', '__return_false', 100 );
		}

		// Admin interface.
		if ( is_admin() ) {
			$this->admin = new Admin();
		}

		// Hooks.
		// AI Artifacts: Early interception for llms.txt, feed.json, markdown endpoints.
		add_action( 'parse_request', array( $this->router, 'handle_request' ), 0 );

		// Bot traffic tracking (UA-based) runs before access check.
		add_action( 'template_redirect', array( $this, 'track_bot_traffic' ), 0 );
		add_action( 'template_redirect', array( $this, 'check_access' ), 0 );
		add_filter( 'the_content', array( $this->content_filter, 'filter_content' ), 10 );
		add_action( 'wp_enqueue_scripts', array( $this, 'enqueue_frontend_styles' ) );

		// REST API.
		add_action( 'rest_api_init', array( $this, 'register_rest_routes' ) );
	}

	/**
	 * Get cached verification result (to avoid duplicate verifications).
	 *
	 * @return array
	 */
	public function get_verification() {
		if ( null === $this->verification_cache ) {
			$this->verification_cache = $this->verifier->verify_request();
		}
		return $this->verification_cache;
	}

	/**
	 * Track bot traffic based on User-Agent.
	 *
	 * Only counts requests_total here; signed/verified tracked in check_access().
	 *
	 * @return void
	 */
	public function track_bot_traffic() {
		// Skip for admin, logged-in users, AJAX, REST.
		if ( is_admin() || is_user_logged_in() ) {
			return;
		}

		if ( wp_doing_ajax() ) {
			return;
		}

		if ( defined( 'REST_REQUEST' ) && REST_REQUEST ) {
			return;
		}

		$ua = isset( $_SERVER['HTTP_USER_AGENT'] )
			? sanitize_text_field( wp_unslash( $_SERVER['HTTP_USER_AGENT'] ) )
			: '';
		if ( empty( $ua ) ) {
			return;
		}

		$bot_id = BotDetector::detect_bot_id_from_user_agent( $ua );
		if ( $bot_id ) {
			Analytics::incrementBotStat( $bot_id, 'requests_total' );
		}

		// Also track referrer stats.
		self::track_referrer_stat();
	}

	/**
	 * Track referrer stat if request comes from known AI chat sources.
	 *
	 * Checks both HTTP Referer header AND utm_source query parameter.
	 * Called from track_bot_traffic() and Router (for AI endpoints).
	 *
	 * @return void
	 */
	public static function track_referrer_stat(): void {
		$tracked = false;

		// 1. Check HTTP Referer header.
		$ref = isset( $_SERVER['HTTP_REFERER'] )
			? sanitize_text_field( wp_unslash( $_SERVER['HTTP_REFERER'] ) )
			: '';
		if ( ! empty( $ref ) ) {
			$host = wp_parse_url( $ref, PHP_URL_HOST );
			$host = strtolower( $host ? $host : '' );

			// Match ChatGPT hosts.
			if ( in_array( $host, array( 'chatgpt.com', 'www.chatgpt.com', 'chat.openai.com' ), true ) ) {
				Analytics::incrementRefStat( 'chatgpt' );
				$tracked = true;
			} elseif ( in_array( $host, array( 'perplexity.ai', 'www.perplexity.ai' ), true ) ) {
				Analytics::incrementRefStat( 'perplexity' );
				$tracked = true;
			}
		}

		// 2. Check utm_source query parameter (e.g., ?utm_source=chatgpt.com).
		// This is how ChatGPT and other AI sources attribute traffic via links.
		// phpcs:disable WordPress.Security.NonceVerification.Recommended -- Public query param for analytics, not processing form data.
		if ( ! $tracked && isset( $_GET['utm_source'] ) ) {
			$utm_source = strtolower( sanitize_text_field( wp_unslash( $_GET['utm_source'] ) ) );
			// phpcs:enable WordPress.Security.NonceVerification.Recommended

			// Match ChatGPT UTM sources.
			if ( in_array( $utm_source, array( 'chatgpt.com', 'chatgpt', 'openai' ), true ) ) {
				Analytics::incrementRefStat( 'chatgpt' );
			} elseif ( in_array( $utm_source, array( 'perplexity.ai', 'perplexity' ), true ) ) {
				Analytics::incrementRefStat( 'perplexity' );
			} elseif ( in_array( $utm_source, array( 'claude.ai', 'claude', 'anthropic' ), true ) ) {
				Analytics::incrementRefStat( 'claude' );
			} elseif ( in_array( $utm_source, array( 'gemini.google.com', 'gemini', 'bard' ), true ) ) {
				Analytics::incrementRefStat( 'gemini' );
			} elseif ( in_array( $utm_source, array( 'copilot.microsoft.com', 'copilot', 'bing' ), true ) ) {
				Analytics::incrementRefStat( 'copilot' );
			}
		}
	}

	/**
	 * Check access before rendering template.
	 *
	 * @return void
	 */
	public function check_access() {
		// Skip for admin, login, etc.
		if ( is_admin() || is_user_logged_in() ) {
			return;
		}

		// Only check on singular posts/pages.
		if ( ! is_singular() ) {
			return;
		}

		// Bypass gating for requests without signature headers (normal browsers).
		// OpenBotAuth only applies to agent requests with RFC 9421 signatures.
		if ( ! $this->verifier->has_signature_headers() ) {
			return;
		}

		// Increment signed_total - request has signature headers.
		Analytics::incrementMeta( 'signed_total' );

		// Track per-bot signed count.
		$ua     = isset( $_SERVER['HTTP_USER_AGENT'] )
			? sanitize_text_field( wp_unslash( $_SERVER['HTTP_USER_AGENT'] ) )
			: '';
		$bot_id = BotDetector::detect_bot_id_from_user_agent( $ua );
		if ( $bot_id ) {
			Analytics::incrementBotStat( $bot_id, 'signed_total' );
		}

		global $post;

		// Get cached verification (to avoid duplicate verification).
		$verification = $this->get_verification();

		// Increment verified_total if verification succeeded.
		if ( ! empty( $verification['verified'] ) ) {
			Analytics::incrementMeta( 'verified_total' );
			// Track per-bot verified count.
			if ( $bot_id ) {
				Analytics::incrementBotStat( $bot_id, 'verified_total' );
			}
		}

		/**
		 * Fires when a bot request has been verified.
		 *
		 * @param array    $agent The verified agent data (jwks_url, kid, etc.).
		 * @param \WP_Post $post  The current post.
		 */
		if ( ! empty( $verification['verified'] ) && ! empty( $verification['agent'] ) ) {
			do_action( 'openbotauth_verified', $verification['agent'], $post );
		}

		// Get policy for this post.
		$policy = $this->policy_engine->get_policy( $post );

		// Apply policy.
		$result = $this->policy_engine->apply_policy( $policy, $verification, $post );

		// Track decision in local analytics (no external requests).
		// Only increment if we have a valid effect.
		if ( ! empty( $result['effect'] ) ) {
			Analytics::increment( $result['effect'] );
		}

		// Handle result.
		switch ( $result['effect'] ) {
			case 'deny':
				status_header( 403 );
				header( 'X-OBA-Decision: deny' );
				wp_die( esc_html__( 'Access denied', 'openbotauth' ), '', array( 'response' => 403 ) );
				break;

			case 'pay':
				/**
				 * Fires when payment is required for content access.
				 *
				 * @param array    $agent      The agent data (if verified).
				 * @param \WP_Post $post       The current post.
				 * @param int      $price_cents The price in cents.
				 */
				if ( ! empty( $verification['agent'] ) ) {
					do_action( 'openbotauth_payment_required', $verification['agent'], $post, $result['price_cents'] );
				}
				$this->send_402_response( $result, $post );
				break;

			case 'rate_limit':
				status_header( 429 );
				header( 'X-OBA-Decision: rate_limit' );
				if ( ! empty( $result['retry_after'] ) ) {
					header( 'Retry-After: ' . intval( $result['retry_after'] ) );
				}
				wp_die( esc_html__( 'Rate limit exceeded', 'openbotauth' ), '', array( 'response' => 429 ) );
				break;

			case 'allow':
			default:
				// Continue to render.
				break;
		}
	}

	/**
	 * Send 402 Payment Required response.
	 *
	 * @param array    $result The policy result.
	 * @param \WP_Post $post   The current post.
	 * @return void
	 */
	private function send_402_response( $result, $post ) {
		status_header( 402 );
		if ( ! headers_sent() ) {
			header( 'X-OBA-Decision: pay' );
			header( 'Content-Type: application/json' );
		}

		$response = array(
			'error'       => 'Payment required',
			'price_cents' => $result['price_cents'],
			'currency'    => $result['currency'] ?? 'USD',
			'post_id'     => $post->ID,
			'post_title'  => $post->post_title,
		);

		// Add payment link if available (sanitized to prevent header injection).
		if ( ! empty( $result['pay_url'] ) ) {
			$safe_url = esc_url_raw( $result['pay_url'], array( 'http', 'https' ) );
			$safe_url = trim( str_replace( array( "\r", "\n", '<', '>' ), '', $safe_url ) );
			if ( ! empty( $safe_url ) ) {
				if ( ! headers_sent() ) {
					header( 'Link: <' . $safe_url . '>; rel="payment"', false );
				}
				$response['pay_url'] = $safe_url;
			}
		}

		echo wp_json_encode( $response );
		exit;
	}

	/**
	 * Register REST API routes.
	 *
	 * Note: Policy endpoint is admin-only as it returns full policy including
	 * whitelist/blacklist/rate_limit which may be sensitive.
	 *
	 * @return void
	 */
	public function register_rest_routes() {
		register_rest_route(
			'openbotauth/v1',
			'/policy',
			array(
				'methods'             => 'GET',
				'callback'            => array( $this, 'get_policy_rest' ),
				'permission_callback' => function () {
					return current_user_can( 'manage_options' );
				},
			)
		);
	}

	/**
	 * REST endpoint to get policy.
	 *
	 * @param \WP_REST_Request $request The REST request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function get_policy_rest( $request ) {
		$post_id = $request->get_param( 'post_id' );

		if ( $post_id ) {
			$post = get_post( $post_id );
			if ( ! $post ) {
				return new \WP_Error( 'not_found', 'Post not found', array( 'status' => 404 ) );
			}
			$policy = $this->policy_engine->get_policy( $post );
		} else {
			$policy = $this->policy_engine->get_default_policy();
		}

		return rest_ensure_response( $policy );
	}

	/**
	 * Enqueue frontend styles.
	 *
	 * @return void
	 */
	public function enqueue_frontend_styles() {
		wp_enqueue_style(
			'openbotauth-style',
			OPENBOTAUTH_PLUGIN_URL . 'assets/style.css',
			array(),
			OPENBOTAUTH_VERSION
		);
	}
}
