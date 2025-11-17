<?php
namespace OpenBotAuth;

/**
 * Signature Verifier
 * Communicates with the Node.js verifier service
 */
class Verifier {
    private $verifier_url;
    
    public function __construct() {
        $this->verifier_url = get_option('openbotauth_verifier_url', 'http://localhost:8081/verify');
    }
    
    /**
     * Verify the current HTTP request
     * 
     * @return array Verification result with 'verified', 'agent', 'error' keys
     */
    public function verify_request() {
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
        
        // Call verifier service
        $response = wp_remote_post($this->verifier_url, [
            'headers' => ['Content-Type' => 'application/json'],
            'body' => json_encode($verify_request),
            'timeout' => 5,
        ]);
        
        if (is_wp_error($response)) {
            return [
                'verified' => false,
                'error' => 'Verifier service error: ' . $response->get_error_message(),
                'agent' => null,
            ];
        }
        
        $body = json_decode(wp_remote_retrieve_body($response), true);
        
        if (!$body) {
            return [
                'verified' => false,
                'error' => 'Invalid verifier response',
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
     */
    private function get_current_url() {
        $protocol = isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? 'https' : 'http';
        $host = $_SERVER['HTTP_HOST'];
        $uri = $_SERVER['REQUEST_URI'];
        return $protocol . '://' . $host . $uri;
    }
}

