<?php
namespace OpenBotAuth;

// Prevent direct access
if (!defined('ABSPATH')) {
    exit;
}

/**
 * Bot Detector
 * Detects known bots from User-Agent strings.
 * AI-focused for v1 - traditional crawlers like Googlebot/bingbot omitted
 * to reduce DB churn and keep the table focused on AI bots.
 */
class BotDetector {
    
    /**
     * Static catalog of known bots
     * Each bot has: name, vendor, category, ua_tokens (substrings to match)
     */
    private static $catalog = [
        'gptbot' => [
            'name' => 'GPTBot',
            'vendor' => 'OpenAI',
            'category' => 'AI training',
            'ua_tokens' => ['GPTBot'],
        ],
        'oai-searchbot' => [
            'name' => 'OAI-SearchBot',
            'vendor' => 'OpenAI',
            'category' => 'AI search',
            'ua_tokens' => ['OAI-SearchBot', 'OpenAI-SearchBot'],
        ],
        'chatgpt-user' => [
            'name' => 'ChatGPT-User',
            'vendor' => 'OpenAI',
            'category' => 'AI assistant',
            'ua_tokens' => ['ChatGPT-User'],
        ],
        'perplexitybot' => [
            'name' => 'PerplexityBot',
            'vendor' => 'Perplexity',
            'category' => 'AI search',
            'ua_tokens' => ['PerplexityBot', 'Perplexity-User'],
        ],
        'claudebot' => [
            'name' => 'ClaudeBot',
            'vendor' => 'Anthropic',
            'category' => 'AI training',
            'ua_tokens' => ['ClaudeBot'],
        ],
        'ccbot' => [
            'name' => 'CCBot',
            'vendor' => 'Common Crawl',
            'category' => 'AI training',
            'ua_tokens' => ['CCBot'],
        ],
        'applebot' => [
            'name' => 'Applebot',
            'vendor' => 'Apple',
            'category' => 'AI search',
            'ua_tokens' => ['Applebot'],
        ],
        'duckduckbot' => [
            'name' => 'DuckDuckBot',
            'vendor' => 'DuckDuckGo',
            'category' => 'AI search',
            'ua_tokens' => ['DuckDuckBot', 'DuckAssistBot'],
        ],
    ];
    
    /**
     * Detect bot ID from User-Agent string
     *
     * @param string $ua The User-Agent header value
     * @return string|null The bot ID if matched, null otherwise
     */
    public static function detect_bot_id_from_user_agent(string $ua): ?string {
        if (empty($ua)) {
            return null;
        }
        
        $bots = self::get_known_bots();
        
        foreach ($bots as $bot_id => $bot) {
            foreach ($bot['ua_tokens'] as $token) {
                // Case-insensitive substring match
                if (stripos($ua, $token) !== false) {
                    return $bot_id;
                }
            }
        }
        
        return null;
    }
    
    /**
     * Get the catalog of known bots
     * Wrapped in apply_filters to allow extension by other plugins/themes
     *
     * @return array The bot catalog
     */
    public static function get_known_bots(): array {
        /**
         * Filter the known bots catalog
         *
         * @param array $catalog Array of bot definitions keyed by bot_id
         */
        return apply_filters('openbotauth_known_bots', self::$catalog);
    }
}

