<?php
namespace OpenBotAuth;

/**
 * Main Plugin Class
 */
class Plugin {
    private static $instance = null;
    
    private $verifier;
    private $policy_engine;
    private $content_filter;
    private $admin;
    
    public static function get_instance() {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }
    
    private function __construct() {
        // Singleton
    }
    
    public function init() {
        // Initialize components
        $this->verifier = new Verifier();
        $this->policy_engine = new PolicyEngine();
        $this->content_filter = new ContentFilter($this->verifier, $this->policy_engine);
        
        // Admin interface
        if (is_admin()) {
            $this->admin = new Admin();
        }
        
        // Hooks
        add_action('template_redirect', [$this, 'check_access'], 0);
        add_filter('the_content', [$this->content_filter, 'filter_content'], 10);
        add_action('wp_enqueue_scripts', [$this, 'enqueue_frontend_styles']);
        
        // REST API
        add_action('rest_api_init', [$this, 'register_rest_routes']);
    }
    
    /**
     * Check access before rendering template
     */
    public function check_access() {
        // Skip for admin, login, etc.
        if (is_admin() || is_user_logged_in()) {
            return;
        }
        
        // Only check on singular posts/pages
        if (!is_singular()) {
            return;
        }
        
        global $post;
        
        // Verify signature
        $verification = $this->verifier->verify_request();
        
        // Get policy for this post
        $policy = $this->policy_engine->get_policy($post);
        
        // Apply policy
        $result = $this->policy_engine->apply_policy($policy, $verification, $post);
        
        // Handle result
        switch ($result['effect']) {
            case 'deny':
                wp_die(__('Access denied', 'openbotauth'), 403);
                break;
                
            case 'pay':
                $this->send_402_response($result, $post);
                break;
                
            case 'rate_limit':
                wp_die(__('Rate limit exceeded', 'openbotauth'), 429);
                break;
                
            case 'allow':
            default:
                // Continue to render
                break;
        }
    }
    
    /**
     * Send 402 Payment Required response
     */
    private function send_402_response($result, $post) {
        status_header(402);
        header('Content-Type: application/json');
        
        $response = [
            'error' => 'Payment required',
            'price_cents' => $result['price_cents'],
            'currency' => $result['currency'] ?? 'USD',
            'post_id' => $post->ID,
            'post_title' => $post->post_title,
        ];
        
        // Add payment link if available
        if (!empty($result['pay_url'])) {
            header('Link: <' . $result['pay_url'] . '>; rel="payment"');
            $response['pay_url'] = $result['pay_url'];
        }
        
        echo json_encode($response);
        exit;
    }
    
    /**
     * Register REST API routes
     */
    public function register_rest_routes() {
        register_rest_route('openbotauth/v1', '/policy', [
            'methods' => 'GET',
            'callback' => [$this, 'get_policy_rest'],
            'permission_callback' => '__return_true',
        ]);
    }
    
    /**
     * REST endpoint to get policy
     */
    public function get_policy_rest($request) {
        $post_id = $request->get_param('post_id');
        
        if ($post_id) {
            $post = get_post($post_id);
            if (!$post) {
                return new \WP_Error('not_found', 'Post not found', ['status' => 404]);
            }
            $policy = $this->policy_engine->get_policy($post);
        } else {
            $policy = $this->policy_engine->get_default_policy();
        }
        
        return rest_ensure_response($policy);
    }
    
    /**
     * Enqueue frontend styles
     */
    public function enqueue_frontend_styles() {
        wp_enqueue_style(
            'openbotauth-style',
            OPENBOTAUTH_PLUGIN_URL . 'assets/style.css',
            [],
            OPENBOTAUTH_VERSION
        );
    }
}

