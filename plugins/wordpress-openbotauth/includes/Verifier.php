<?php
/**
 * Signature Verifier
 *
 * Communicates with the Node.js verifier service to verify HTTP message signatures.
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
 * Signature Verifier.
 *
 * Communicates with the Node.js verifier service.
 */
class Verifier {

	/**
	 * The verifier service URL.
	 *
	 * @var string
	 */
	private $verifier_url;

	/**
	 * Hosted verifier URL constant.
	 */
	const HOSTED_VERIFIER_URL = 'https://verifier.openbotauth.org/verify';

	/**
	 * Constructor.
	 */
	public function __construct() {
		// If "Use hosted verifier" is enabled, use the hosted URL (explicit consent).
		$use_hosted = (bool) get_option( 'openbotauth_use_hosted_verifier', false );

		if ( $use_hosted ) {
			$this->verifier_url = self::HOSTED_VERIFIER_URL;
		} else {
			$this->verifier_url = get_option( 'openbotauth_verifier_url', '' );
		}
	}

	/**
	 * Verify the current HTTP request.
	 *
	 * @return array Verification result with 'verified', 'agent', 'error' keys.
	 */
	public function verify_request() {
		// If no verifier URL is configured, treat all requests as unverified.
		if ( empty( $this->verifier_url ) ) {
			return array(
				'verified' => false,
				'error'    => 'Verifier service not configured',
				'agent'    => null,
			);
		}

		// Extract signature headers (may return error if sensitive header detected).
		$headers = $this->get_signature_headers();

		// Check if get_signature_headers returned an error.
		if ( isset( $headers['error'] ) ) {
			return array(
				'verified' => false,
				'error'    => $headers['error'],
				'agent'    => null,
			);
		}

		if ( empty( $headers['signature'] ) || empty( $headers['signature-input'] ) ) {
			return array(
				'verified' => false,
				'error'    => 'Missing signature headers',
				'agent'    => null,
			);
		}

		// Build verification request.
		$verify_request = array(
			'method'  => isset( $_SERVER['REQUEST_METHOD'] )
				? sanitize_text_field( wp_unslash( $_SERVER['REQUEST_METHOD'] ) )
				: 'GET',
			'url'     => $this->get_current_url(),
			'headers' => $headers,
		);

		// Encode request body (with fallback for encoding failure).
		$body = wp_json_encode( $verify_request );
		if ( false === $body ) {
			$body = '{}';
		}

		// Call verifier service.
		$response = wp_remote_post(
			$this->verifier_url,
			array(
				'headers' => array( 'Content-Type' => 'application/json' ),
				'body'    => $body,
				'timeout' => 5,
			)
		);

		if ( is_wp_error( $response ) ) {
			$error_msg = 'Verifier service error: ' . $response->get_error_message();
			if ( defined( 'WP_DEBUG' ) && WP_DEBUG ) {
                // phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log -- Debug logging when WP_DEBUG enabled
				error_log( '[OpenBotAuth] ' . $error_msg );
			}
			return array(
				'verified' => false,
				'error'    => $error_msg,
				'agent'    => null,
			);
		}

		$status_code = wp_remote_retrieve_response_code( $response );
		if ( 200 !== $status_code ) {
			// Try to parse error from response body.
			$response_body = wp_remote_retrieve_body( $response );
			$error_details = json_decode( $response_body, true );

			$error_msg = 'Verifier service returned status ' . $status_code;
			if ( $error_details && isset( $error_details['error'] ) ) {
				// Sanitize error message from external service for defense in depth.
				$error_msg .= ': ' . sanitize_text_field( $error_details['error'] );
			}

			if ( defined( 'WP_DEBUG' ) && WP_DEBUG ) {
                // phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log -- Debug logging when WP_DEBUG enabled
				error_log( '[OpenBotAuth] ' . $error_msg );
			}
			return array(
				'verified' => false,
				'error'    => $error_msg,
				'agent'    => null,
			);
		}

		$body = json_decode( wp_remote_retrieve_body( $response ), true );

		if ( ! $body ) {
			$error_msg = 'Invalid verifier response (empty or malformed JSON)';
			if ( defined( 'WP_DEBUG' ) && WP_DEBUG ) {
                // phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log -- Debug logging when WP_DEBUG enabled
				error_log( '[OpenBotAuth] ' . $error_msg );
			}
			return array(
				'verified' => false,
				'error'    => $error_msg,
				'agent'    => null,
			);
		}

		return array(
			'verified' => $body['verified'] ?? false,
			'error'    => $body['error'] ?? null,
			'agent'    => $body['agent'] ?? null,
		);
	}

	/**
	 * Check if the current request has any signature headers.
	 *
	 * Used to determine if this is an agent request vs normal browser.
	 *
	 * @return bool True if any signature headers are present.
	 */
	public function has_signature_headers() {
		$headers = $this->get_signature_headers();
		return ! empty( $headers['signature'] ) ||
				! empty( $headers['signature-input'] ) ||
				! empty( $headers['signature-agent'] );
	}

	/**
	 * Get signature-related headers from current request.
	 *
	 * Includes signature headers + any additional headers covered by Signature-Input.
	 * Privacy protection: excludes cookies and authorization headers.
	 *
	 * @return array Headers array or error array.
	 */
	private function get_signature_headers() {
		$headers = array();

		// Get all headers.
		if ( function_exists( 'getallheaders' ) ) {
			$all_headers = getallheaders();
			// Sanitize all header values.
			if ( is_array( $all_headers ) ) {
				$all_headers = array_map( array( $this, 'sanitize_header_value' ), $all_headers );
			} else {
				$all_headers = array();
			}
		} else {
			$all_headers = array();
			foreach ( $_SERVER as $name => $value ) {
				if ( 'HTTP_' === substr( $name, 0, 5 ) ) {
					$header_name                 = str_replace( ' ', '-', ucwords( strtolower( str_replace( '_', ' ', substr( $name, 5 ) ) ) ) );
					$all_headers[ $header_name ] = $this->sanitize_header_value( $value );
				}
			}
		}

		// Extract signature headers (case-insensitive) - always required.
		$signature_input_value = null;
		foreach ( $all_headers as $name => $value ) {
			$lower_name = strtolower( $name );
			if ( in_array( $lower_name, array( 'signature', 'signature-input', 'signature-agent' ), true ) ) {
				$headers[ $lower_name ] = $value;
				if ( 'signature-input' === $lower_name ) {
					$signature_input_value = $value;
				}
			}
		}

		// If we have Signature-Input, parse it to find covered headers.
		if ( $signature_input_value ) {
			$covered_headers = $this->parse_covered_headers( $signature_input_value );

			// Add each covered header that's not a derived component (@-prefix).
			// and not a sensitive header.
			$sensitive_headers = array( 'cookie', 'authorization', 'proxy-authorization', 'www-authenticate' );

			foreach ( $covered_headers as $covered_header ) {
				// Skip derived components (@method, @path, etc.).
				if ( '@' === substr( $covered_header, 0, 1 ) ) {
					continue;
				}

				$lower_covered = strtolower( $covered_header );

				// Check if it's a sensitive header.
				if ( in_array( $lower_covered, $sensitive_headers, true ) ) {
					// Sanitize header name for logging and error messages.
					$safe_header = sanitize_text_field( $covered_header );
					if ( defined( 'WP_DEBUG' ) && WP_DEBUG ) {
						// phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log -- Debug logging when WP_DEBUG enabled.
						error_log( '[OpenBotAuth] Cannot verify: Signature-Input covers sensitive header: ' . $safe_header );
					}
					return array(
						'error' => 'Cannot verify: Signature-Input covers sensitive header \'' . esc_html( $safe_header ) . '\' which is not forwarded.',
					);
				}

				// Find the header value (case-insensitive lookup).
				foreach ( $all_headers as $name => $value ) {
					if ( strtolower( $name ) === $lower_covered ) {
						// Store with lowercase key (verifier expects lowercase).
						$headers[ $lower_covered ] = $value;
						break;
					}
				}
			}
		}

		return $headers;
	}

	/**
	 * Parse Signature-Input header to extract covered components.
	 *
	 * Example: sig1=("@method" "@path" "content-type" "signature-agent;key=\"sig1\"");created=...
	 * Returns: ["@method", "@path", "content-type", "signature-agent"]
	 *
	 * Note: Components may have parameters like ;key="sig1" for dictionary member selection.
	 * We extract only the base header name for lookup purposes.
	 *
	 * @param string $signature_input The Signature-Input header value.
	 * @return array Array of covered header names (base names without parameters).
	 */
	private function parse_covered_headers( $signature_input ) {
		// Extract the parenthesized list of headers.
		if ( preg_match( '/\(([^)]+)\)/', $signature_input, $matches ) ) {
			$headers_str = trim( $matches[1] );
			if ( '' === $headers_str ) {
				return array();
			}

			// Keep quoted components with optional parameter tails intact, e.g.:
			// "signature-agent";key="sig1"
			preg_match_all( '/"[^"]+"(?:;[^\s]+)?|[^\s]+/', $headers_str, $token_matches );
			$tokens  = $token_matches[0];
			$headers = array_map(
				function ( $token ) {
					$token = trim( $token );
					if ( '' === $token ) {
						return '';
					}

					$header_name = $token;
					if ( '"' === $token[0] ) {
						$quote_end = strpos( $token, '"', 1 );
						if ( false !== $quote_end ) {
							$header_name = substr( $token, 1, $quote_end - 1 );
						} else {
							$header_name = trim( $token, '"' );
						}
					}

					$semicolon_pos = strpos( $header_name, ';' );
					if ( false !== $semicolon_pos ) {
						$header_name = substr( $header_name, 0, $semicolon_pos );
					}

					return strtolower( $header_name );
				},
				$tokens
			);

			return array_values( array_filter( $headers ) );
		}

		return array();
	}

	/**
	 * Get current full URL.
	 *
	 * Uses WordPress home_url() with site-configured host (not request header)
	 * to prevent Host header injection attacks.
	 *
	 * @return string The current URL.
	 */
	private function get_current_url() {
		// Use wp_unslash to handle magic quotes on older PHP/WP setups.
		// Note: Don't use sanitize_text_field() on URIs - it strips percent-encoded chars like %20.
		// esc_url_raw() preserves URL encoding while sanitizing for database storage.
		$request_uri = isset( $_SERVER['REQUEST_URI'] )
			? esc_url_raw( wp_unslash( $_SERVER['REQUEST_URI'] ) )
			: '/';
		// Preserve request scheme to avoid proxy setup issues.
		$scheme = is_ssl() ? 'https' : 'http';
		return home_url( $request_uri, $scheme );
	}

	/**
	 * Sanitize an HTTP header value.
	 *
	 * Removes control characters and enforces length limits to prevent
	 * header injection and DoS attacks.
	 *
	 * @param mixed $value The header value to sanitize.
	 * @return string The sanitized header value.
	 */
	private function sanitize_header_value( $value ) {
		// Ensure string type.
		if ( ! is_string( $value ) ) {
			return '';
		}
		// Limit length to prevent DoS (RFC 7230 suggests 8KB max header line).
		if ( strlen( $value ) > 8192 ) {
			return '';
		}
		// Remove control characters (NUL, CR, LF, etc.) to prevent header injection.
		// Keep printable ASCII and extended UTF-8.
		$value = preg_replace( '/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/', '', $value );
		return $value;
	}
}
