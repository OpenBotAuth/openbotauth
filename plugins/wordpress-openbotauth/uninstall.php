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

// Delete analytics options for the last 30 days.
for ( $openbotauth_i = 0; $openbotauth_i < 30; $openbotauth_i++ ) {
    $openbotauth_date = gmdate( 'Y-m-d', strtotime( "-{$openbotauth_i} days" ) );
    delete_option( "openbotauth_stats_{$openbotauth_date}" );
    delete_option( "openbotauth_stats_{$openbotauth_date}_requests" );
    delete_option( "openbotauth_stats_{$openbotauth_date}_signed" );
    delete_option( "openbotauth_stats_{$openbotauth_date}_verified" );
}

// Delete post meta using delete_metadata.
delete_metadata( 'post', 0, '_openbotauth_policy', '', true );
