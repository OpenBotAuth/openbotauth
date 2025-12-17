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
    
    /**
     * Clean up old stats (older than 30 days)
     * Throttled to run at most once per day via transient.
     */
    public static function cleanup_old_stats() {
        // Throttle: only run once per day
        $transient_key = 'openbotauth_cleanup_ran';
        if (get_transient($transient_key)) {
            return; // Already ran today
        }
        
        global $wpdb;
        
        $cutoff_date = date('Y-m-d', strtotime('-30 days', current_time('timestamp')));
        $prefix = self::OPTION_PREFIX;
        
        // Find all openbotauth_stats_ options
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
        
        // Mark as run for 24 hours
        set_transient($transient_key, true, DAY_IN_SECONDS);
    }
}

