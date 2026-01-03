<?php
namespace OpenBotAuth;

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
        
        // Extract signature headers
        $headers = $this->get_signature_headers();
        
        if (empty($headers['signature']) || empty($headers['signature-input'])) {
            return [
                'verified' => false,
                'error' => 'Missing signature headers',
                'agent' => null,
            ];
        }
        
        // Build verification request
        $verify_request = [
            'method' => $_SERVER['REQUEST_METHOD'],
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
            error_log('[OpenBotAuth] ' . $error_msg);
            return [
                'verified' => false,
                'error' => $error_msg,
                'agent' => null,
            ];
        }
        
        $status_code = wp_remote_retrieve_response_code($response);
        if ($status_code !== 200) {
            $error_msg = 'Verifier service returned status ' . $status_code;
            error_log('[OpenBotAuth] ' . $error_msg);
            return [
                'verified' => false,
                'error' => $error_msg,
                'agent' => null,
            ];
        }
        
        $body = json_decode(wp_remote_retrieve_body($response), true);
        
        if (!$body) {
            $error_msg = 'Invalid verifier response (empty or malformed JSON)';
            error_log('[OpenBotAuth] ' . $error_msg);
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
        
        // Extract signature headers (case-insensitive)
        foreach ($all_headers as $name => $value) {
            $lower_name = strtolower($name);
            if (in_array($lower_name, ['signature', 'signature-input', 'signature-agent'])) {
                $headers[$lower_name] = $value;
            }
        }
        
        return $headers;
    }
    
    /**
     * Get current full URL
     * Uses WordPress home_url() with site-configured host (not request header)
     * to prevent Host header injection attacks.
     */
    private function get_current_url() {
        // Use wp_unslash to handle magic quotes on older PHP/WP setups
        $request_uri = isset($_SERVER['REQUEST_URI']) ? wp_unslash($_SERVER['REQUEST_URI']) : '/';
        // Preserve request scheme to avoid proxy setup issues
        $scheme = is_ssl() ? 'https' : 'http';
        return home_url($request_uri, $scheme);
    }
}

