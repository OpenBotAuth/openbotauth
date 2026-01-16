<?php
/**
 * Metadata Provider Interface
 *
 * Abstraction layer for post metadata extraction.
 * Default implementation uses WP core functions.
 * Future implementations can use Yoast, Rank Math, etc.
 *
 * @package OpenBotAuth
 * @since 0.1.2
 */

namespace OpenBotAuth\Content;

// Prevent direct access.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Interface for extracting post metadata.
 */
interface MetadataProviderInterface {

	/**
	 * Get the canonical URL for a post.
	 *
	 * @param \WP_Post $post The post object.
	 * @return string The canonical URL.
	 */
	public function getCanonicalUrl( \WP_Post $post ): string;

	/**
	 * Get the title for a post.
	 *
	 * @param \WP_Post $post The post object.
	 * @return string The post title.
	 */
	public function getTitle( \WP_Post $post ): string;

	/**
	 * Get the description/excerpt for a post.
	 *
	 * @param \WP_Post $post The post object.
	 * @return string The post description.
	 */
	public function getDescription( \WP_Post $post ): string;

	/**
	 * Get the last modified date in ISO 8601 format.
	 *
	 * @param \WP_Post $post The post object.
	 * @return string ISO 8601 formatted date.
	 */
	public function getLastModifiedIso( \WP_Post $post ): string;

	/**
	 * Get the last modified timestamp (Unix epoch).
	 * Used for conditional GET (Last-Modified header).
	 *
	 * @param \WP_Post $post The post object.
	 * @return int Unix timestamp.
	 */
	public function getLastModifiedTimestamp( \WP_Post $post ): int;
}
