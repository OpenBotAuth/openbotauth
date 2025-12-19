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
     *
     * @param string $key The counter key (signed_total, verified_total)
     */
    public static function incrementMeta($key) {
        $valid_keys = ['signed_total', 'verified_total'];
        if (!in_array($key, $valid_keys, true)) {
            return;
        }
        
        $date = current_time('Y-m-d');
        $option_name = self::META_STATS_PREFIX . $date;
        
        $stats = get_option($option_name, []);
        $stats[$key] = ($stats[$key] ?? 0) + 1;
        
        update_option($option_name, $stats, false); // false = don't autoload
    }
    
    /**
     * Get meta stats for the last N days
     *
     * @param int $days Number of days to retrieve (default 7)
     * @return array Array of date => stats pairs
     */
    public static function getMetaStats($days = 7) {
        $stats = [];
        
        for ($i = 0; $i < $days; $i++) {
            $date = date('Y-m-d', strtotime("-{$i} days", current_time('timestamp')));
            $option_name = self::META_STATS_PREFIX . $date;
            $day_stats = get_option($option_name, ['signed_total' => 0, 'verified_total' => 0]);
            
            // Ensure both keys have a value
            if (!isset($day_stats['signed_total'])) {
                $day_stats['signed_total'] = 0;
            }
            if (!isset($day_stats['verified_total'])) {
                $day_stats['verified_total'] = 0;
            }
            
            $stats[$date] = $day_stats;
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
                $date = str_replace($prefix, '', $option_name);
                
                if ($date < $cutoff_date) {
                    delete_option($option_name);
                }
            }
        }
        
        // Mark as run for 24 hours
        set_transient($transient_key, true, DAY_IN_SECONDS);
    }
}

