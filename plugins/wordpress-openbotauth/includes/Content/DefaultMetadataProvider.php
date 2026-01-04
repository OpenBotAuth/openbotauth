<?php
/**
 * Default Metadata Provider
 *
 * Uses WordPress core functions only.
 * No dependency on Yoast, Rank Math, or other SEO plugins.
 *
 * @package OpenBotAuth
 * @since 0.1.2
 */

namespace OpenBotAuth\Content;

// Prevent direct access
if (!defined('ABSPATH')) {
    exit;
}

/**
 * Default implementation using WP core functions.
 */
class DefaultMetadataProvider implements MetadataProviderInterface {

    /**
     * Get the canonical URL for a post.
     *
     * @param \WP_Post $post The post object.
     * @return string The canonical URL.
     */
    public function getCanonicalUrl(\WP_Post $post): string {
        return get_permalink($post);
    }

    /**
     * Get the title for a post.
     *
     * @param \WP_Post $post The post object.
     * @return string The post title.
     */
    public function getTitle(\WP_Post $post): string {
        return get_the_title($post);
    }

    /**
     * Get the description/excerpt for a post.
     *
     * Prefers the excerpt if available, otherwise uses the first 160 characters
     * of the stripped post content.
     *
     * @param \WP_Post $post The post object.
     * @return string The post description.
     */
    public function getDescription(\WP_Post $post): string {
        // Prefer explicit excerpt
        if (!empty($post->post_excerpt)) {
            return wp_strip_all_tags($post->post_excerpt);
        }

        // Fallback: first 160 chars of stripped content
        $content = strip_shortcodes($post->post_content);
        $content = wp_strip_all_tags($content);
        $content = html_entity_decode($content, ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $content = preg_replace('/\s+/', ' ', $content); // Normalize whitespace
        $content = trim($content);

        if (strlen($content) > 160) {
            $content = substr($content, 0, 157) . '...';
        }

        return $content;
    }

    /**
     * Get the last modified date in ISO 8601 format.
     *
     * @param \WP_Post $post The post object.
     * @return string ISO 8601 formatted date.
     */
    public function getLastModifiedIso(\WP_Post $post): string {
        $timestamp = $this->getLastModifiedTimestamp($post);
        return gmdate('c', $timestamp);
    }

    /**
     * Get the last modified timestamp (Unix epoch).
     *
     * @param \WP_Post $post The post object.
     * @return int Unix timestamp.
     */
    public function getLastModifiedTimestamp(\WP_Post $post): int {
        $date_string = !empty($post->post_modified_gmt) && $post->post_modified_gmt !== '0000-00-00 00:00:00'
            ? $post->post_modified_gmt
            : $post->post_modified;

        $timestamp = strtotime($date_string);
        
        // Fallback to current time if strtotime fails
        return $timestamp ? $timestamp : time();
    }
}

