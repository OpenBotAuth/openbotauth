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
$options = array(
    'openbotauth_verifier_url',
    'openbotauth_use_hosted_verifier',
    'openbotauth_payment_url',
    'openbotauth_policy',
    'openbotauth_feed_enabled',
    'openbotauth_feed_limit',
    'openbotauth_feed_post_types',
    'openbotauth_llms_enabled',
    'openbotauth_prefer_yoast_llms',
    'openbotauth_markdown_enabled',
);

foreach ( $options as $option ) {
    delete_option( $option );
}

// Delete analytics options (prefixed with dates).
global $wpdb;
$wpdb->query(
    $wpdb->prepare(
        "DELETE FROM {$wpdb->options} WHERE option_name LIKE %s",
        'openbotauth_stats_%'
    )
);

// Delete post meta.
$wpdb->query(
    $wpdb->prepare(
        "DELETE FROM {$wpdb->postmeta} WHERE meta_key LIKE %s",
        '_openbotauth_%'
    )
);
