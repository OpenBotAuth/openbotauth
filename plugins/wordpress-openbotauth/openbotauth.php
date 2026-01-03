<?php
/**
 * Plugin Name: OpenBotAuth
 * Plugin URI: https://github.com/OpenBotAuth/openbotauth
 * Description: AI bot analytics + signed agent verification (RFC 9421) with local-only stats and AI endpoints (llms.txt, feed, markdown).
 * Version: 0.1.3
 * Author: OpenBotAuth
 * Author URI: https://github.com/OpenBotAuth/openbotauth
 * License: GPLv2 or later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: openbotauth
 * Requires at least: 6.0
 * Requires PHP: 7.4
 */

// Prevent direct access
if (!defined('ABSPATH')) {
    exit;
}

// Plugin constants (defensive definitions)
if (!defined('OPENBOTAUTH_VERSION')) {
    define('OPENBOTAUTH_VERSION', '0.1.3');
}
if (!defined('OPENBOTAUTH_PLUGIN_DIR')) {
    define('OPENBOTAUTH_PLUGIN_DIR', plugin_dir_path(__FILE__));
}
if (!defined('OPENBOTAUTH_PLUGIN_URL')) {
    define('OPENBOTAUTH_PLUGIN_URL', plugin_dir_url(__FILE__));
}

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
    // Verifier URL is empty by default - admin must explicitly configure or enable hosted verifier
    add_option('openbotauth_verifier_url', '');
    add_option('openbotauth_use_hosted_verifier', false);
    add_option('openbotauth_policy', json_encode([
        'default' => [
            'effect' => 'teaser',
            'teaser_words' => 100
        ]
    ]));
    
    // AI Artifacts options (v0.1.2+)
    add_option('openbotauth_llms_enabled', true);
    add_option('openbotauth_feed_enabled', true);
    add_option('openbotauth_feed_limit', 50);
    add_option('openbotauth_feed_post_types', ['post', 'page']);
});

