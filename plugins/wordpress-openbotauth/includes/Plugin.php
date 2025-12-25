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
    
    // AI Artifacts components
    private $metadata_provider;
    private $router;
    
    // Cache verification result to avoid duplicate verifications
    private $verification_cache = null;
    
    public static function get_instance() {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }
    
    private function __construct() {
        // Singleton
    }
    
    /**
     * Check if Yoast SEO is active.
     *
     * Used to gracefully defer llms.txt ownership to Yoast when detected.
     *
     * @return bool True if Yoast SEO is active.
     */
    public static function yoast_is_active(): bool {
        return defined('WPSEO_VERSION') || class_exists('WPSEO_Meta');
    }
    
    public function init() {
        // Initialize components
        $this->verifier = new Verifier();
        $this->policy_engine = new PolicyEngine();
        $this->content_filter = new ContentFilter($this->verifier, $this->policy_engine, $this);
        
        // AI Artifacts: Initialize metadata provider and router
        $this->metadata_provider = Content\MetadataProviderFactory::make();
        $this->router = new Endpoints\Router($this->metadata_provider);
        
        // Yoast compatibility: show warning in admin, but DON'T auto-disable llms.txt
        // Users must explicitly disable if they want Yoast to handle it
        // (Yoast's llms.txt may not be configured, leaving users with nothing)
        
        // Admin interface
        if (is_admin()) {
            $this->admin = new Admin();
        }
        
        // Hooks
        // AI Artifacts: Early interception for llms.txt, feed.json, markdown endpoints
        add_action('parse_request', [$this->router, 'handle_request'], 0);
        
        add_action('template_redirect', [$this, 'check_access'], 0);
        add_filter('the_content', [$this->content_filter, 'filter_content'], 10);
        add_action('wp_enqueue_scripts', [$this, 'enqueue_frontend_styles']);
        
        // REST API
        add_action('rest_api_init', [$this, 'register_rest_routes']);
    }
    
    /**
     * Get cached verification result (to avoid duplicate verifications)
     */
    public function get_verification() {
        if ($this->verification_cache === null) {
            $this->verification_cache = $this->verifier->verify_request();
        }
        return $this->verification_cache;
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
        
        // Bypass gating for requests without signature headers (normal browsers)
        // OpenBotAuth only applies to agent requests with RFC 9421 signatures
        if (!$this->verifier->has_signature_headers()) {
            return;
        }
        
        // Increment signed_total - request has signature headers
        Analytics::incrementMeta('signed_total');
        
        global $post;
        
        // Get cached verification (to avoid duplicate verification)
        $verification = $this->get_verification();
        
        // Increment verified_total if verification succeeded
        if (!empty($verification['verified'])) {
            Analytics::incrementMeta('verified_total');
        }
        
        /**
         * Fires when a bot request has been verified.
         *
         * @param array    $agent The verified agent data (jwks_url, kid, etc.)
         * @param \WP_Post $post  The current post
         */
        if (!empty($verification['verified']) && !empty($verification['agent'])) {
            do_action('openbotauth_verified', $verification['agent'], $post);
        }
        
        // Get policy for this post
        $policy = $this->policy_engine->get_policy($post);
        
        // Apply policy
        $result = $this->policy_engine->apply_policy($policy, $verification, $post);
        
        // Track decision in local analytics (no external requests)
        // Only increment if we have a valid effect
        if (!empty($result['effect'])) {
            Analytics::increment($result['effect']);
        }
        
        // Handle result
        switch ($result['effect']) {
            case 'deny':
                status_header(403);
                header('X-OBA-Decision: deny');
                wp_die(__('Access denied', 'openbotauth'), '', ['response' => 403]);
                break;
                
            case 'pay':
                /**
                 * Fires when payment is required for content access.
                 *
                 * @param array    $agent      The agent data (if verified)
                 * @param \WP_Post $post       The current post
                 * @param int      $price_cents The price in cents
                 */
                if (!empty($verification['agent'])) {
                    do_action('openbotauth_payment_required', $verification['agent'], $post, $result['price_cents']);
                }
                $this->send_402_response($result, $post);
                break;
                
            case 'rate_limit':
                status_header(429);
                header('X-OBA-Decision: rate_limit');
                if (!empty($result['retry_after'])) {
                    header('Retry-After: ' . intval($result['retry_after']));
                }
                wp_die(__('Rate limit exceeded', 'openbotauth'), '', ['response' => 429]);
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

