<?php
namespace OpenBotAuth;

/**
 * Admin Interface
 * Settings page and post meta boxes
 */
class Admin {
    
    public function __construct() {
        add_action('admin_menu', [$this, 'add_menu']);
        add_action('admin_init', [$this, 'register_settings']);
        add_action('add_meta_boxes', [$this, 'add_meta_boxes']);
        add_action('save_post', [$this, 'save_post_meta']);
        add_action('admin_enqueue_scripts', [$this, 'enqueue_scripts']);
        add_action('wp_ajax_openbotauth_save_policy', [$this, 'ajax_save_policy']);
    }
    
    /**
     * Add admin menu
     */
    public function add_menu() {
        add_options_page(
            __('OpenBotAuth Settings', 'openbotauth'),
            __('OpenBotAuth', 'openbotauth'),
            'manage_options',
            'openbotauth',
            [$this, 'render_settings_page']
        );
    }
    
    /**
     * Register settings
     */
    public function register_settings() {
        register_setting('openbotauth', 'openbotauth_verifier_url');
        register_setting('openbotauth', 'openbotauth_policy', [
            'sanitize_callback' => [$this, 'sanitize_policy']
        ]);
        register_setting('openbotauth', 'openbotauth_payment_url');
        
        add_settings_section(
            'openbotauth_general',
            __('General Settings', 'openbotauth'),
            null,
            'openbotauth'
        );
        
        add_settings_field(
            'verifier_url',
            __('Verifier Service URL', 'openbotauth'),
            [$this, 'render_verifier_url_field'],
            'openbotauth',
            'openbotauth_general'
        );
        
        add_settings_field(
            'payment_url',
            __('Payment Service URL', 'openbotauth'),
            [$this, 'render_payment_url_field'],
            'openbotauth',
            'openbotauth_general'
        );
        
        add_settings_section(
            'openbotauth_policy',
            __('Default Policy', 'openbotauth'),
            [$this, 'render_policy_section_description'],
            'openbotauth'
        );
        
        add_settings_field(
            'default_effect',
            __('Default Effect', 'openbotauth'),
            [$this, 'render_default_effect_field'],
            'openbotauth',
            'openbotauth_policy'
        );
        
        add_settings_field(
            'teaser_words',
            __('Teaser Word Count', 'openbotauth'),
            [$this, 'render_teaser_words_field'],
            'openbotauth',
            'openbotauth_policy'
        );
    }
    
    /**
     * Render settings page
     */
    public function render_settings_page() {
        if (!current_user_can('manage_options')) {
            return;
        }
        
        ?>
        <div class="wrap">
            <h1><?php echo esc_html(get_admin_page_title()); ?></h1>
            
            <div class="notice notice-info">
                <p>
                    <strong><?php _e('OpenBotAuth', 'openbotauth'); ?></strong> - 
                    <?php _e('Secure bot authentication using RFC 9421 HTTP signatures.', 'openbotauth'); ?>
                </p>
                <p>
                    <?php _e('Control bot access with granular policies, teasers, and 402 payment flows.', 'openbotauth'); ?>
                    <a href="https://github.com/OpenBotAuth/openbotauth" target="_blank"><?php _e('Documentation', 'openbotauth'); ?></a>
                </p>
            </div>
            
            <form action="options.php" method="post">
                <?php
                settings_fields('openbotauth');
                do_settings_sections('openbotauth');
                submit_button(__('Save Settings', 'openbotauth'));
                ?>
            </form>
            
            <hr>
            
            <h2><?php _e('Advanced Policy Configuration', 'openbotauth'); ?></h2>
            <p><?php _e('For advanced policy configuration (whitelists, blacklists, rate limits), edit the policy JSON directly:', 'openbotauth'); ?></p>
            
            <textarea id="openbotauth-policy-json" rows="15" style="width: 100%; font-family: monospace;">
<?php echo esc_textarea(get_option('openbotauth_policy', '{}')); ?>
            </textarea>
            
            <p>
                <button type="button" class="button button-primary" id="openbotauth-save-policy">
                    <?php _e('Save Policy JSON', 'openbotauth'); ?>
                </button>
                <button type="button" class="button" id="openbotauth-validate-policy">
                    <?php _e('Validate JSON', 'openbotauth'); ?>
                </button>
            </p>
            
            <details>
                <summary><?php _e('Policy JSON Schema', 'openbotauth'); ?></summary>
                <pre style="background: #f5f5f5; padding: 15px; overflow: auto;">
{
  "default": {
    "effect": "allow|deny|teaser",
    "teaser_words": 100,
    "price_cents": 0,
    "currency": "USD",
    "whitelist": ["http://example.com/jwks/agent.json"],
    "blacklist": ["http://badbot.com/*"],
    "rate_limit": {
      "max_requests": 100,
      "window_seconds": 3600
    }
  }
}
                </pre>
            </details>
        </div>
        <?php
    }
    
    /**
     * Sanitize policy settings
     */
    public function sanitize_policy($value) {
        // If we have individual field submissions, build the policy JSON
        if (isset($_POST['openbotauth_default_effect']) || isset($_POST['openbotauth_teaser_words'])) {
            $policy = json_decode($value, true) ?: [];
            
            if (!isset($policy['default'])) {
                $policy['default'] = [];
            }
            
            if (isset($_POST['openbotauth_default_effect'])) {
                $policy['default']['effect'] = sanitize_text_field($_POST['openbotauth_default_effect']);
            }
            
            if (isset($_POST['openbotauth_teaser_words'])) {
                $policy['default']['teaser_words'] = intval($_POST['openbotauth_teaser_words']);
            }
            
            return json_encode($policy);
        }
        
        // Otherwise, validate and return the JSON as-is
        $decoded = json_decode($value, true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            add_settings_error('openbotauth_policy', 'invalid_json', 'Invalid policy JSON');
            return get_option('openbotauth_policy', '{}');
        }
        
        return $value;
    }
    
    /**
     * Render verifier URL field
     */
    public function render_verifier_url_field() {
        $value = get_option('openbotauth_verifier_url', 'http://localhost:8081/verify');
        ?>
        <input type="url" 
               name="openbotauth_verifier_url" 
               value="<?php echo esc_attr($value); ?>" 
               class="regular-text"
               placeholder="http://localhost:8081/verify">
        <p class="description">
            <?php _e('URL of the OpenBotAuth verifier service (Node.js service that verifies RFC 9421 signatures)', 'openbotauth'); ?>
        </p>
        <?php
    }
    
    /**
     * Render payment URL field
     */
    public function render_payment_url_field() {
        $value = get_option('openbotauth_payment_url', '');
        ?>
        <input type="url" 
               name="openbotauth_payment_url" 
               value="<?php echo esc_attr($value); ?>" 
               class="regular-text"
               placeholder="https://payments.example.com/pay">
        <p class="description">
            <?php _e('Base URL for payment processing (optional)', 'openbotauth'); ?>
        </p>
        <?php
    }
    
    /**
     * Render policy section description
     */
    public function render_policy_section_description() {
        echo '<p>' . __('Configure the default policy for all posts. You can override this per-post in the post editor.', 'openbotauth') . '</p>';
    }
    
    /**
     * Render default effect field
     */
    public function render_default_effect_field() {
        $policy = json_decode(get_option('openbotauth_policy', '{}'), true);
        $effect = $policy['default']['effect'] ?? 'allow';
        ?>
        <select name="openbotauth_default_effect">
            <option value="allow" <?php selected($effect, 'allow'); ?>><?php _e('Allow', 'openbotauth'); ?></option>
            <option value="teaser" <?php selected($effect, 'teaser'); ?>><?php _e('Teaser (show preview)', 'openbotauth'); ?></option>
            <option value="deny" <?php selected($effect, 'deny'); ?>><?php _e('Deny', 'openbotauth'); ?></option>
        </select>
        <p class="description">
            <?php _e('What to do when a bot without a valid signature requests content', 'openbotauth'); ?>
        </p>
        <?php
    }
    
    /**
     * Render teaser words field
     */
    public function render_teaser_words_field() {
        $policy = json_decode(get_option('openbotauth_policy', '{}'), true);
        $teaser_words = $policy['default']['teaser_words'] ?? 100;
        ?>
        <input type="number" 
               name="openbotauth_teaser_words" 
               value="<?php echo esc_attr($teaser_words); ?>" 
               min="0" 
               step="10"
               class="small-text">
        <p class="description">
            <?php _e('Number of words to show in teaser (0 = no teaser)', 'openbotauth'); ?>
        </p>
        <?php
    }
    
    /**
     * Add meta boxes to post editor
     */
    public function add_meta_boxes() {
        $post_types = ['post', 'page'];
        
        foreach ($post_types as $post_type) {
            add_meta_box(
                'openbotauth_policy',
                __('OpenBotAuth Policy', 'openbotauth'),
                [$this, 'render_meta_box'],
                $post_type,
                'side',
                'default'
            );
        }
    }
    
    /**
     * Render post meta box
     */
    public function render_meta_box($post) {
        wp_nonce_field('openbotauth_meta', 'openbotauth_meta_nonce');
        
        $policy = get_post_meta($post->ID, '_openbotauth_policy', true);
        $policy = $policy ? json_decode($policy, true) : [];
        
        $enabled = !empty($policy);
        $effect = $policy['effect'] ?? 'allow';
        $teaser_words = $policy['teaser_words'] ?? 100;
        $price_cents = $policy['price_cents'] ?? 0;
        
        ?>
        <p>
            <label>
                <input type="checkbox" 
                       name="openbotauth_enabled" 
                       value="1" 
                       <?php checked($enabled); ?>>
                <?php _e('Override default policy', 'openbotauth'); ?>
            </label>
        </p>
        
        <div id="openbotauth-policy-fields" style="<?php echo $enabled ? '' : 'display:none;'; ?>">
            <p>
                <label><?php _e('Effect', 'openbotauth'); ?></label><br>
                <select name="openbotauth_effect" style="width: 100%;">
                    <option value="allow" <?php selected($effect, 'allow'); ?>><?php _e('Allow', 'openbotauth'); ?></option>
                    <option value="teaser" <?php selected($effect, 'teaser'); ?>><?php _e('Teaser', 'openbotauth'); ?></option>
                    <option value="deny" <?php selected($effect, 'deny'); ?>><?php _e('Deny', 'openbotauth'); ?></option>
                </select>
            </p>
            
            <p>
                <label><?php _e('Teaser Words', 'openbotauth'); ?></label><br>
                <input type="number" 
                       name="openbotauth_teaser_words" 
                       value="<?php echo esc_attr($teaser_words); ?>" 
                       min="0" 
                       style="width: 100%;">
            </p>
            
            <p>
                <label><?php _e('Price (cents)', 'openbotauth'); ?></label><br>
                <input type="number" 
                       name="openbotauth_price_cents" 
                       value="<?php echo esc_attr($price_cents); ?>" 
                       min="0" 
                       style="width: 100%;">
                <small><?php _e('402 payment required if > 0', 'openbotauth'); ?></small>
            </p>
        </div>
        
        <script>
        jQuery(document).ready(function($) {
            $('input[name="openbotauth_enabled"]').on('change', function() {
                $('#openbotauth-policy-fields').toggle(this.checked);
            });
        });
        </script>
        <?php
    }
    
    /**
     * Save post meta
     */
    public function save_post_meta($post_id) {
        // Check nonce
        if (!isset($_POST['openbotauth_meta_nonce']) || 
            !wp_verify_nonce($_POST['openbotauth_meta_nonce'], 'openbotauth_meta')) {
            return;
        }
        
        // Check autosave
        if (defined('DOING_AUTOSAVE') && DOING_AUTOSAVE) {
            return;
        }
        
        // Check permissions
        if (!current_user_can('edit_post', $post_id)) {
            return;
        }
        
        // Save or delete policy
        if (isset($_POST['openbotauth_enabled']) && $_POST['openbotauth_enabled']) {
            $policy = [
                'effect' => sanitize_text_field($_POST['openbotauth_effect'] ?? 'allow'),
                'teaser_words' => intval($_POST['openbotauth_teaser_words'] ?? 100),
                'price_cents' => intval($_POST['openbotauth_price_cents'] ?? 0),
            ];
            
            update_post_meta($post_id, '_openbotauth_policy', json_encode($policy));
        } else {
            delete_post_meta($post_id, '_openbotauth_policy');
        }
    }
    
    /**
     * Enqueue admin scripts
     */
    public function enqueue_scripts($hook) {
        if ('settings_page_openbotauth' !== $hook) {
            return;
        }
        
        wp_enqueue_script(
            'openbotauth-admin',
            OPENBOTAUTH_PLUGIN_URL . 'assets/admin.js',
            ['jquery'],
            OPENBOTAUTH_VERSION,
            true
        );
        
        wp_localize_script('openbotauth-admin', 'openbotauth', [
            'ajax_url' => admin_url('admin-ajax.php'),
            'nonce' => wp_create_nonce('openbotauth_admin'),
        ]);
    }
    
    /**
     * AJAX handler to save policy JSON
     */
    public function ajax_save_policy() {
        check_ajax_referer('openbotauth_admin', 'nonce');
        
        if (!current_user_can('manage_options')) {
            wp_send_json_error('Insufficient permissions');
            return;
        }
        
        $policy = wp_unslash($_POST['policy'] ?? '');
        
        // Validate JSON
        $decoded = json_decode($policy, true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            wp_send_json_error('Invalid JSON: ' . json_last_error_msg());
            return;
        }
        
        // Save
        update_option('openbotauth_policy', $policy);
        
        wp_send_json_success('Policy saved');
    }
}

