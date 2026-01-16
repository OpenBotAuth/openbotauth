<?php
/**
 * Metadata Provider Factory
 *
 * Factory for creating metadata provider instances.
 * Returns the appropriate provider based on available plugins.
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
 * Factory for creating metadata provider instances.
 */
class MetadataProviderFactory {

	/**
	 * Create a metadata provider instance.
	 *
	 * Currently returns DefaultMetadataProvider.
	 * Future versions can detect Yoast/Rank Math and return appropriate providers.
	 *
	 * @return MetadataProviderInterface The metadata provider instance.
	 */
	public static function make(): MetadataProviderInterface {
		// Default: WordPress core functions only.
		return new DefaultMetadataProvider();
	}
}
