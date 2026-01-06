<?php
namespace OpenBotAuth;

// Prevent direct access
if (!defined('ABSPATH')) {
    exit;
}

/**
 * Local-only Analytics
 * Tracks daily decision counts stored in WordPress options.
 * No data is sent to external servers.
 */
class Analytics {
    
    /**
     * Option name prefix for daily stats
     */
    const OPTION_PREFIX = 'openbotauth_stats_';
    
    /**
     * Option name prefix for meta stats (signed/verified totals)
     */
    const META_STATS_PREFIX = 'openbotauth_meta_stats_';
    
    /**
     * Option name prefix for bot-specific stats
     */
    const BOT_STATS_PREFIX = 'openbotauth_bot_stats_';
    
    /**
     * Option name prefix for referrer stats (e.g., ChatGPT, Perplexity traffic)
     */
    const REF_STATS_PREFIX = 'openbotauth_ref_stats_';
    
    /**
     * Valid decision types to track
     */
    const DECISION_TYPES = ['allow', 'teaser', 'deny', 'pay', 'rate_limit'];
    
    /**
     * Increment a decision counter for today
     *
     * @param string $decision The decision type (allow, teaser, deny, pay, rate_limit)
     */
    public static function increment($decision) {
        if (!in_array($decision, self::DECISION_TYPES, true)) {
            return;
        }
        
        $date = current_time('Y-m-d');
        $option_name = self::OPTION_PREFIX . $date;
        
        $stats = get_option($option_name, []);
        
        if (!isset($stats[$decision])) {
            $stats[$decision] = 0;
        }
        
        $stats[$decision]++;
        
        update_option($option_name, $stats, false); // false = don't autoload
    }
    
    /**
     * Get stats for the last N days
     *
     * @param int $days Number of days to retrieve (default 7)
     * @return array Array of date => stats pairs
     */
    public static function get_stats($days = 7) {
        $stats = [];
        
        // Use DateTime with WordPress timezone to match write operations (current_time('Y-m-d'))
        // Note: strtotime() without base uses PHP timezone, causing mismatches with WP timezone
        $wp_now = new \DateTime('now', wp_timezone());
        
        for ($i = 0; $i < $days; $i++) {
            $date = (clone $wp_now)->modify("-{$i} days")->format('Y-m-d');
            $option_name = self::OPTION_PREFIX . $date;
            $day_stats = get_option($option_name, []);
            
            // Ensure all decision types have a value
            foreach (self::DECISION_TYPES as $type) {
                if (!isset($day_stats[$type])) {
                    $day_stats[$type] = 0;
                }
            }
            
            $stats[$date] = $day_stats;
        }
        
        return $stats;
    }
    
    /**
     * Get total counts across all days
     *
     * @param int $days Number of days to sum
     * @return array Totals per decision type
     */
    public static function get_totals($days = 7) {
        $stats = self::get_stats($days);
        $totals = [];
        
        foreach (self::DECISION_TYPES as $type) {
            $totals[$type] = 0;
        }
        
        foreach ($stats as $day_stats) {
            foreach (self::DECISION_TYPES as $type) {
                $totals[$type] += $day_stats[$type] ?? 0;
            }
        }
        
        return $totals;
    }
    
    // =========================================================================
    // Meta Stats (signed_total, verified_total) - separate namespace
    // =========================================================================
    
    /**
     * Increment a meta counter for today
     * Uses atomic INSERT ... ON DUPLICATE KEY UPDATE for race-condition safety.
     * Stores one option per day per key (e.g., openbotauth_meta_stats_2025-12-19__signed_total)
     *
     * @param string $key The counter key (signed_total, verified_total)
     */
    public static function incrementMeta($key) {
        $valid_keys = ['signed_total', 'verified_total'];
        if (!in_array($key, $valid_keys, true)) {
            return;
        }
        
        global $wpdb;
        
        $date = current_time('Y-m-d');
        // Store one option per key per day for atomic increments
        $option_name = self::META_STATS_PREFIX . $date . '__' . $key;
        
        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- Atomic upsert required for concurrent analytics
        $wpdb->query(
            $wpdb->prepare(
                "INSERT INTO {$wpdb->options} (option_name, option_value, autoload)
                 VALUES (%s, %s, 'no')
                 ON DUPLICATE KEY UPDATE option_value = CAST(option_value AS UNSIGNED) + 1",
                $option_name,
                '1'
            )
        );
        
        // Clear object cache to prevent stale reads on hosts with persistent caching
        wp_cache_delete($option_name, 'options');
    }
    
    /**
     * Get meta stats for the last N days
     * Reads from per-key options (e.g., openbotauth_meta_stats_2025-12-19__signed_total)
     *
     * @param int $days Number of days to retrieve (default 7)
     * @return array Array of date => stats pairs
     */
    public static function getMetaStats($days = 7) {
        $stats = [];
        
        // Use DateTime with WordPress timezone to match write operations
        $wp_now = new \DateTime('now', wp_timezone());
        
        for ($i = 0; $i < $days; $i++) {
            $date = (clone $wp_now)->modify("-{$i} days")->format('Y-m-d');
            $base = self::META_STATS_PREFIX . $date . '__';
            
            $stats[$date] = [
                'signed_total'   => intval(get_option($base . 'signed_total', 0)),
                'verified_total' => intval(get_option($base . 'verified_total', 0)),
            ];
        }
        
        return $stats;
    }
    
    /**
     * Get meta totals across all days
     *
     * @param int $days Number of days to sum
     * @return array Totals for signed_total and verified_total
     */
    public static function getMetaTotals($days = 7) {
        $stats = self::getMetaStats($days);
        $totals = ['signed_total' => 0, 'verified_total' => 0];
        
        foreach ($stats as $day_stats) {
            $totals['signed_total'] += $day_stats['signed_total'] ?? 0;
            $totals['verified_total'] += $day_stats['verified_total'] ?? 0;
        }
        
        return $totals;
    }
    
    // =========================================================================
    // Bot Stats (per-bot request/signed/verified counts) - separate namespace
    // =========================================================================
    
    /**
     * Increment a bot-specific counter for today
     * Uses atomic INSERT ... ON DUPLICATE KEY UPDATE for race-condition safety.
     * Option name format: openbotauth_bot_stats_YYYY-MM-DD__{bot_id}__{key}
     *
     * @param string $bot_id The bot identifier (e.g., 'gptbot', 'perplexitybot')
     * @param string $key The counter key (requests_total, signed_total, verified_total)
     */
    public static function incrementBotStat(string $bot_id, string $key): void {
        $valid_keys = ['requests_total', 'signed_total', 'verified_total'];
        if (!in_array($key, $valid_keys, true)) {
            return;
        }
        
        // Sanitize bot_id to safe key
        $bot_id = sanitize_key($bot_id);
        if (empty($bot_id)) {
            return;
        }
        
        global $wpdb;
        
        $date = current_time('Y-m-d');
        $option_name = self::BOT_STATS_PREFIX . $date . '__' . $bot_id . '__' . $key;
        
        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- Atomic upsert required for concurrent analytics
        $wpdb->query(
            $wpdb->prepare(
                "INSERT INTO {$wpdb->options} (option_name, option_value, autoload)
                 VALUES (%s, %s, 'no')
                 ON DUPLICATE KEY UPDATE option_value = CAST(option_value AS UNSIGNED) + 1",
                $option_name,
                '1'
            )
        );
        
        // Clear object cache to prevent stale reads on hosts with persistent caching
        wp_cache_delete($option_name, 'options');
    }
    
    /**
     * Get bot totals across the last N days
     * Returns array keyed by bot_id with metadata and counts
     *
     * @param int $days Number of days to sum (default 7)
     * @return array Bot totals with metadata
     */
    public static function getBotTotals(int $days = 7): array {
        $bots = BotDetector::get_known_bots();
        $result = [];
        $now = current_time('timestamp');
        
        foreach ($bots as $bot_id => $bot) {
            // Sanitize bot_id consistently with incrementBotStat()
            $safe_id = sanitize_key($bot_id);
            if (empty($safe_id)) {
                continue;
            }
            
            $requests_total = 0;
            $signed_total = 0;
            $verified_total = 0;
            
            // Use DateTime with WordPress timezone to match write operations
            $wp_now = new \DateTime('now', wp_timezone());
            
            // Sum counts for each day
            for ($i = 0; $i < $days; $i++) {
                $date = (clone $wp_now)->modify("-{$i} days")->format('Y-m-d');
                $base = self::BOT_STATS_PREFIX . $date . '__' . $safe_id . '__';
                
                $requests_total += intval(get_option($base . 'requests_total', 0));
                $signed_total += intval(get_option($base . 'signed_total', 0));
                $verified_total += intval(get_option($base . 'verified_total', 0));
            }
            
            $result[$bot_id] = [
                'name' => $bot['name'],
                'vendor' => $bot['vendor'],
                'category' => $bot['category'],
                'requests_total' => $requests_total,
                'signed_total' => $signed_total,
                'verified_total' => $verified_total,
            ];
        }
        
        return $result;
    }
    
    // =========================================================================
    // Referrer Stats (traffic from AI chat sources) - separate namespace
    // =========================================================================
    
    /**
     * Known referrer sources to track
     * Detected via HTTP Referer header or utm_source query parameter
     */
    const KNOWN_REF_SOURCES = ['chatgpt', 'perplexity', 'claude', 'gemini', 'copilot'];
    
    /**
     * Increment a referrer source counter for today
     * Uses atomic INSERT ... ON DUPLICATE KEY UPDATE for race-condition safety.
     * Option name format: openbotauth_ref_stats_YYYY-MM-DD__{source_key}__total
     *
     * @param string $source_key The referrer source key (e.g., 'chatgpt', 'perplexity')
     */
    public static function incrementRefStat(string $source_key): void {
        // Sanitize source_key to safe key
        $source_key = sanitize_key($source_key);
        if (empty($source_key)) {
            return;
        }
        
        global $wpdb;
        
        $date = current_time('Y-m-d');
        $option_name = self::REF_STATS_PREFIX . $date . '__' . $source_key . '__total';
        
        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- Atomic upsert required for concurrent analytics
        $wpdb->query(
            $wpdb->prepare(
                "INSERT INTO {$wpdb->options} (option_name, option_value, autoload)
                 VALUES (%s, %s, 'no')
                 ON DUPLICATE KEY UPDATE option_value = CAST(option_value AS UNSIGNED) + 1",
                $option_name,
                '1'
            )
        );
        
        // Clear object cache to prevent stale reads on hosts with persistent caching
        wp_cache_delete($option_name, 'options');
        // Clear negative cache as well (prevents "still 0" bugs on some hosts)
        wp_cache_delete('notoptions', 'options');
    }
    
    /**
     * Get referrer totals across the last N days
     * Returns array keyed by source with total counts
     *
     * @param int $days Number of days to sum (default 7)
     * @return array Referrer totals keyed by source (e.g., ['chatgpt' => 12, 'perplexity' => 3])
     */
    public static function getRefTotals(int $days = 7): array {
        $result = [];
        
        // Use DateTime with WordPress timezone to match write operations
        $wp_now = new \DateTime('now', wp_timezone());
        
        foreach (self::KNOWN_REF_SOURCES as $source_key) {
            $total = 0;
            
            // Sum counts for each day
            for ($i = 0; $i < $days; $i++) {
                $date = (clone $wp_now)->modify("-{$i} days")->format('Y-m-d');
                $option_name = self::REF_STATS_PREFIX . $date . '__' . $source_key . '__total';
                $total += intval(get_option($option_name, 0));
            }
            
            $result[$source_key] = $total;
        }
        
        return $result;
    }
    
    /**
     * Clean up old stats (older than 30 days)
     * Throttled to run at most once per day via transient.
     * Cleans OPTION_PREFIX, META_STATS_PREFIX, and BOT_STATS_PREFIX options.
     */
    public static function cleanup_old_stats() {
        // Throttle: only run once per day
        $transient_key = 'openbotauth_cleanup_ran';
        if (get_transient($transient_key)) {
            return; // Already ran today
        }
        
        global $wpdb;
        
        // Use DateTime with WordPress timezone to match write operations
        $cutoff_date = (new \DateTime('now', wp_timezone()))->modify('-30 days')->format('Y-m-d');
        
        // Clean up ALL stat prefixes
        $prefixes = [self::OPTION_PREFIX, self::META_STATS_PREFIX, self::BOT_STATS_PREFIX, self::REF_STATS_PREFIX];
        
        foreach ($prefixes as $prefix) {
            // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- Cleanup query for old analytics options
            $options = $wpdb->get_col(
                $wpdb->prepare(
                    "SELECT option_name FROM {$wpdb->options} WHERE option_name LIKE %s",
                    $prefix . '%'
                )
            );
            
            foreach ($options as $option_name) {
                // Extract date from option name
                $rest = str_replace($prefix, '', $option_name);
                
                // For META_STATS_PREFIX, format is YYYY-MM-DD__key, extract first 10 chars
                // For OPTION_PREFIX, format is just YYYY-MM-DD
                $date = substr($rest, 0, 10);
                
                // Validate it looks like a date before comparing
                if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) && $date < $cutoff_date) {
                    delete_option($option_name);
                }
            }
        }
        
        // Mark as run for 24 hours
        set_transient($transient_key, true, DAY_IN_SECONDS);
    }
}

