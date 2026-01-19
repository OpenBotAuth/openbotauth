<?php
/**
 * OpenBotAuth Uninstall
 *
 * Fired when the plugin is uninstalled to clean up options from the database.
 *
 * @package OpenBotAuth
 */

// If uninstall not called from WordPress, exit.
if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}

// Delete plugin options.
delete_option( 'openbotauth_verifier_url' );
delete_option( 'openbotauth_use_hosted_verifier' );
delete_option( 'openbotauth_payment_url' );
delete_option( 'openbotauth_policy' );
delete_option( 'openbotauth_feed_enabled' );
delete_option( 'openbotauth_feed_limit' );
delete_option( 'openbotauth_feed_post_types' );
delete_option( 'openbotauth_llms_enabled' );
delete_option( 'openbotauth_prefer_yoast_llms' );
delete_option( 'openbotauth_markdown_enabled' );

// Delete all analytics options using SQL LIKE query.
// This ensures all stats are cleaned up regardless of date or format.
global $wpdb;

$openbotauth_prefixes = array(
	'openbotauth_stats_',      // Daily decision stats.
	'openbotauth_meta_stats_', // Meta stats (signed/verified totals).
	'openbotauth_bot_stats_',  // Per-bot request counts.
	'openbotauth_ref_stats_',  // Referrer traffic stats.
);

foreach ( $openbotauth_prefixes as $openbotauth_prefix ) {
	// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- Uninstall cleanup requires direct query.
	$openbotauth_options = $wpdb->get_col(
		$wpdb->prepare(
			"SELECT option_name FROM {$wpdb->options} WHERE option_name LIKE %s",
			$openbotauth_prefix . '%'
		)
	);

	foreach ( $openbotauth_options as $openbotauth_option ) {
		// Validate option name matches expected pattern (prefix + alphanumeric/underscore/hyphen).
		if ( preg_match( '/^openbotauth_[a-z0-9_-]+$/i', $openbotauth_option ) ) {
			delete_option( $openbotauth_option );
		}
	}
}

// Delete cleanup transient.
delete_transient( 'openbotauth_cleanup_ran' );

// Delete post meta using delete_metadata.
delete_metadata( 'post', 0, '_openbotauth_policy', '', true );
