<?php
/**
 * AI Endpoints Router
 *
 * Handles early request interception for AI-ready endpoints:
 * - /llms.txt and /.well-known/llms.txt
 * - /.well-known/openbotauth-feed.json
 * - /.well-known/openbotauth/posts/{ID}.md
 *
 * No rewrite rules. Uses parse_request hook at priority 0.
 *
 * @package OpenBotAuth
 * @since 0.1.2
 */

namespace OpenBotAuth\Endpoints;

// Prevent direct access
if (!defined('ABSPATH')) {
    exit;
}

use OpenBotAuth\Content\MetadataProviderInterface;
use OpenBotAuth\Plugin;

/**
 * Router for AI-ready endpoints.
 */
class Router {

    /**
     * @var MetadataProviderInterface
     */
    private $metadata;

    /**
     * Constructor.
     *
     * @param MetadataProviderInterface $metadata The metadata provider.
     */
    public function __construct(MetadataProviderInterface $metadata) {
        $this->metadata = $metadata;
    }

    /**
     * Handle incoming request.
     *
     * Called on parse_request hook at priority 0.
     * Exits early if serving an AI endpoint, otherwise returns for normal WP routing.
     *
     * @param \WP $wp The WordPress environment instance.
     * @return void
     */
    public function handle_request($wp): void {
        $route = $this->get_relative_route();

        // llms.txt (both paths)
        if (in_array($route, ['/llms.txt', '/.well-known/llms.txt'], true)) {
            Plugin::track_referrer_stat();
            if ($this->is_llms_enabled()) {
                $this->serve_llms_txt();
            } else {
                $this->serve_disabled_endpoint();
            }
            return;
        }

        // feed.json
        if ($route === '/.well-known/openbotauth-feed.json') {
            Plugin::track_referrer_stat();
            if ($this->is_feed_enabled()) {
                $this->serve_feed_json();
            } else {
                $this->serve_disabled_endpoint();
            }
            return;
        }

        // markdown posts
        if (preg_match('#^/\.well-known/openbotauth/posts/(\d+)\.md$#', $route, $matches)) {
            Plugin::track_referrer_stat();
            if ($this->is_markdown_enabled()) {
                $this->serve_post_markdown((int) $matches[1]);
            } else {
                $this->serve_disabled_endpoint();
            }
            return;
        }

        // No match - let WP continue routing
    }

    /**
     * Get relative route from request URI.
     *
     * Handles subdirectory installs correctly by stripping the base path.
     *
     * @return string The relative route (e.g., "/llms.txt").
     */
    private function get_relative_route(): string {
        // Note: Don't use sanitize_text_field() on URIs - it strips percent-encoded chars like %20
        // wp_parse_url() safely extracts the path component without executing any code
        $request_uri = isset($_SERVER['REQUEST_URI']) 
            ? wp_parse_url( wp_unslash( $_SERVER['REQUEST_URI'] ), PHP_URL_PATH ) 
            : '/';
        
        if ($request_uri === null || $request_uri === false) {
            $request_uri = '/';
        }

        $base_path = wp_parse_url(home_url('/'), PHP_URL_PATH);
        if ($base_path === null || $base_path === false) {
            $base_path = '/';
        }

        // Normalize: remove trailing slash from base (except for root)
        $base = rtrim($base_path, '/');

        // If we have a base path and request starts with it, strip it
        // Must check directory boundary to avoid /blog matching /blog2
        if ($base !== '' && strpos($request_uri, $base) === 0) {
            $next_char = substr($request_uri, strlen($base), 1);
            // Only match if next char is '/' (directory boundary) or empty (exact match)
            if ($next_char === '/' || $next_char === '' || $next_char === false) {
                $route = substr($request_uri, strlen($base));
                if ($route === '' || $route === false) {
                    $route = '/';
                }
            } else {
                // Not a directory boundary match (e.g., /blog2 when base is /blog)
                $route = $request_uri;
            }
        } else {
            $route = $request_uri;
        }

        // Ensure route always starts with /
        if ($route === '' || $route[0] !== '/') {
            $route = '/' . ltrim($route, '/');
        }

        return $route;
    }

    /**
     * Check if llms.txt endpoint is enabled.
     *
     * @return bool
     */
    private function is_llms_enabled(): bool {
        if (!get_option('openbotauth_llms_enabled', true)) {
            return false;
        }

        /**
         * Filter whether to serve llms.txt.
         *
         * Use this filter to disable the endpoint when using Yoast or other plugins.
         *
         * @param bool $should_serve Whether to serve the endpoint.
         */
        return apply_filters('openbotauth_should_serve_llms_txt', true);
    }

    /**
     * Check if feed endpoint is enabled.
     *
     * @return bool
     */
    private function is_feed_enabled(): bool {
        if (!get_option('openbotauth_feed_enabled', true)) {
            return false;
        }

        /**
         * Filter whether to serve feed endpoints.
         *
         * @param bool $should_serve Whether to serve the endpoint.
         */
        return apply_filters('openbotauth_should_serve_feed', true);
    }

    /**
     * Check if markdown endpoint is enabled.
     *
     * @return bool
     */
    private function is_markdown_enabled(): bool {
        if (!get_option('openbotauth_feed_enabled', true)) {
            return false;
        }

        /**
         * Filter whether to serve markdown endpoints.
         *
         * @param bool $should_serve Whether to serve the endpoint.
         */
        return apply_filters('openbotauth_should_serve_markdown', true);
    }

    /**
     * Serve llms.txt content.
     */
    private function serve_llms_txt(): void {
        // llms.txt should be discoverable by crawlers, so don't set noindex
        $this->send_headers('text/plain; charset=UTF-8', false);

        $site_url = home_url();
        // Decode HTML entities for plain text output
        $site_name = wp_specialchars_decode(get_bloginfo('name'), ENT_QUOTES);
        $feed_url = home_url('/.well-known/openbotauth-feed.json');
        $md_pattern = home_url('/.well-known/openbotauth/posts/{ID}.md');

        $output = "# {$site_name}\n";
        $output .= "# Site: {$site_url}\n";

        // Note if site discourages indexing
        if (!get_option('blog_public', true)) {
            $output .= "# Note: This site discourages search engine indexing\n";
        }

        $output .= "\n# Machine-readable JSON feed:\n";
        $output .= "{$feed_url}\n\n";

        // Only include markdown URLs if markdown endpoint is enabled
        if ($this->is_markdown_enabled()) {
            $output .= "# Markdown endpoint pattern (replace {ID} with post ID):\n";
            $output .= "# {$md_pattern}\n\n";

            // Get posts for listing
            $posts = $this->get_feed_posts();
            $limit = count($posts);

            $output .= "# Latest {$limit} posts (markdown):\n";

            foreach ($posts as $post) {
                $md_url = home_url('/.well-known/openbotauth/posts/' . $post->ID . '.md');
                $output .= "{$md_url}\n";
            }
        }

        // Strip any unexpected HTML tags while preserving newlines for text/plain output
        echo wp_strip_all_tags( $output );
        exit;
    }

    /**
     * Serve feed.json content.
     */
    private function serve_feed_json(): void {
        $this->send_headers('application/json; charset=UTF-8');

        $posts = $this->get_feed_posts();

        $items = [];
        foreach ($posts as $post) {
            $item = [
                'id'           => $post->ID,
                'type'         => $post->post_type,
                'title'        => $this->metadata->getTitle($post),
                'canonical_url' => $this->metadata->getCanonicalUrl($post),
                'description'  => $this->metadata->getDescription($post),
                'last_modified' => $this->metadata->getLastModifiedIso($post),
                'markdown_url' => home_url('/.well-known/openbotauth/posts/' . $post->ID . '.md'),
            ];

            /**
             * Filter individual feed items.
             *
             * Allows other plugins to augment feed item data.
             *
             * @param array    $item The feed item data.
             * @param \WP_Post $post The post object.
             */
            $items[] = apply_filters('openbotauth_feed_item', $item, $post);
        }

        $feed = [
            'generated_at' => gmdate('c'),
            'site'         => home_url(),
            // Decode HTML entities for clean JSON output
            'site_name'    => wp_specialchars_decode(get_bloginfo('name'), ENT_QUOTES),
            'total_items'  => count($items),
            'items'        => $items,
        ];

        // wp_json_encode() safely encodes data for JSON output
        echo wp_json_encode( $feed, JSON_PRETTY_PRINT );
        exit;
    }

    /**
     * Serve markdown content for a single post.
     *
     * @param int $post_id The post ID.
     */
    private function serve_post_markdown(int $post_id): void {
        $post = get_post($post_id);

        // Validate: must exist, be published, and not password-protected
        if (!$post || $post->post_status !== 'publish' || !empty($post->post_password)) {
            status_header(404);
            header('Content-Type: text/plain; charset=UTF-8');
            echo "Post not found";
            exit;
        }

        // Validate: post type must be in allowed list
        $allowed_types = get_option('openbotauth_feed_post_types', ['post', 'page']);
        if (!is_array($allowed_types)) {
            $allowed_types = ['post', 'page'];
        }
        if (!in_array($post->post_type, $allowed_types, true)) {
            status_header(404);
            header('Content-Type: text/plain; charset=UTF-8');
            echo "Post not found";
            exit;
        }

        // Conditional GET: check If-Modified-Since
        $lastmod = $this->metadata->getLastModifiedTimestamp($post);
        $lastmod_http = gmdate('D, d M Y H:i:s', $lastmod) . ' GMT';

        if (isset($_SERVER['HTTP_IF_MODIFIED_SINCE'])) {
            $if_modified = strtotime( sanitize_text_field( wp_unslash( $_SERVER['HTTP_IF_MODIFIED_SINCE'] ) ) );
            // Guard against strtotime returning false
            if ($if_modified && $if_modified >= $lastmod) {
                status_header(304);
                exit;
            }
        }

        // Send headers
        header('Content-Type: text/markdown; charset=UTF-8');
        header('Cache-Control: public, max-age=300');
        header('Last-Modified: ' . $lastmod_http);
        header('X-Robots-Tag: noindex'); // Prevent search engine indexing of raw markdown

        // Strip any unexpected HTML tags while preserving newlines for text/markdown output
        $markdown = $this->render_post_markdown( $post );
        echo wp_strip_all_tags( $markdown );
        exit;
    }

    /**
     * Render a post as markdown.
     *
     * @param \WP_Post $post The post object.
     * @return string The markdown content.
     */
    private function render_post_markdown(\WP_Post $post): string {
        $title = $this->metadata->getTitle($post);
        $url = $this->metadata->getCanonicalUrl($post);
        $lastmod = $this->metadata->getLastModifiedIso($post);

        // Process content: strip shortcodes BEFORE stripping tags
        $content = $post->post_content;
        $content = strip_shortcodes($content);
        $content = wp_strip_all_tags($content);
        $content = html_entity_decode($content, ENT_QUOTES | ENT_HTML5, 'UTF-8');

        // Normalize whitespace: collapse 3+ newlines to 2
        $content = preg_replace('/\n{3,}/', "\n\n", $content);
        $content = trim($content);

        $markdown = "# {$title}\n\n"
            . "Canonical: {$url}\n"
            . "Last Updated: {$lastmod}\n\n"
            . $content . "\n";

        /**
         * Filter the rendered markdown content.
         *
         * Allows other plugins to post-process markdown output.
         *
         * @param string   $markdown The rendered markdown.
         * @param \WP_Post $post     The post object.
         */
        return apply_filters('openbotauth_markdown_content', $markdown, $post);
    }

    /**
     * Get posts for the feed.
     *
     * Returns published, non-password-protected posts ordered by last modified.
     *
     * @return \WP_Post[] Array of post objects.
     */
    private function get_feed_posts(): array {
        $limit = min(500, max(1, (int) get_option('openbotauth_feed_limit', 100)));
        $post_types = get_option('openbotauth_feed_post_types', ['post', 'page']);

        // Ensure post_types is an array
        if (!is_array($post_types)) {
            $post_types = ['post', 'page'];
        }

        // If no post types are enabled, return empty array
        if (empty($post_types)) {
            return [];
        }

        $query = new \WP_Query([
            'post_type'           => $post_types,
            'post_status'         => 'publish',
            'posts_per_page'      => $limit,
            'orderby'             => 'modified',
            'order'               => 'DESC',
            'no_found_rows'       => true,    // Skip pagination count for performance
            'ignore_sticky_posts' => true,    // Consistent ordering
            'fields'              => 'ids',   // Fast - just IDs, hydrate later
        ]);

        // Filter out password-protected posts (password is on post row, not meta)
        $posts = [];
        foreach ($query->posts as $post_id) {
            $post = get_post($post_id);
            if ($post && empty($post->post_password)) {
                $posts[] = $post;
            }
        }

        return $posts;
    }

    /**
     * Send common response headers.
     *
     * @param string $content_type The Content-Type header value.
     * @param bool   $noindex      Whether to set X-Robots-Tag: noindex (default true).
     */
    /**
     * Serve a 404 response for disabled endpoints.
     *
     * Called when a route matches but the endpoint is disabled.
     * Exits immediately to prevent WordPress from continuing routing.
     */
    private function serve_disabled_endpoint(): void {
        status_header(404);
        header('Content-Type: text/plain; charset=UTF-8');
        header('X-Robots-Tag: noindex');
        echo "Not found";
        exit;
    }

    /**
     * Send common response headers.
     *
     * @param string $content_type The Content-Type header value.
     * @param bool   $noindex      Whether to set X-Robots-Tag: noindex (default true).
     */
    private function send_headers(string $content_type, bool $noindex = true): void {
        status_header(200);
        header('Content-Type: ' . $content_type);
        header('Cache-Control: public, max-age=300');
        if ($noindex) {
            header('X-Robots-Tag: noindex'); // Prevent search engine indexing of raw data
        }
    }
}

