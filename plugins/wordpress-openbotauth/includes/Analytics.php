<?php
namespace OpenBotAuth;

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
        
        for ($i = 0; $i < $days; $i++) {
            $date = date('Y-m-d', strtotime("-{$i} days", current_time('timestamp')));
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
        
        // Atomic upsert: insert 1 or increment existing value
        $wpdb->query(
            $wpdb->prepare(
                "INSERT INTO {$wpdb->options} (option_name, option_value, autoload)
                 VALUES (%s, %s, 'no')
                 ON DUPLICATE KEY UPDATE option_value = CAST(option_value AS UNSIGNED) + 1",
                $option_name,
                '1'
            )
        );
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
        
        for ($i = 0; $i < $days; $i++) {
            $date = date('Y-m-d', strtotime("-{$i} days", current_time('timestamp')));
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
    
    /**
     * Clean up old stats (older than 30 days)
     * Throttled to run at most once per day via transient.
     * Cleans both OPTION_PREFIX and META_STATS_PREFIX options.
     */
    public static function cleanup_old_stats() {
        // Throttle: only run once per day
        $transient_key = 'openbotauth_cleanup_ran';
        if (get_transient($transient_key)) {
            return; // Already ran today
        }
        
        global $wpdb;
        
        $cutoff_date = date('Y-m-d', strtotime('-30 days', current_time('timestamp')));
        
        // Clean up BOTH prefixes
        $prefixes = [self::OPTION_PREFIX, self::META_STATS_PREFIX];
        
        foreach ($prefixes as $prefix) {
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

