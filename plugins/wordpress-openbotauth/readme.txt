=== OpenBotAuth ===
Contributors: openbotauth
Tags: bot authentication, ai agents, http signatures, rfc 9421, access control
Requires at least: 6.0
Tested up to: 6.9
Requires PHP: 8.0
Stable tag: 0.1.2
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Secure bot authentication using RFC 9421 HTTP signatures. Control bot access with granular policies, teasers, and 402 payment flows.

== Description ==

**OpenBotAuth** enables content owners to control how AI agents and bots access their content using cryptographic signatures (RFC 9421).

Instead of blocking all bots or allowing unrestricted access, you can:

* **Verify bot identity** using cryptographic signatures (RFC 9421)
* **Show teasers** to unverified bots (first N words)
* **Require payment** for premium content (402 Payment Required stub)
* **Rate limit** bot access per agent
* **Whitelist/blacklist** specific bots

= Key Features =

* **Signature Verification** - Verifies RFC 9421 HTTP Message Signatures using Ed25519 cryptography
* **Content Teasers** - Show first N words to unverified bots with customizable per-post settings
* **Payment Flow Stub** - Return 402 Payment Required for premium content (actual payment integration requires custom implementation)
* **Rate Limiting** - Per-agent rate limits with configurable time windows
* **Access Control** - Whitelist/blacklist with wildcard pattern matching
* **Local Analytics** - Track decision counts locally (no external tracking)
* **AI-Ready Endpoints** - Serve llms.txt, JSON feed, and markdown for AI crawlers

= AI-Ready Endpoints =

OpenBotAuth provides machine-readable endpoints for AI systems:

* **/llms.txt** - Standardized AI feed discovery (also at /.well-known/llms.txt)
* **/.well-known/openbotauth-feed.json** - JSON list of all published posts
* **/.well-known/openbotauth/posts/{ID}.md** - Per-post markdown content

All data is served locally from your WordPress database. No external tracking or telemetry. Only published, non-password-protected posts are exposed.

= How It Works =

1. AI agent signs HTTP request with its private key (RFC 9421 signature)
2. WordPress plugin extracts signature headers and sends them to a verifier service
3. Verifier fetches agent's public key from registry and verifies signature
4. Plugin applies policy: allow full content, show teaser, require payment, or deny

= External Service Disclosure =

**This plugin connects to an external verifier service.** When a signed bot request is received, the plugin sends the following data to your configured verifier URL via `wp_remote_post`:

* HTTP method (GET, POST, etc.)
* The accessed URL (including query string, if present)
* HTTP signature headers (Signature, Signature-Input, Signature-Agent)

**No WordPress user accounts, cookies, or personal data is transmitted.** Note that the URL may include query parameters depending on your site's structure.

You can:
* Use the hosted verifier at `https://verifier.openbotauth.org/verify`
* Self-host the verifier service (see documentation)
* The verifier service may log requests server-side depending on your configuration

**Analytics are local-only.** Decision counts (allow/teaser/deny/pay/rate_limit) are stored in your WordPress database. No analytics data is sent to external servers.

== Installation ==

1. Upload the `wordpress-openbotauth` folder to `/wp-content/plugins/`
2. Activate the plugin through the 'Plugins' menu in WordPress
3. Go to **Settings > OpenBotAuth** to configure
4. Configure your **Verifier Service**:
   * Check "Use hosted OpenBotAuth verifier" to use the hosted service, OR
   * Enter your self-hosted verifier URL (e.g., `http://localhost:8081/verify` for local dev)
   * Leave empty to disable verification (all signed requests treated as unverified)
5. Configure your default policy (Allow, Teaser, or Deny)

== Frequently Asked Questions ==

= Do I need to run my own verifier service? =

No, you can enable the hosted verifier in Settings by checking "Use hosted OpenBotAuth verifier". For privacy requirements or custom configurations, you can self-host the verifier service. The plugin does not contact any external service until you explicitly configure it.

= Will this block normal human visitors? =

No. The plugin only applies to requests that include RFC 9421 signature headers. Normal browser requests without signature headers see full content and bypass OpenBotAuth entirely.

= What is a teaser? =

A teaser shows the first N words of your content to unverified bots, with a notice that authenticated bots can access full content. You can configure the word count globally or per-post.

= Does the 402 payment feature process actual payments? =

No. The 402 response is a stub that returns the configured price and payment URL. Actual payment processing requires custom integration.

= What data does the plugin send externally? =

Only signature verification requests are sent to your configured verifier URL. The request includes the URL being accessed and the signature headers. No personal data, cookies, or user information is transmitted.

= Are analytics sent to external servers? =

No. All analytics (decision counts) are stored locally in your WordPress database. No tracking pixels, install pings, or external analytics are used.

== Screenshots ==

1. Settings page - Configure verifier URL and default policy
2. Per-post policy override in the post editor
3. Local analytics dashboard showing decision counts

== Changelog ==

= 0.1.2 =
* Added llms.txt endpoint for AI discovery (/llms.txt and /.well-known/llms.txt)
* Added JSON feed at /.well-known/openbotauth-feed.json
* Added per-post markdown at /.well-known/openbotauth/posts/{ID}.md
* Added metadata provider abstraction for future Yoast/SEO plugin integration
* Supports subdirectory WordPress installs
* Implements HTTP conditional GET (304 Not Modified responses)
* Added AI Artifacts settings tab in admin
* No rewrite rules - uses early request interception
* Filter hooks for endpoint customization: openbotauth_should_serve_llms_txt, openbotauth_should_serve_feed, openbotauth_should_serve_markdown
* Content filters: openbotauth_feed_item, openbotauth_markdown_content

= 0.1.1 =
* Added local-only analytics dashboard
* Added openbotauth_policy filter for custom policy logic
* Added openbotauth_verified action for tracking verified requests
* Added openbotauth_payment_required action for payment events
* Improved whitelist-only semantics: non-whitelisted agents are now denied
* Fixed HTTP status codes for deny (403) and rate_limit (429) responses
* Human visitors without signature headers now bypass gating entirely
* Added URL sanitization for verifier and payment URL settings
* Softened payment UI text to clarify 402 stub functionality

= 0.1.0 =
* Initial release
* RFC 9421 signature verification
* Content teaser support
* Rate limiting
* Whitelist/blacklist support
* Per-post policy overrides
* REST API for policy retrieval

== Upgrade Notice ==

= 0.1.2 =
New AI-ready endpoints: llms.txt, JSON feed, and per-post markdown. Makes your content discoverable by AI systems without any external dependencies.

= 0.1.1 =
Important security and correctness fixes. Human visitors now correctly bypass gating. Whitelist-only mode now properly denies non-whitelisted agents.

== Developer Hooks ==

= Filters =

**openbotauth_policy**
Modify policy before applying:

`add_filter('openbotauth_policy', function($policy, $post) {
    if ($post->post_type === 'premium') {
        $policy['price_cents'] = 1000;
    }
    return $policy;
}, 10, 2);`

= Actions =

**openbotauth_verified**
Triggered when a bot is verified:

`add_action('openbotauth_verified', function($agent, $post) {
    error_log("Bot {$agent['jwks_url']} accessed post {$post->ID}");
}, 10, 2);`

**openbotauth_payment_required**
Triggered when 402 is returned:

`add_action('openbotauth_payment_required', function($agent, $post, $price) {
    // Track payment requests
}, 10, 3);`

= AI Endpoint Filters (v0.1.2+) =

**openbotauth_should_serve_llms_txt**
Disable llms.txt endpoint (e.g., when using Yoast):

`add_filter('openbotauth_should_serve_llms_txt', '__return_false');`

**openbotauth_should_serve_feed**
Disable JSON feed endpoint:

`add_filter('openbotauth_should_serve_feed', '__return_false');`

**openbotauth_should_serve_markdown**
Disable markdown endpoints:

`add_filter('openbotauth_should_serve_markdown', '__return_false');`

**openbotauth_feed_item**
Modify feed items:

`add_filter('openbotauth_feed_item', function($item, $post) {
    $item['custom_field'] = get_post_meta($post->ID, 'my_field', true);
    return $item;
}, 10, 2);`

**openbotauth_markdown_content**
Post-process markdown output:

`add_filter('openbotauth_markdown_content', function($markdown, $post) {
    return $markdown . "\n\n---\nCopyright notice here";
}, 10, 2);`

