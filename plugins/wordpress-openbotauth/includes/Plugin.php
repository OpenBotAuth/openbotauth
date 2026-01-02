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
        
        // Yoast compatibility: only disable OUR llms.txt if user explicitly opts in
        // Default: OpenBotAuth llms.txt stays enabled (always works, no silent failures)
        if (self::yoast_is_active() && (bool) get_option('openbotauth_prefer_yoast_llms', false)) {
            add_filter('openbotauth_should_serve_llms_txt', '__return_false', 100);
        }
        
        // Admin interface
        if (is_admin()) {
            $this->admin = new Admin();
        }
        
        // Hooks
        // AI Artifacts: Early interception for llms.txt, feed.json, markdown endpoints
        add_action('parse_request', [$this->router, 'handle_request'], 0);
        
        // Bot traffic tracking (UA-based) runs before access check
        add_action('template_redirect', [$this, 'track_bot_traffic'], 0);
        add_action('template_redirect', [$this, 'check_access'], 0);
        add_filter('the_content', [$this->content_filter, 'filter_content'], 10);
        add_action('wp_enqueue_scripts', [$this, 'enqueue_frontend_styles']);
        
        // REST API
        add_action('rest_api_init', [$this, 'register_rest_routes']);
        
        // Telemetry: register cron action and option update hook (once in init)
        add_action('openbotauth_send_daily_telemetry', [$this, 'send_daily_telemetry']);
        add_action('update_option_openbotauth_share_telemetry', [$this, 'handle_telemetry_toggle'], 10, 3);
        
        // Telemetry: safety check - only run on admin to avoid front-end perf hit
        if (is_admin()) {
            add_action('admin_init', [$this, 'ensure_telemetry_schedule_consistent']);
        }
    }
    
    /**
     * Ensure telemetry cron schedule is consistent with the option.
     * Handles edge cases like migration or database restore.
     * Called via admin_init hook to avoid front-end performance impact.
     */
    public function ensure_telemetry_schedule_consistent(): void {
        $hook = 'openbotauth_send_daily_telemetry';
        $enabled = (bool) get_option('openbotauth_share_telemetry', false);
        $scheduled = wp_next_scheduled($hook);
        
        if ($enabled && !$scheduled) {
            // Option says enabled but no schedule - fix it
            wp_schedule_event(time() + rand(300, 3600), 'daily', $hook);
        } elseif (!$enabled && $scheduled) {
            // Option says disabled but schedule exists - clear it
            wp_clear_scheduled_hook($hook);
        }
    }
    
    /**
     * Handle telemetry option toggle.
     * Schedules or clears the daily cron event.
     *
     * @param mixed  $old_value   The old option value.
     * @param mixed  $new_value   The new option value.
     * @param string $option_name The option name.
     */
    public function handle_telemetry_toggle($old_value, $new_value, $option_name): void {
        $new_enabled = (bool) $new_value;
        $hook = 'openbotauth_send_daily_telemetry';
        
        if ($new_enabled && !wp_next_scheduled($hook)) {
            // Schedule with random delay (5-60 min) to spread load across installs
            wp_schedule_event(time() + rand(300, 3600), 'daily', $hook);
        } elseif (!$new_enabled && wp_next_scheduled($hook)) {
            wp_clear_scheduled_hook($hook);
        }
    }
    
    /**
     * Build telemetry payload.
     * 
     * @param bool $persist_id If true, generates and stores install_id if empty.
     *                         If false (preview mode), uses placeholder if empty.
     * @return array The telemetry payload.
     */
    public function build_telemetry_payload(bool $persist_id = true): array {
        $install_id = get_option('openbotauth_telemetry_install_id', '');
        
        if (empty($install_id)) {
            if ($persist_id) {
                $install_id = wp_generate_uuid4();
                update_option('openbotauth_telemetry_install_id', $install_id, 'no');
            } else {
                $install_id = '(will be generated on first send)';
            }
        }
        
        $bot_totals = Analytics::getBotTotals(1);
        $ref_totals = Analytics::getRefTotals(1);
        
        // Filter to counts > 0, strip metadata (vendor, category), keep only counts
        $bots = [];
        foreach ($bot_totals as $bot_id => $data) {
            if ($data['requests_total'] > 0 || $data['signed_total'] > 0 || $data['verified_total'] > 0) {
                $bots[$bot_id] = [
                    'req' => $data['requests_total'],
                    'signed' => $data['signed_total'],
                    'verified' => $data['verified_total'],
                ];
            }
        }
        
        $refs = array_filter($ref_totals, function($v) { return $v > 0; });
        
        return [
            'install_id' => $install_id,
            'v' => OPENBOTAUTH_VERSION,
            'day' => gmdate('Y-m-d'),
            'sent_at' => gmdate('c'),
            'window' => 1,
            'bots' => (object) $bots,
            'refs' => (object) $refs,
        ];
    }
    
    /**
     * Send daily telemetry to OpenBotAuth Radar.
     * Only sends if telemetry is enabled.
     */
    public function send_daily_telemetry(): void {
        if (!get_option('openbotauth_share_telemetry', false)) {
            return;
        }
        
        $payload = $this->build_telemetry_payload(true);
        
        $response = wp_remote_post('https://openbotauth.org/radar/ingest', [
            'timeout' => 5,
            'headers' => ['Content-Type' => 'application/json'],
            'body' => wp_json_encode($payload),
        ]);
        
        // Always update last_sent (it's really "last attempt")
        update_option('openbotauth_telemetry_last_sent', time(), 'no');
        
        if (is_wp_error($response)) {
            $status = substr($response->get_error_message(), 0, 100);
        } else {
            $status = (string) wp_remote_retrieve_response_code($response);
        }
        update_option('openbotauth_telemetry_last_status', $status, 'no');
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
     * Track bot traffic based on User-Agent
     * Only counts requests_total here; signed/verified tracked in check_access()
     */
    public function track_bot_traffic() {
        // Skip for admin, logged-in users, AJAX, REST
        if (is_admin() || is_user_logged_in()) {
            return;
        }
        
        if (wp_doing_ajax()) {
            return;
        }
        
        if (defined('REST_REQUEST') && REST_REQUEST) {
            return;
        }
        
        $ua = $_SERVER['HTTP_USER_AGENT'] ?? '';
        if (empty($ua)) {
            return;
        }
        
        $bot_id = BotDetector::detect_bot_id_from_user_agent($ua);
        if ($bot_id) {
            Analytics::incrementBotStat($bot_id, 'requests_total');
        }
        
        // Also track referrer stats
        self::track_referrer_stat();
    }
    
    /**
     * Track referrer stat if request comes from known AI chat sources.
     * Static + pure: just parses referer, matches known hosts, increments stat.
     * Called from track_bot_traffic() and Router (for AI endpoints).
     */
    public static function track_referrer_stat(): void {
        $ref = isset($_SERVER['HTTP_REFERER']) ? $_SERVER['HTTP_REFERER'] : '';
        if (empty($ref)) {
            return;
        }
        
        $host = wp_parse_url($ref, PHP_URL_HOST);
        $host = strtolower($host ? $host : '');
        
        // Match ChatGPT hosts
        if (in_array($host, ['chatgpt.com', 'www.chatgpt.com', 'chat.openai.com'], true)) {
            Analytics::incrementRefStat('chatgpt');
        } elseif (in_array($host, ['perplexity.ai', 'www.perplexity.ai'], true)) {
            Analytics::incrementRefStat('perplexity');
        }
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
        
        // Track per-bot signed count
        $ua = $_SERVER['HTTP_USER_AGENT'] ?? '';
        $bot_id = BotDetector::detect_bot_id_from_user_agent($ua);
        if ($bot_id) {
            Analytics::incrementBotStat($bot_id, 'signed_total');
        }
        
        global $post;
        
        // Get cached verification (to avoid duplicate verification)
        $verification = $this->get_verification();
        
        // Increment verified_total if verification succeeded
        if (!empty($verification['verified'])) {
            Analytics::incrementMeta('verified_total');
            // Track per-bot verified count
            if ($bot_id) {
                Analytics::incrementBotStat($bot_id, 'verified_total');
            }
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

