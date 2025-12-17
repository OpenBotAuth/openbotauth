<?php
namespace OpenBotAuth;

/**
 * Content Filter
 * Filters post content based on policy (e.g., teasers)
 */
class ContentFilter {
    private $verifier;
    private $policy_engine;
    private $plugin;
    
    public function __construct($verifier, $policy_engine, $plugin) {
        $this->verifier = $verifier;
        $this->policy_engine = $policy_engine;
        $this->plugin = $plugin;
    }
    
    /**
     * Filter content based on policy
     */
    public function filter_content($content) {
        // Skip for admin or logged-in users
        if (is_admin() || is_user_logged_in()) {
            return $content;
        }
        
        // Only filter on singular posts/pages
        if (!is_singular()) {
            return $content;
        }
        
        // Bypass filtering for requests without signature headers (normal browsers)
        // OpenBotAuth only applies to agent requests with RFC 9421 signatures
        if (!$this->verifier->has_signature_headers()) {
            return $content;
        }
        
        global $post;
        
        // Get cached verification (to avoid duplicate verification)
        $verification = $this->plugin->get_verification();
        
        // Get policy
        $policy = $this->policy_engine->get_policy($post);
        
        // Apply policy
        $result = $this->policy_engine->apply_policy($policy, $verification, $post);
        
        // Set response header based on decision
        $this->set_decision_header($result['effect']);
        
        // Handle different effects
        switch ($result['effect']) {
            case 'deny':
                status_header(403);
                return '<p>Access denied.</p>';
                
            // Note: This branch only executes if check_access() is disabled or skipped,
            // since Plugin::check_access() exits on 402 before content filtering runs.
            case 'pay':
                status_header(402);
                if (!empty($result['pay_url'])) {
                    header('Link: <' . $result['pay_url'] . '>; rel="payment"');
                }
                return '<p>Payment required to access this content.</p>';
                
            case 'rate_limit':
                status_header(429);
                if (!empty($result['retry_after'])) {
                    header('Retry-After: ' . $result['retry_after']);
                }
                return '<p>Rate limit exceeded. Please try again later.</p>';
                
            case 'teaser':
                $teaser_words = $result['teaser_words'] ?? $policy['teaser_words'] ?? 100;
                return $this->create_teaser($content, $teaser_words);
                
            case 'allow':
            default:
                return $content;
        }
    }
    
    /**
     * Set X-OBA-Decision header
     */
    private function set_decision_header($effect) {
        if (!headers_sent()) {
            header('X-OBA-Decision: ' . $effect);
        }
    }
    
    /**
     * Create teaser from content
     */
    private function create_teaser($content, $word_count) {
        // Strip HTML tags for word count
        $text = wp_strip_all_tags($content);
        
        // Split into words
        $words = preg_split('/\s+/', $text, -1, PREG_SPLIT_NO_EMPTY);
        
        if (count($words) <= $word_count) {
            return $content; // Content is shorter than teaser
        }
        
        // Get first N words
        $teaser_words = array_slice($words, 0, $word_count);
        $teaser_text = implode(' ', $teaser_words);
        
        // Build teaser HTML
        $teaser = '<div class="openbotauth-teaser">';
        $teaser .= '<div class="teaser-content">' . wpautop($teaser_text) . '...</div>';
        $teaser .= '<div class="teaser-notice">';
        $teaser .= '<p><strong>' . __('Content Preview', 'openbotauth') . '</strong></p>';
        $teaser .= '<p>' . __('This is a preview. Authenticated bots can access the full content.', 'openbotauth') . '</p>';
        $teaser .= '</div>';
        $teaser .= '</div>';
        
        return $teaser;
    }
}

