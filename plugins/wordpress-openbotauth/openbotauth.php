<?php
/**
 * Plugin Name: OpenBotAuth – AI Crawler Access Control
 * Plugin URI: https://openbotauth.org
 * Description: Verify AI crawlers with HTTP Signatures and enforce allow/deny/teaser policies; also serves llms.txt and AI-ready feeds.
 * Version: 1.0.0
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
    define('OPENBOTAUTH_VERSION', '1.0.0');
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
    // Text domain loaded automatically by WordPress 4.6+ for plugins on WordPress.org
    
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
    add_option('openbotauth_policy', wp_json_encode([
        'default' => [
            'effect' => 'teaser',
            'teaser_words' => 100
        ]
    ]));
    
    // AI Artifacts options (v0.1.2+)
    // Use add_option() which only adds if the option doesn't exist (built-in check)
    // and properly supports autoload as the 4th parameter
    // Note: add_option() signature is ($option, $value, $deprecated, $autoload)
    // Use boolean true (not string '1') to match register_setting type declaration in Admin.php
    add_option('openbotauth_llms_enabled', true, '', true);
    add_option('openbotauth_feed_enabled', true, '', true);
    add_option('openbotauth_feed_limit', 100, '', true);
    add_option('openbotauth_feed_post_types', ['post', 'page'], '', true);
});

