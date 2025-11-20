<?php
/**
 * Plugin Name: OpenBotAuth
 * Plugin URI: https://github.com/OpenBotAuth/openbotauth
 * Description: Secure bot authentication using RFC 9421 HTTP signatures. Control bot access with granular policies, teasers, and 402 payment flows.
 * Version: 0.1.1
 * Author: OpenBotAuth
 * Author URI: https://github.com/OpenBotAuth/openbotauth
 * License: MIT
 * Text Domain: openbotauth
 * Requires at least: 6.0
 * Requires PHP: 8.0
 */

// Prevent direct access
if (!defined('ABSPATH')) {
    exit;
}

// Plugin constants
define('OPENBOTAUTH_VERSION', '0.1.1');
define('OPENBOTAUTH_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('OPENBOTAUTH_PLUGIN_URL', plugin_dir_url(__FILE__));

// Autoloader
spl_autoload_register(function ($class) {
    $prefix = 'OpenBotAuth\\';
    $base_dir = OPENBOTAUTH_PLUGIN_DIR . 'includes/';
    
    $len = strlen($prefix);
    if (strncmp($prefix, $class, $len) !== 0) {
        return;
    }
    
    $relative_class = substr($class, $len);
    $file = $base_dir . str_replace('\\', '/', $relative_class) . '.php';
    
    if (file_exists($file)) {
        require $file;
    }
});

// Initialize plugin
function openbotauth_init() {
    // Load text domain
    load_plugin_textdomain('openbotauth', false, dirname(plugin_basename(__FILE__)) . '/languages');
    
    // Initialize main plugin class
    $plugin = OpenBotAuth\Plugin::get_instance();
    $plugin->init();
}
add_action('plugins_loaded', 'openbotauth_init');

// Activation hook
register_activation_hook(__FILE__, function() {
    // Create default options
    add_option('openbotauth_verifier_url', 'http://localhost:8081/verify');
    add_option('openbotauth_policy', json_encode([
        'default' => [
            'effect' => 'teaser',
            'teaser_words' => 100
        ]
    ]));
    
    flush_rewrite_rules();
});

// Deactivation hook
register_deactivation_hook(__FILE__, function() {
    flush_rewrite_rules();
});

