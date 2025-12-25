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
        
        // Clean up old analytics data (older than 30 days)
        add_action('admin_init', [Analytics::class, 'cleanup_old_stats']);
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
        register_setting('openbotauth', 'openbotauth_verifier_url', [
            'sanitize_callback' => 'esc_url_raw'
        ]);
        register_setting('openbotauth', 'openbotauth_use_hosted_verifier', [
            'sanitize_callback' => [$this, 'sanitize_use_hosted_verifier']
        ]);
        register_setting('openbotauth', 'openbotauth_policy', [
            'sanitize_callback' => [$this, 'sanitize_policy']
        ]);
        register_setting('openbotauth', 'openbotauth_payment_url', [
            'sanitize_callback' => 'esc_url_raw'
        ]);
        
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
            __('Payment Service URL (optional)', 'openbotauth'),
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
        
        // AI Artifacts settings (v0.1.2+)
        register_setting('openbotauth', 'openbotauth_llms_enabled', [
            'type' => 'boolean',
            'default' => true,
            'sanitize_callback' => 'rest_sanitize_boolean',
        ]);
        register_setting('openbotauth', 'openbotauth_feed_enabled', [
            'type' => 'boolean',
            'default' => true,
            'sanitize_callback' => 'rest_sanitize_boolean',
        ]);
        register_setting('openbotauth', 'openbotauth_feed_limit', [
            'type' => 'integer',
            'default' => 50,
            'sanitize_callback' => [$this, 'sanitize_feed_limit'],
        ]);
        register_setting('openbotauth', 'openbotauth_feed_post_types', [
            'type' => 'array',
            'default' => ['post', 'page'],
            'sanitize_callback' => [$this, 'sanitize_feed_post_types'],
        ]);
    }
    
    /**
     * Sanitize feed limit (1-500)
     */
    public function sanitize_feed_limit($value) {
        return min(500, max(1, absint($value)));
    }
    
    /**
     * Sanitize feed post types array
     */
    public function sanitize_feed_post_types($value) {
        if (!is_array($value)) {
            return ['post', 'page'];
        }
        return array_filter($value, 'post_type_exists');
    }
    
    /**
     * Render settings page
     */
    public function render_settings_page() {
        if (!current_user_can('manage_options')) {
            return;
        }
        
        // Get current tab
        $current_tab = isset($_GET['tab']) ? sanitize_key($_GET['tab']) : 'config';
        $tabs = [
            'config' => [
                'label' => __('Configuration', 'openbotauth'),
                'icon' => 'dashicons-admin-settings'
            ],
            'ai-artifacts' => [
                'label' => __('AI Artifacts', 'openbotauth'),
                'icon' => 'dashicons-rest-api'
            ],
            'analytics' => [
                'label' => __('Analytics', 'openbotauth'),
                'icon' => 'dashicons-chart-area'
            ],
        ];
        
        ?>
        <div class="wrap">
            <h1><?php echo esc_html(get_admin_page_title()); ?></h1>
            
            <!-- Tab Navigation -->
            <nav class="nav-tab-wrapper wp-clearfix" style="margin-bottom: 20px;">
                <?php foreach ($tabs as $tab_id => $tab): ?>
                    <a href="<?php echo esc_url(add_query_arg('tab', $tab_id, admin_url('options-general.php?page=openbotauth'))); ?>" 
                       class="nav-tab <?php echo $current_tab === $tab_id ? 'nav-tab-active' : ''; ?>">
                        <span class="dashicons <?php echo esc_attr($tab['icon']); ?>" style="margin-right: 4px; line-height: 1.6;"></span>
                        <?php echo esc_html($tab['label']); ?>
                    </a>
                <?php endforeach; ?>
            </nav>
            
            <?php if ($current_tab === 'config'): ?>
                <!-- Configuration Tab -->
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
                
            <?php elseif ($current_tab === 'ai-artifacts'): ?>
                <!-- AI Artifacts Tab -->
                <?php $this->render_ai_artifacts_section(); ?>
                
            <?php elseif ($current_tab === 'analytics'): ?>
                <!-- Analytics Tab -->
                <?php $this->render_analytics_section(); ?>
                
            <?php endif; ?>
        </div>
        <?php
    }
    
    /**
     * Render analytics section
     * Displays local-only decision counts for the last 7 days.
     * No data is sent to external servers.
     */
    private function render_analytics_section() {
        $stats = Analytics::get_stats(7);
        $totals = Analytics::get_totals(7);
        $meta_totals = Analytics::getMetaTotals(7);
        $meta_stats = Analytics::getMetaStats(7);
        
        $signed = $meta_totals['signed_total'];
        $verified = $meta_totals['verified_total'];
        $percent = $signed > 0 ? round(($verified / $signed) * 100) : 0;
        
        // Calculate grand total of all decisions
        $total_decisions = array_sum($totals);
        
        // Prepare data for chart (reverse to show oldest first)
        $chart_dates = array_keys($stats);
        $chart_data = [];
        foreach ($chart_dates as $date) {
            $day_total = 0;
            foreach ($stats[$date] as $count) {
                $day_total += intval($count);
            }
            $chart_data[] = $day_total;
        }
        $chart_data = array_reverse($chart_data);
        $chart_dates = array_reverse($chart_dates);
        $max_value = max(1, max($chart_data));
        
        ?>
        <style>
            .openbotauth-analytics { max-width: 900px; }
            .openbotauth-stats-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
                gap: 16px;
                margin-bottom: 24px;
            }
            .openbotauth-stat-card {
                background: #fff;
                border: 1px solid #c3c4c7;
                border-radius: 4px;
                padding: 16px 20px;
                position: relative;
            }
            .openbotauth-stat-card.highlight {
                border-left: 4px solid #2271b1;
            }
            .openbotauth-stat-label {
                font-size: 12px;
                color: #646970;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                margin-bottom: 4px;
            }
            .openbotauth-stat-value {
                font-size: 28px;
                font-weight: 600;
                color: #1d2327;
                line-height: 1.2;
            }
            .openbotauth-stat-value.success { color: #00a32a; }
            .openbotauth-stat-value.warning { color: #dba617; }
            .openbotauth-stat-value.info { color: #2271b1; }
            .openbotauth-stat-subtitle {
                font-size: 12px;
                color: #646970;
                margin-top: 4px;
            }
            .openbotauth-progress-bar {
                height: 8px;
                background: #dcdcde;
                border-radius: 4px;
                overflow: hidden;
                margin-top: 8px;
            }
            .openbotauth-progress-fill {
                height: 100%;
                background: linear-gradient(90deg, #2271b1, #00a32a);
                border-radius: 4px;
                transition: width 0.3s ease;
            }
            .openbotauth-chart-container {
                background: #fff;
                border: 1px solid #c3c4c7;
                border-radius: 4px;
                padding: 20px;
                margin-bottom: 24px;
            }
            .openbotauth-chart-title {
                font-size: 14px;
                font-weight: 600;
                color: #1d2327;
                margin-bottom: 16px;
            }
            .openbotauth-chart-svg {
                width: 100%;
                height: 120px;
            }
            .openbotauth-table-section {
                background: #fff;
                border: 1px solid #c3c4c7;
                border-radius: 4px;
                overflow: hidden;
            }
            .openbotauth-table-section table {
                margin: 0;
                border: none;
            }
            .openbotauth-table-header {
                padding: 12px 16px;
                background: #f6f7f7;
                border-bottom: 1px solid #c3c4c7;
                font-weight: 600;
            }
            .openbotauth-decision-badge {
                display: inline-block;
                padding: 2px 8px;
                border-radius: 3px;
                font-size: 11px;
                font-weight: 500;
            }
            .openbotauth-badge-allow { background: #d1fae5; color: #065f46; }
            .openbotauth-badge-teaser { background: #dbeafe; color: #1e40af; }
            .openbotauth-badge-deny { background: #fee2e2; color: #991b1b; }
            .openbotauth-badge-pay { background: #fef3c7; color: #92400e; }
            .openbotauth-badge-rate_limit { background: #f3e8ff; color: #6b21a8; }
        </style>
        
        <div class="openbotauth-analytics">
            <h2><?php _e('Agent Request Analytics', 'openbotauth'); ?></h2>
            <p class="description" style="margin-bottom: 20px;">
                <?php _e('Local-only analytics for signed agent requests (last 7 days). No data is sent to external servers.', 'openbotauth'); ?>
            </p>
            
            <!-- Stats Cards -->
            <div class="openbotauth-stats-grid">
                <div class="openbotauth-stat-card highlight">
                    <div class="openbotauth-stat-label"><?php _e('Signed Requests', 'openbotauth'); ?></div>
                    <div class="openbotauth-stat-value info"><?php echo number_format($signed); ?></div>
                    <div class="openbotauth-stat-subtitle"><?php _e('Total agent requests', 'openbotauth'); ?></div>
                </div>
                
                <div class="openbotauth-stat-card">
                    <div class="openbotauth-stat-label"><?php _e('Verified', 'openbotauth'); ?></div>
                    <div class="openbotauth-stat-value success"><?php echo number_format($verified); ?></div>
                    <div class="openbotauth-stat-subtitle"><?php echo $percent; ?>% <?php _e('success rate', 'openbotauth'); ?></div>
                    <div class="openbotauth-progress-bar">
                        <div class="openbotauth-progress-fill" style="width: <?php echo $percent; ?>%;"></div>
                    </div>
                </div>
                
                <div class="openbotauth-stat-card">
                    <div class="openbotauth-stat-label"><?php _e('Policy Decisions', 'openbotauth'); ?></div>
                    <div class="openbotauth-stat-value"><?php echo number_format($total_decisions); ?></div>
                    <div class="openbotauth-stat-subtitle"><?php _e('Allow, deny, teaser, etc.', 'openbotauth'); ?></div>
                </div>
                
                <div class="openbotauth-stat-card">
                    <div class="openbotauth-stat-label"><?php _e('Allowed', 'openbotauth'); ?></div>
                    <div class="openbotauth-stat-value success"><?php echo number_format($totals['allow']); ?></div>
                    <div class="openbotauth-stat-subtitle"><?php _e('Full content access', 'openbotauth'); ?></div>
                </div>
            </div>
            
            <!-- Chart -->
            <div class="openbotauth-chart-container">
                <div class="openbotauth-chart-title">
                    <span class="dashicons dashicons-chart-area" style="color: #2271b1;"></span>
                    <?php _e('Daily Policy Decisions (7 Days)', 'openbotauth'); ?>
                </div>
                <svg class="openbotauth-chart-svg" viewBox="0 0 700 120" preserveAspectRatio="xMidYMid meet">
                    <!-- Grid lines -->
                    <line x1="40" y1="10" x2="680" y2="10" stroke="#e0e0e0" stroke-width="1"/>
                    <line x1="40" y1="50" x2="680" y2="50" stroke="#e0e0e0" stroke-width="1"/>
                    <line x1="40" y1="90" x2="680" y2="90" stroke="#e0e0e0" stroke-width="1"/>
                    
                    <!-- Y-axis labels -->
                    <text x="35" y="14" text-anchor="end" fill="#646970" font-size="10"><?php echo $max_value; ?></text>
                    <text x="35" y="54" text-anchor="end" fill="#646970" font-size="10"><?php echo round($max_value / 2); ?></text>
                    <text x="35" y="94" text-anchor="end" fill="#646970" font-size="10">0</text>
                    
                    <!-- Bars and labels -->
                    <?php 
                    $bar_width = 70;
                    $gap = 20;
                    $start_x = 60;
                    foreach ($chart_data as $i => $value): 
                        $bar_height = ($value / $max_value) * 80;
                        $x = $start_x + ($i * ($bar_width + $gap));
                        $y = 90 - $bar_height;
                        $date_parts = explode('-', $chart_dates[$i]);
                        $display_date = $date_parts[1] . '/' . $date_parts[2];
                    ?>
                    <rect x="<?php echo $x; ?>" y="<?php echo $y; ?>" width="<?php echo $bar_width; ?>" height="<?php echo $bar_height; ?>" 
                          fill="url(#gradient)" rx="3"/>
                    <text x="<?php echo $x + $bar_width/2; ?>" y="105" text-anchor="middle" fill="#646970" font-size="10"><?php echo $display_date; ?></text>
                    <?php if ($value > 0): ?>
                    <text x="<?php echo $x + $bar_width/2; ?>" y="<?php echo max($y - 5, 8); ?>" text-anchor="middle" fill="#1d2327" font-size="11" font-weight="600"><?php echo $value; ?></text>
                    <?php endif; ?>
                    <?php endforeach; ?>
                    
                    <!-- Gradient definition -->
                    <defs>
                        <linearGradient id="gradient" x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" style="stop-color:#2271b1;stop-opacity:1" />
                            <stop offset="100%" style="stop-color:#135e96;stop-opacity:1" />
                        </linearGradient>
                    </defs>
                </svg>
            </div>
            
            <!-- Decision Breakdown Table -->
            <div class="openbotauth-table-section">
                <div class="openbotauth-table-header">
                    <span class="dashicons dashicons-editor-table" style="color: #646970;"></span>
                    <?php _e('Decision Breakdown by Date', 'openbotauth'); ?>
                </div>
                <table class="widefat" style="border: none;">
                    <thead>
                        <tr>
                            <th style="padding: 12px;"><?php _e('Date', 'openbotauth'); ?></th>
                            <th style="text-align: center; padding: 12px;">
                                <span class="openbotauth-decision-badge openbotauth-badge-allow"><?php _e('Allow', 'openbotauth'); ?></span>
                            </th>
                            <th style="text-align: center; padding: 12px;">
                                <span class="openbotauth-decision-badge openbotauth-badge-teaser"><?php _e('Teaser', 'openbotauth'); ?></span>
                            </th>
                            <th style="text-align: center; padding: 12px;">
                                <span class="openbotauth-decision-badge openbotauth-badge-deny"><?php _e('Deny', 'openbotauth'); ?></span>
                            </th>
                            <th style="text-align: center; padding: 12px;">
                                <span class="openbotauth-decision-badge openbotauth-badge-pay"><?php _e('Pay', 'openbotauth'); ?></span>
                            </th>
                            <th style="text-align: center; padding: 12px;">
                                <span class="openbotauth-decision-badge openbotauth-badge-rate_limit"><?php _e('Rate Limit', 'openbotauth'); ?></span>
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php foreach ($stats as $date => $day_stats): ?>
                        <tr>
                            <td style="padding: 10px 12px; font-weight: 500;"><?php echo esc_html($date); ?></td>
                            <td style="text-align: center; padding: 10px 12px;"><?php echo intval($day_stats['allow']); ?></td>
                            <td style="text-align: center; padding: 10px 12px;"><?php echo intval($day_stats['teaser']); ?></td>
                            <td style="text-align: center; padding: 10px 12px;"><?php echo intval($day_stats['deny']); ?></td>
                            <td style="text-align: center; padding: 10px 12px;"><?php echo intval($day_stats['pay']); ?></td>
                            <td style="text-align: center; padding: 10px 12px;"><?php echo intval($day_stats['rate_limit']); ?></td>
                        </tr>
                        <?php endforeach; ?>
                    </tbody>
                    <tfoot style="background: #f6f7f7;">
                        <tr>
                            <td style="padding: 12px; font-weight: 600;"><?php _e('Total', 'openbotauth'); ?></td>
                            <td style="text-align: center; padding: 12px; font-weight: 600; color: #00a32a;"><?php echo intval($totals['allow']); ?></td>
                            <td style="text-align: center; padding: 12px; font-weight: 600; color: #2271b1;"><?php echo intval($totals['teaser']); ?></td>
                            <td style="text-align: center; padding: 12px; font-weight: 600; color: #d63638;"><?php echo intval($totals['deny']); ?></td>
                            <td style="text-align: center; padding: 12px; font-weight: 600; color: #dba617;"><?php echo intval($totals['pay']); ?></td>
                            <td style="text-align: center; padding: 12px; font-weight: 600; color: #6b21a8;"><?php echo intval($totals['rate_limit']); ?></td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
        <?php
    }
    
    /**
     * Render AI Artifacts section
     * Settings and URLs for llms.txt, feed.json, and markdown endpoints.
     */
    private function render_ai_artifacts_section() {
        $llms_enabled = get_option('openbotauth_llms_enabled', true);
        $feed_enabled = get_option('openbotauth_feed_enabled', true);
        $feed_limit = get_option('openbotauth_feed_limit', 50);
        $feed_post_types = get_option('openbotauth_feed_post_types', ['post', 'page']);
        
        // Yoast detection (v0.1.3+) - informational only, no auto-disable
        $yoast_active = Plugin::yoast_is_active();
        
        // Get available post types
        $available_post_types = get_post_types(['public' => true], 'objects');
        unset($available_post_types['attachment']);
        
        // Generate URLs
        $llms_url = home_url('/llms.txt');
        $llms_wellknown_url = home_url('/.well-known/llms.txt');
        $feed_url = home_url('/.well-known/openbotauth-feed.json');
        
        // Find a sample post for example markdown URL
        $sample_posts = get_posts(['numberposts' => 1, 'post_status' => 'publish']);
        $sample_md_url = $sample_posts ? home_url('/.well-known/openbotauth/posts/' . $sample_posts[0]->ID . '.md') : '';
        
        ?>
        <style>
            .openbotauth-ai-section { max-width: 900px; }
            .openbotauth-urls-card {
                background: #fff;
                border: 1px solid #c3c4c7;
                border-radius: 4px;
                padding: 20px;
                margin-bottom: 24px;
            }
            .openbotauth-url-row {
                display: flex;
                align-items: center;
                padding: 12px 0;
                border-bottom: 1px solid #f0f0f1;
            }
            .openbotauth-url-row:last-child { border-bottom: none; }
            .openbotauth-url-label {
                font-weight: 500;
                color: #1d2327;
                min-width: 160px;
            }
            .openbotauth-url-value {
                flex: 1;
                font-family: Consolas, Monaco, monospace;
                font-size: 13px;
                background: #f6f7f7;
                padding: 6px 10px;
                border-radius: 3px;
                word-break: break-all;
            }
            .openbotauth-url-status {
                margin-left: 12px;
            }
            .openbotauth-status-badge {
                display: inline-block;
                padding: 2px 8px;
                border-radius: 3px;
                font-size: 11px;
                font-weight: 500;
            }
            .openbotauth-badge-enabled { background: #d1fae5; color: #065f46; }
            .openbotauth-badge-disabled { background: #fee2e2; color: #991b1b; }
            .openbotauth-yoast-notice {
                background: #dbeafe;
                border: 1px solid #93c5fd;
                border-radius: 4px;
                padding: 16px 20px;
                margin-bottom: 24px;
                display: flex;
                align-items: flex-start;
                gap: 12px;
            }
            .openbotauth-yoast-notice .dashicons {
                font-size: 20px;
                width: 20px;
                height: 20px;
                margin-top: 2px;
            }
            .openbotauth-yoast-notice-content h4 {
                margin: 0 0 6px 0;
                font-size: 14px;
            }
            .openbotauth-yoast-notice-content p {
                margin: 0;
                color: #4b5563;
            }
            .openbotauth-settings-card {
                background: #fff;
                border: 1px solid #c3c4c7;
                border-radius: 4px;
                padding: 20px;
            }
            .openbotauth-settings-card h3 {
                margin-top: 0;
                padding-bottom: 12px;
                border-bottom: 1px solid #f0f0f1;
            }
        </style>
        
        <div class="openbotauth-ai-section">
            <h2><?php _e('AI-Ready Endpoints', 'openbotauth'); ?></h2>
            <p class="description" style="margin-bottom: 20px;">
                <?php _e('Machine-readable endpoints for AI systems and crawlers. All data is served locally from your site.', 'openbotauth'); ?>
            </p>
            
            <?php if ($yoast_active): ?>
            <!-- Yoast Detection Notice - Informational only -->
            <div class="openbotauth-yoast-notice">
                <span class="dashicons dashicons-info" style="color: #2563eb;"></span>
                <div class="openbotauth-yoast-notice-content">
                    <h4><?php _e('Yoast SEO Detected', 'openbotauth'); ?></h4>
                    <p><?php _e('Yoast may also serve /llms.txt if configured. If you want Yoast to handle llms.txt instead, disable it below. OpenBotAuth\'s feed and markdown endpoints are unique and work alongside any SEO plugin.', 'openbotauth'); ?></p>
                </div>
            </div>
            <?php endif; ?>
            
            <!-- Copy URLs Section -->
            <div class="openbotauth-urls-card">
                <h3 style="margin-top: 0;">
                    <span class="dashicons dashicons-admin-links" style="color: #2271b1;"></span>
                    <?php _e('Your AI-Ready URLs', 'openbotauth'); ?>
                </h3>
                <p class="description" style="margin-bottom: 16px;">
                    <?php _e('Copy these URLs to share with AI tools and crawlers:', 'openbotauth'); ?>
                </p>
                
                <div class="openbotauth-url-row">
                    <div class="openbotauth-url-label"><?php _e('llms.txt', 'openbotauth'); ?></div>
                    <div class="openbotauth-url-value"><?php echo esc_html(esc_url($llms_url)); ?></div>
                    <div class="openbotauth-url-status">
                        <span class="openbotauth-status-badge <?php echo $llms_enabled ? 'openbotauth-badge-enabled' : 'openbotauth-badge-disabled'; ?>">
                            <?php echo $llms_enabled ? __('Enabled', 'openbotauth') : __('Disabled', 'openbotauth'); ?>
                        </span>
                    </div>
                </div>
                
                <div class="openbotauth-url-row">
                    <div class="openbotauth-url-label"><?php _e('llms.txt (well-known)', 'openbotauth'); ?></div>
                    <div class="openbotauth-url-value"><?php echo esc_html(esc_url($llms_wellknown_url)); ?></div>
                    <div class="openbotauth-url-status">
                        <span class="openbotauth-status-badge <?php echo $llms_enabled ? 'openbotauth-badge-enabled' : 'openbotauth-badge-disabled'; ?>">
                            <?php echo $llms_enabled ? __('Enabled', 'openbotauth') : __('Disabled', 'openbotauth'); ?>
                        </span>
                    </div>
                </div>
                
                <div class="openbotauth-url-row">
                    <div class="openbotauth-url-label"><?php _e('JSON Feed', 'openbotauth'); ?></div>
                    <div class="openbotauth-url-value"><?php echo esc_html(esc_url($feed_url)); ?></div>
                    <div class="openbotauth-url-status">
                        <span class="openbotauth-status-badge <?php echo $feed_enabled ? 'openbotauth-badge-enabled' : 'openbotauth-badge-disabled'; ?>">
                            <?php echo $feed_enabled ? __('Enabled', 'openbotauth') : __('Disabled', 'openbotauth'); ?>
                        </span>
                    </div>
                </div>
                
                <?php if ($sample_md_url): ?>
                <div class="openbotauth-url-row">
                    <div class="openbotauth-url-label"><?php _e('Example Markdown', 'openbotauth'); ?></div>
                    <div class="openbotauth-url-value"><?php echo esc_html(esc_url($sample_md_url)); ?></div>
                    <div class="openbotauth-url-status">
                        <span class="openbotauth-status-badge <?php echo $feed_enabled ? 'openbotauth-badge-enabled' : 'openbotauth-badge-disabled'; ?>">
                            <?php echo $feed_enabled ? __('Enabled', 'openbotauth') : __('Disabled', 'openbotauth'); ?>
                        </span>
                    </div>
                </div>
                <?php endif; ?>
            </div>
            
            <!-- Settings Form -->
            <div class="openbotauth-settings-card">
                <h3>
                    <span class="dashicons dashicons-admin-settings" style="color: #646970;"></span>
                    <?php _e('Endpoint Settings', 'openbotauth'); ?>
                </h3>
                
                <form method="post" action="options.php">
                    <?php settings_fields('openbotauth'); ?>
                    
                    <table class="form-table">
                        <tr>
                            <th scope="row"><?php _e('Enable llms.txt', 'openbotauth'); ?></th>
                            <td>
                                <label>
                                    <input type="hidden" name="openbotauth_llms_enabled" value="0">
                                    <input type="checkbox" name="openbotauth_llms_enabled" value="1" <?php checked($llms_enabled); ?>>
                                    <?php _e('Serve /llms.txt and /.well-known/llms.txt endpoints', 'openbotauth'); ?>
                                </label>
                                <p class="description">
                                    <?php _e('Provides an index of your content for AI systems.', 'openbotauth'); ?>
                                    <?php if ($yoast_active): ?>
                                    <br><em><?php _e('Note: If Yoast SEO is configured to serve llms.txt, disable this to avoid conflicts.', 'openbotauth'); ?></em>
                                    <?php endif; ?>
                                </p>
                            </td>
                        </tr>
                        
                        <tr>
                            <th scope="row"><?php _e('Enable Feed + Markdown', 'openbotauth'); ?></th>
                            <td>
                                <label>
                                    <input type="hidden" name="openbotauth_feed_enabled" value="0">
                                    <input type="checkbox" name="openbotauth_feed_enabled" value="1" <?php checked($feed_enabled); ?>>
                                    <?php _e('Serve JSON feed and per-post markdown endpoints', 'openbotauth'); ?>
                                </label>
                                <p class="description">
                                    <?php _e('Provides structured content for AI indexing and retrieval.', 'openbotauth'); ?>
                                </p>
                            </td>
                        </tr>
                        
                        <tr>
                            <th scope="row"><?php _e('Feed Limit', 'openbotauth'); ?></th>
                            <td>
                                <input type="number" name="openbotauth_feed_limit" value="<?php echo esc_attr($feed_limit); ?>" min="1" max="500" class="small-text">
                                <p class="description">
                                    <?php _e('Maximum number of posts in the feed (1-500). Posts are ordered by last modified date.', 'openbotauth'); ?>
                                </p>
                            </td>
                        </tr>
                        
                        <tr>
                            <th scope="row"><?php _e('Post Types', 'openbotauth'); ?></th>
                            <td>
                                <?php foreach ($available_post_types as $post_type): ?>
                                <label style="display: block; margin-bottom: 6px;">
                                    <input type="checkbox" 
                                           name="openbotauth_feed_post_types[]" 
                                           value="<?php echo esc_attr($post_type->name); ?>"
                                           <?php checked(in_array($post_type->name, $feed_post_types)); ?>>
                                    <?php echo esc_html($post_type->label); ?>
                                </label>
                                <?php endforeach; ?>
                                <p class="description">
                                    <?php _e('Which post types to include in the feed.', 'openbotauth'); ?>
                                </p>
                            </td>
                        </tr>
                    </table>
                    
                    <?php submit_button(__('Save AI Settings', 'openbotauth')); ?>
                </form>
            </div>
            
            <!-- Info Box -->
            <div class="notice notice-info" style="margin-top: 20px;">
                <p>
                    <strong><?php _e('Privacy Note:', 'openbotauth'); ?></strong>
                    <?php _e('All endpoints serve content from your local WordPress database. No data is sent to external servers.', 'openbotauth'); ?>
                </p>
                <p>
                    <strong><?php _e('Security:', 'openbotauth'); ?></strong>
                    <?php _e('Only published, non-password-protected posts are exposed. Draft, private, and password-protected content is never included.', 'openbotauth'); ?>
                </p>
            </div>
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
     * Sanitize the use hosted verifier checkbox
     * Just returns boolean - no side effects. The Verifier class handles
     * using the hosted URL when this option is enabled.
     */
    public function sanitize_use_hosted_verifier($value) {
        return (bool) $value;
    }
    
    /**
     * Render verifier URL field
     */
    public function render_verifier_url_field() {
        $value = get_option('openbotauth_verifier_url', '');
        $use_hosted = get_option('openbotauth_use_hosted_verifier', false);
        $hosted_url = 'https://verifier.openbotauth.org/verify';
        ?>
        <p>
            <label>
                <!-- Hidden input ensures unchecking submits value 0 -->
                <input type="hidden" name="openbotauth_use_hosted_verifier" value="0">
                <input type="checkbox" 
                       name="openbotauth_use_hosted_verifier" 
                       id="openbotauth_use_hosted_verifier"
                       value="1" 
                       <?php checked($use_hosted); ?>>
                <?php _e('Use hosted OpenBotAuth verifier', 'openbotauth'); ?>
            </label>
            <span class="description" style="margin-left: 8px;">
                <?php _e('(Fills URL automatically)', 'openbotauth'); ?>
            </span>
        </p>
        <input type="url" 
               name="openbotauth_verifier_url" 
               id="openbotauth_verifier_url"
               value="<?php echo esc_attr($value); ?>" 
               class="regular-text"
               placeholder="<?php echo esc_attr($hosted_url); ?>">
        <p class="description">
            <?php _e('URL of the OpenBotAuth verifier service. Leave empty to disable signature verification (all signed requests will be treated as unverified).', 'openbotauth'); ?>
        </p>
        <script>
        jQuery(document).ready(function($) {
            var hostedUrl = '<?php echo esc_js($hosted_url); ?>';
            $('#openbotauth_use_hosted_verifier').on('change', function() {
                if (this.checked) {
                    $('#openbotauth_verifier_url').val(hostedUrl);
                }
            });
        });
        </script>
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
            <?php _e('Base URL for payment processing (optional). Used with 402 response stub - actual payment integration requires custom implementation.', 'openbotauth'); ?>
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
                <small><?php _e('Returns 402 stub response if > 0 (payment integration requires custom implementation)', 'openbotauth'); ?></small>
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

