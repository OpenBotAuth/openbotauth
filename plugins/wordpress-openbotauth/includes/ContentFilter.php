<?php
namespace OpenBotAuth;

/**
 * Content Filter
 * Filters post content based on policy (e.g., teasers)
 */
class ContentFilter {
    private $verifier;
    private $policy_engine;
    
    public function __construct($verifier, $policy_engine) {
        $this->verifier = $verifier;
        $this->policy_engine = $policy_engine;
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
        
        global $post;
        
        // Verify signature
        $verification = $this->verifier->verify_request();
        
        // Get policy
        $policy = $this->policy_engine->get_policy($post);
        
        // Apply policy
        $result = $this->policy_engine->apply_policy($policy, $verification, $post);
        
        // Handle teaser
        if ($result['effect'] === 'teaser' || (!$verification['verified'] && !empty($policy['teaser_words']))) {
            $teaser_words = $result['teaser_words'] ?? $policy['teaser_words'] ?? 100;
            return $this->create_teaser($content, $teaser_words);
        }
        
        return $content;
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

