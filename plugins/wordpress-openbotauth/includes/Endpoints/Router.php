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

// Prevent direct access.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

use OpenBotAuth\Content\MetadataProviderInterface;
use OpenBotAuth\Plugin;

/**
 * Router for AI-ready endpoints.
 */
class Router {

	/**
	 * The metadata provider.
	 *
	 * @var MetadataProviderInterface
	 */
	private $metadata;

	/**
	 * Constructor.
	 *
	 * @param MetadataProviderInterface $metadata The metadata provider.
	 */
	public function __construct( MetadataProviderInterface $metadata ) {
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
	public function handle_request( $wp ): void {
		$route = $this->get_relative_route();

		// llms.txt (both paths).
		if ( in_array( $route, array( '/llms.txt', '/.well-known/llms.txt' ), true ) ) {
			Plugin::track_referrer_stat();
			if ( $this->is_llms_enabled() ) {
				$this->serve_llms_txt();
			} else {
				$this->serve_disabled_endpoint();
			}
			return;
		}

		// feed.json.
		if ( '/.well-known/openbotauth-feed.json' === $route ) {
			Plugin::track_referrer_stat();
			if ( $this->is_feed_enabled() ) {
				$this->serve_feed_json();
			} else {
				$this->serve_disabled_endpoint();
			}
			return;
		}

		// Markdown posts.
		if ( preg_match( '#^/\.well-known/openbotauth/posts/(\d+)\.md$#', $route, $matches ) ) {
			Plugin::track_referrer_stat();
			if ( $this->is_markdown_enabled() ) {
				$this->serve_post_markdown( (int) $matches[1] );
			} else {
				$this->serve_disabled_endpoint();
			}
			return;
		}

		// No match - let WP continue routing.
	}

	/**
	 * Get relative route from request URI.
	 *
	 * Handles subdirectory installs correctly by stripping the base path.
	 *
	 * @return string The relative route (e.g., "/llms.txt").
	 */
	private function get_relative_route(): string {
		// Sanitize REQUEST_URI: wp_unslash removes slashes, esc_url_raw sanitizes the URL.
		// wp_parse_url() safely extracts the path component without executing any code.
		$raw_uri     = isset( $_SERVER['REQUEST_URI'] )
			? esc_url_raw( wp_unslash( $_SERVER['REQUEST_URI'] ) )
			: '/';
		$request_uri = wp_parse_url( $raw_uri, PHP_URL_PATH );

		if ( null === $request_uri || false === $request_uri ) {
			$request_uri = '/';
		}

		$base_path = wp_parse_url( home_url( '/' ), PHP_URL_PATH );
		if ( null === $base_path || false === $base_path ) {
			$base_path = '/';
		}

		// Normalize: remove trailing slash from base (except for root).
		$base = rtrim( $base_path, '/' );

		// If we have a base path and request starts with it, strip it.
		// Must check directory boundary to avoid /blog matching /blog2.
		if ( '' !== $base && 0 === strpos( $request_uri, $base ) ) {
			$next_char = substr( $request_uri, strlen( $base ), 1 );
			// Only match if next char is '/' (directory boundary) or empty (exact match).
			if ( '/' === $next_char || '' === $next_char || false === $next_char ) {
				$route = substr( $request_uri, strlen( $base ) );
				if ( '' === $route || false === $route ) {
					$route = '/';
				}
			} else {
				// Not a directory boundary match (e.g., /blog2 when base is /blog).
				$route = $request_uri;
			}
		} else {
			$route = $request_uri;
		}

		// Ensure route always starts with /.
		if ( '' === $route || '/' !== $route[0] ) {
			$route = '/' . ltrim( $route, '/' );
		}

		return $route;
	}

	/**
	 * Check if llms.txt endpoint is enabled.
	 *
	 * @return bool
	 */
	private function is_llms_enabled(): bool {
		if ( ! get_option( 'openbotauth_llms_enabled', true ) ) {
			return false;
		}

		/**
		 * Filter whether to serve llms.txt.
		 *
		 * Use this filter to disable the endpoint when using Yoast or other plugins.
		 *
		 * @param bool $should_serve Whether to serve the endpoint.
		 */
		return apply_filters( 'openbotauth_should_serve_llms_txt', true );
	}

	/**
	 * Check if feed endpoint is enabled.
	 *
	 * @return bool
	 */
	private function is_feed_enabled(): bool {
		if ( ! get_option( 'openbotauth_feed_enabled', true ) ) {
			return false;
		}

		/**
		 * Filter whether to serve feed endpoints.
		 *
		 * @param bool $should_serve Whether to serve the endpoint.
		 */
		return apply_filters( 'openbotauth_should_serve_feed', true );
	}

	/**
	 * Check if markdown endpoint is enabled.
	 *
	 * @return bool
	 */
	private function is_markdown_enabled(): bool {
		if ( ! get_option( 'openbotauth_feed_enabled', true ) ) {
			return false;
		}

		/**
		 * Filter whether to serve markdown endpoints.
		 *
		 * @param bool $should_serve Whether to serve the endpoint.
		 */
		return apply_filters( 'openbotauth_should_serve_markdown', true );
	}

	/**
	 * Serve llms.txt content.
	 *
	 * @return void
	 */
	private function serve_llms_txt(): void {
		// llms.txt should be discoverable by crawlers, so don't set noindex.
		$this->send_headers( 'text/plain; charset=UTF-8', false );

		$site_url = esc_url_raw( home_url() );
		// Decode HTML entities for plain text output.
		$site_name  = sanitize_text_field( wp_specialchars_decode( get_bloginfo( 'name' ), ENT_QUOTES ) );
		$feed_url   = esc_url_raw( home_url( '/.well-known/openbotauth-feed.json' ) );
		$md_pattern = esc_url_raw( home_url( '/.well-known/openbotauth/posts/{ID}.md' ) );

		$output  = "# {$site_name}\n";
		$output .= "# Site: {$site_url}\n";

		// Note if site discourages indexing.
		if ( ! get_option( 'blog_public', true ) ) {
			$output .= "# Note: This site discourages search engine indexing\n";
		}

		$output .= "\n# Machine-readable JSON feed:\n";
		$output .= "{$feed_url}\n\n";

		// Only include markdown URLs if markdown endpoint is enabled.
		if ( $this->is_markdown_enabled() ) {
			$output .= "# Markdown endpoint pattern (replace {ID} with post ID):\n";
			$output .= "# {$md_pattern}\n\n";

			// Get posts for listing.
			$posts = $this->get_feed_posts();
			$limit = count( $posts );

			$output .= "# Latest {$limit} posts (markdown):\n";

			foreach ( $posts as $post ) {
				$md_url  = esc_url_raw( home_url( '/.well-known/openbotauth/posts/' . $post->ID . '.md' ) );
				$output .= "{$md_url}\n";
			}
		}

		// Output plain text - wp_strip_all_tags removes HTML, Content-Type: text/plain prevents rendering.
		// phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- text/plain content-type, not HTML context
		echo wp_strip_all_tags( $output );
		exit;
	}

	/**
	 * Serve feed.json content.
	 *
	 * @return void
	 */
	private function serve_feed_json(): void {
		$this->send_headers( 'application/json; charset=UTF-8' );

		$posts = $this->get_feed_posts();

		$items = array();
		foreach ( $posts as $post ) {
			$item = array(
				'id'            => absint( $post->ID ),
				'type'          => sanitize_key( $post->post_type ),
				'title'         => sanitize_text_field( $this->metadata->getTitle( $post ) ),
				'canonical_url' => esc_url_raw( $this->metadata->getCanonicalUrl( $post ) ),
				'description'   => sanitize_text_field( $this->metadata->getDescription( $post ) ),
				'last_modified' => sanitize_text_field( $this->metadata->getLastModifiedIso( $post ) ),
				'markdown_url'  => esc_url_raw( home_url( '/.well-known/openbotauth/posts/' . $post->ID . '.md' ) ),
			);

			/**
			 * Filter individual feed items.
			 *
			 * Allows other plugins to augment feed item data.
			 *
			 * @param array    $item The feed item data.
			 * @param \WP_Post $post The post object.
			 */
			$filtered = apply_filters( 'openbotauth_feed_item', $item, $post );
			$items[]  = $this->sanitize_feed_item( $filtered );
		}

		$feed = array(
			'generated_at' => gmdate( 'c' ),
			'site'         => esc_url_raw( home_url() ),
			// Decode HTML entities for clean JSON output.
			'site_name'    => sanitize_text_field( wp_specialchars_decode( get_bloginfo( 'name' ), ENT_QUOTES ) ),
			'total_items'  => count( $items ),
			'items'        => $items,
		);

		// wp_json_encode() safely encodes data for JSON output.
		echo wp_json_encode( $feed, JSON_PRETTY_PRINT );
		exit;
	}

	/**
	 * Serve markdown content for a single post.
	 *
	 * @param int $post_id The post ID.
	 */
	private function serve_post_markdown( int $post_id ): void {
		$post = get_post( $post_id );

		// Validate: must exist, be published, and not password-protected.
		if ( ! $post || 'publish' !== $post->post_status || ! empty( $post->post_password ) ) {
			status_header( 404 );
			header( 'Content-Type: text/plain; charset=UTF-8' );
			echo 'Post not found';
			exit;
		}

		// Validate: post type must be in allowed list.
		$allowed_types = get_option( 'openbotauth_feed_post_types', array( 'post', 'page' ) );
		if ( ! is_array( $allowed_types ) ) {
			$allowed_types = array( 'post', 'page' );
		}
		if ( ! in_array( $post->post_type, $allowed_types, true ) ) {
			status_header( 404 );
			header( 'Content-Type: text/plain; charset=UTF-8' );
			echo 'Post not found';
			exit;
		}

		// Conditional GET: check If-Modified-Since.
		$lastmod      = $this->metadata->getLastModifiedTimestamp( $post );
		$lastmod_http = gmdate( 'D, d M Y H:i:s', $lastmod ) . ' GMT';

		if ( isset( $_SERVER['HTTP_IF_MODIFIED_SINCE'] ) ) {
			$if_modified = strtotime( sanitize_text_field( wp_unslash( $_SERVER['HTTP_IF_MODIFIED_SINCE'] ) ) );
			// Guard against strtotime returning false.
			if ( $if_modified && $if_modified >= $lastmod ) {
				status_header( 304 );
				exit;
			}
		}

		// Send headers.
		header( 'Content-Type: text/markdown; charset=UTF-8' );
		header( 'Cache-Control: public, max-age=300' );
		header( 'Last-Modified: ' . $lastmod_http );
		header( 'X-Robots-Tag: noindex' ); // Prevent search engine indexing of raw markdown.

		// Output markdown - render_post_markdown strips HTML, esc_html for defense in depth against filter injection.
		echo esc_html( wp_strip_all_tags( $this->render_post_markdown( $post ) ) );
		exit;
	}

	/**
	 * Render a post as markdown.
	 *
	 * @param \WP_Post $post The post object.
	 * @return string The markdown content.
	 */
	private function render_post_markdown( \WP_Post $post ): string {
		// Sanitize metadata fields for safe output.
		$title   = sanitize_text_field( $this->metadata->getTitle( $post ) );
		$url     = esc_url_raw( $this->metadata->getCanonicalUrl( $post ) );
		$lastmod = sanitize_text_field( $this->metadata->getLastModifiedIso( $post ) );

		// Process content: strip shortcodes BEFORE stripping tags.
		$content = $post->post_content;
		$content = strip_shortcodes( $content );
		$content = wp_strip_all_tags( $content );
		$content = html_entity_decode( $content, ENT_QUOTES | ENT_HTML5, 'UTF-8' );

		// Normalize whitespace: collapse 3+ newlines to 2.
		$content = preg_replace( '/\n{3,}/', "\n\n", $content );
		$content = trim( $content );

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
		$filtered = apply_filters( 'openbotauth_markdown_content', $markdown, $post );

		// Ensure filtered result is a string and strip any HTML that filters might add (defense in depth).
		if ( ! is_string( $filtered ) ) {
			return $markdown;
		}

		return $filtered;
	}

	/**
	 * Get posts for the feed.
	 *
	 * Returns published, non-password-protected posts ordered by last modified.
	 *
	 * @return \WP_Post[] Array of post objects.
	 */
	private function get_feed_posts(): array {
		$limit      = min( 500, max( 1, (int) get_option( 'openbotauth_feed_limit', 100 ) ) );
		$post_types = get_option( 'openbotauth_feed_post_types', array( 'post', 'page' ) );

		// Ensure post_types is an array.
		if ( ! is_array( $post_types ) ) {
			$post_types = array( 'post', 'page' );
		}

		// If no post types are enabled, return empty array.
		if ( empty( $post_types ) ) {
			return array();
		}

		$query = new \WP_Query(
			array(
				'post_type'           => $post_types,
				'post_status'         => 'publish',
				'posts_per_page'      => $limit,
				'orderby'             => 'modified',
				'order'               => 'DESC',
				'no_found_rows'       => true,    // Skip pagination count for performance.
				'ignore_sticky_posts' => true,    // Consistent ordering.
				'fields'              => 'ids',   // Fast - just IDs, hydrate later.
			)
		);

		// Filter out password-protected posts (password is on post row, not meta).
		$posts = array();
		foreach ( $query->posts as $post_id ) {
			$post = get_post( $post_id );
			if ( $post && empty( $post->post_password ) ) {
				$posts[] = $post;
			}
		}

		return $posts;
	}

	/**
	 * Serve a 404 response for disabled endpoints.
	 *
	 * Called when a route matches but the endpoint is disabled.
	 * Exits immediately to prevent WordPress from continuing routing.
	 *
	 * @return void
	 */
	private function serve_disabled_endpoint(): void {
		status_header( 404 );
		header( 'Content-Type: text/plain; charset=UTF-8' );
		header( 'X-Robots-Tag: noindex' );
		echo 'Not found';
		exit;
	}

	/**
	 * Send common response headers.
	 *
	 * @param string $content_type The Content-Type header value.
	 * @param bool   $noindex      Whether to set X-Robots-Tag: noindex (default true).
	 * @return void
	 */
	private function send_headers( string $content_type, bool $noindex = true ): void {
		status_header( 200 );
		header( 'Content-Type: ' . $content_type );
		header( 'Cache-Control: public, max-age=300' );
		if ( $noindex ) {
			header( 'X-Robots-Tag: noindex' ); // Prevent search engine indexing of raw data.
		}
	}

	/**
	 * Sanitize feed item data for JSON output.
	 *
	 * @param mixed $item Feed item data.
	 * @return array Sanitized feed item.
	 */
	private function sanitize_feed_item( $item ): array {
		if ( ! is_array( $item ) ) {
			return array();
		}

		return array(
			'id'            => isset( $item['id'] ) ? absint( $item['id'] ) : 0,
			'type'          => isset( $item['type'] ) ? sanitize_key( $item['type'] ) : '',
			'title'         => isset( $item['title'] ) ? sanitize_text_field( $item['title'] ) : '',
			'canonical_url' => isset( $item['canonical_url'] ) ? esc_url_raw( $item['canonical_url'] ) : '',
			'description'   => isset( $item['description'] ) ? sanitize_text_field( $item['description'] ) : '',
			'last_modified' => isset( $item['last_modified'] ) ? sanitize_text_field( $item['last_modified'] ) : '',
			'markdown_url'  => isset( $item['markdown_url'] ) ? esc_url_raw( $item['markdown_url'] ) : '',
		);
	}
}
