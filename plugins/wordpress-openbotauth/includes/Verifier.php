<?php
namespace OpenBotAuth;

// Prevent direct access
if (!defined('ABSPATH')) {
    exit;
}

/**
 * Signature Verifier
 * Communicates with the Node.js verifier service
 */
class Verifier {
    private $verifier_url;
    
    /**
     * Hosted verifier URL constant
     */
    const HOSTED_VERIFIER_URL = 'https://verifier.openbotauth.org/verify';
    
    public function __construct() {
        // If "Use hosted verifier" is enabled, use the hosted URL (explicit consent)
        $use_hosted = (bool) get_option('openbotauth_use_hosted_verifier', false);
        
        if ($use_hosted) {
            $this->verifier_url = self::HOSTED_VERIFIER_URL;
        } else {
            $this->verifier_url = get_option('openbotauth_verifier_url', '');
        }
    }
    
    /**
     * Verify the current HTTP request
     * 
     * @return array Verification result with 'verified', 'agent', 'error' keys
     */
    public function verify_request() {
        // If no verifier URL is configured, treat all requests as unverified
        if (empty($this->verifier_url)) {
            return [
                'verified' => false,
                'error' => 'Verifier service not configured',
                'agent' => null,
            ];
        }
        
        // Extract signature headers (may return error if sensitive header detected)
        $headers = $this->get_signature_headers();

        // Check if get_signature_headers returned an error
        if (isset($headers['error'])) {
            return [
                'verified' => false,
                'error' => $headers['error'],
                'agent' => null,
            ];
        }

        if (empty($headers['signature']) || empty($headers['signature-input'])) {
            return [
                'verified' => false,
                'error' => 'Missing signature headers',
                'agent' => null,
            ];
        }
        
        // Build verification request
        $verify_request = [
            'method' => isset( $_SERVER['REQUEST_METHOD'] ) 
                ? sanitize_text_field( wp_unslash( $_SERVER['REQUEST_METHOD'] ) ) 
                : 'GET',
            'url' => $this->get_current_url(),
            'headers' => $headers,
        ];
        
        // Encode request body (with fallback for encoding failure)
        $body = wp_json_encode($verify_request);
        if (false === $body) {
            $body = '{}';
        }
        
        // Call verifier service
        $response = wp_remote_post($this->verifier_url, [
            'headers' => ['Content-Type' => 'application/json'],
            'body' => $body,
            'timeout' => 5,
        ]);
        
        if (is_wp_error($response)) {
            $error_msg = 'Verifier service error: ' . $response->get_error_message();
            if ( defined( 'WP_DEBUG' ) && WP_DEBUG ) {
                // phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log -- Debug logging when WP_DEBUG enabled
                error_log('[OpenBotAuth] ' . $error_msg);
            }
            return [
                'verified' => false,
                'error' => $error_msg,
                'agent' => null,
            ];
        }
        
        $status_code = wp_remote_retrieve_response_code($response);
        if ($status_code !== 200) {
            // Try to parse error from response body
            $response_body = wp_remote_retrieve_body($response);
            $error_details = json_decode($response_body, true);

            $error_msg = 'Verifier service returned status ' . $status_code;
            if ($error_details && isset($error_details['error'])) {
                $error_msg .= ': ' . $error_details['error'];
            }

            if ( defined( 'WP_DEBUG' ) && WP_DEBUG ) {
                // phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log -- Debug logging when WP_DEBUG enabled
                error_log('[OpenBotAuth] ' . $error_msg);
            }
            return [
                'verified' => false,
                'error' => $error_msg,
                'agent' => null,
            ];
        }
        
        $body = json_decode(wp_remote_retrieve_body($response), true);
        
        if (!$body) {
            $error_msg = 'Invalid verifier response (empty or malformed JSON)';
            if ( defined( 'WP_DEBUG' ) && WP_DEBUG ) {
                // phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log -- Debug logging when WP_DEBUG enabled
                error_log('[OpenBotAuth] ' . $error_msg);
            }
            return [
                'verified' => false,
                'error' => $error_msg,
                'agent' => null,
            ];
        }
        
        return [
            'verified' => $body['verified'] ?? false,
            'error' => $body['error'] ?? null,
            'agent' => $body['agent'] ?? null,
        ];
    }
    
    /**
     * Check if the current request has any signature headers
     * Used to determine if this is an agent request vs normal browser
     * 
     * @return bool True if any signature headers are present
     */
    public function has_signature_headers() {
        $headers = $this->get_signature_headers();
        return !empty($headers['signature']) || 
               !empty($headers['signature-input']) || 
               !empty($headers['signature-agent']);
    }
    
    /**
     * Get signature-related headers from current request
     *
     * Includes signature headers + any additional headers covered by Signature-Input.
     * Privacy protection: excludes cookies and authorization headers.
     */
    private function get_signature_headers() {
        $headers = [];

        // Get all headers
        if (function_exists('getallheaders')) {
            $all_headers = getallheaders();
        } else {
            $all_headers = [];
            foreach ($_SERVER as $name => $value) {
                if (substr($name, 0, 5) == 'HTTP_') {
                    $header_name = str_replace(' ', '-', ucwords(strtolower(str_replace('_', ' ', substr($name, 5)))));
                    $all_headers[$header_name] = $value;
                }
            }
        }

        // Extract signature headers (case-insensitive) - always required
        $signature_input_value = null;
        foreach ($all_headers as $name => $value) {
            $lower_name = strtolower($name);
            if (in_array($lower_name, ['signature', 'signature-input', 'signature-agent'])) {
                $headers[$lower_name] = $value;
                if ($lower_name === 'signature-input') {
                    $signature_input_value = $value;
                }
            }
        }

        // If we have Signature-Input, parse it to find covered headers
        if ($signature_input_value) {
            $covered_headers = $this->parse_covered_headers($signature_input_value);

            // Add each covered header that's not a derived component (@-prefix)
            // and not a sensitive header
            $sensitive_headers = ['cookie', 'authorization', 'proxy-authorization', 'www-authenticate'];

            foreach ($covered_headers as $covered_header) {
                // Skip derived components (@method, @path, etc.)
                if (substr($covered_header, 0, 1) === '@') {
                    continue;
                }

                $lower_covered = strtolower($covered_header);

                // Check if it's a sensitive header
                if (in_array($lower_covered, $sensitive_headers)) {
                    if ( defined( 'WP_DEBUG' ) && WP_DEBUG ) {
                        // phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log -- Debug logging when WP_DEBUG enabled
                        error_log('[OpenBotAuth] Cannot verify: Signature-Input covers sensitive header: ' . $covered_header);
                    }
                    return [
                        'error' => 'Cannot verify: Signature-Input covers sensitive header \'' . $covered_header . '\' which is not forwarded.'
                    ];
                }

                // Find the header value (case-insensitive lookup)
                foreach ($all_headers as $name => $value) {
                    if (strtolower($name) === $lower_covered) {
                        // Store with lowercase key (verifier expects lowercase)
                        $headers[$lower_covered] = $value;
                        break;
                    }
                }
            }
        }

        return $headers;
    }

    /**
     * Parse Signature-Input header to extract covered components
     *
     * Example: sig1=("@method" "@path" "content-type" "accept");created=...
     * Returns: ["@method", "@path", "content-type", "accept"]
     */
    private function parse_covered_headers($signature_input) {
        // Extract the parenthesized list of headers
        if (preg_match('/\(([^)]+)\)/', $signature_input, $matches)) {
            $headers_str = $matches[1];

            // Split by whitespace and remove quotes
            $headers = preg_split('/\s+/', $headers_str);
            $headers = array_map(function($h) {
                return trim($h, '"');
            }, $headers);

            return array_filter($headers);
        }

        return [];
    }
    
    /**
     * Get current full URL
     * Uses WordPress home_url() with site-configured host (not request header)
     * to prevent Host header injection attacks.
     */
    private function get_current_url() {
        // Use wp_unslash to handle magic quotes on older PHP/WP setups
        // Note: Don't use sanitize_text_field() on URIs - it strips percent-encoded chars like %20
        // esc_url_raw() preserves URL encoding while sanitizing for database storage
        $request_uri = isset($_SERVER['REQUEST_URI']) 
            ? esc_url_raw( wp_unslash($_SERVER['REQUEST_URI']) ) 
            : '/';
        // Preserve request scheme to avoid proxy setup issues
        $scheme = is_ssl() ? 'https' : 'http';
        return home_url($request_uri, $scheme);
    }
}

