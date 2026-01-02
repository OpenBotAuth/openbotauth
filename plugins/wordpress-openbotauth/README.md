# OpenBotAuth WordPress Plugin

**Secure bot authentication using RFC 9421 HTTP signatures. Control bot access with granular policies, teasers, and 402 payment flows.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![WordPress](https://img.shields.io/badge/WordPress-6.0%2B-blue.svg)](https://wordpress.org/)
[![PHP](https://img.shields.io/badge/PHP-7.4%2B-blue.svg)](https://www.php.net/)

---

## 📖 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [How It Works](#how-it-works)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [Policy Configuration](#policy-configuration)
- [API Reference](#api-reference)
- [Examples](#examples)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)

---

## 🎯 Overview

The **OpenBotAuth WordPress Plugin** enables content owners to control how AI agents and bots access their content. Instead of blocking all bots or allowing unrestricted access, you can:

- ✅ **Verify bot identity** using cryptographic signatures (RFC 9421)
- 🎭 **Show teasers** to unverified bots (first N words)
- 💰 **Require payment** for premium content (402 Payment Required)
- 🚦 **Rate limit** bot access per agent
- 🎯 **Whitelist/blacklist** specific bots
- 📊 **Track** which bots access your content

This plugin is part of the [OpenBotAuth project](https://github.com/OpenBotAuth/openbotauth), which provides a complete infrastructure for agent identity and access control.

---

## ✨ Features

### 🔐 Signature Verification
- Verifies RFC 9421 HTTP Message Signatures
- Uses Ed25519 public-key cryptography
- Integrates with OpenBotAuth Verifier Service
- Prevents replay attacks with nonce validation

### 🎭 Content Teasers
- Show first N words to unverified bots
- Customizable per-post or globally
- Beautiful teaser UI with gradient fade
- Dark mode support

### 💰 Payment Flow (402)
- Return 402 Payment Required for premium content
- Configurable pricing per post
- Payment link in response headers
- Receipt verification

### 🚦 Rate Limiting
- Per-agent rate limits
- Configurable time windows
- Automatic cleanup of old requests
- 429 Too Many Requests response

### 🎯 Access Control
- Whitelist trusted bots
- Blacklist malicious bots
- Wildcard pattern matching
- Per-post policy overrides

### 📊 Analytics Ready
- Track verified vs unverified requests
- Log agent identities
- Monitor payment conversions
- REST API for custom analytics

---

## 🔧 How It Works

```
┌─────────────┐
│  AI Agent   │
│  (Bot CLI)  │
└──────┬──────┘
       │ 1. Sign HTTP request with private key
       │    (RFC 9421 signature)
       ▼
┌─────────────────┐
│   WordPress     │
│   + Plugin      │
└────────┬────────┘
         │ 2. Extract signature headers
         │ 3. Send to Verifier Service
         ▼
┌──────────────────┐
│    Verifier      │
│    Service       │
└────────┬─────────┘
         │ 4. Fetch JWKS from Registry
         │ 5. Verify signature
         │ 6. Return result
         ▼
┌─────────────────┐
│   WordPress     │
│   + Plugin      │
└────────┬────────┘
         │ 7. Apply policy
         │    - Allow: Return full content
         │    - Teaser: Return preview
         │    - Pay: Return 402
         │    - Deny: Return 403
         ▼
┌─────────────┐
│  AI Agent   │
│  (Response) │
└─────────────┘
```

---

## 📦 Installation

### Prerequisites

1. **WordPress 6.0+** with PHP 7.4+
2. **OpenBotAuth Verifier Service** running (see [main README](../../README.md))
3. **OpenBotAuth Registry** for bot registration (see [main README](../../README.md))

### Install Plugin

**Option 1: Manual Installation**

```bash
# Copy plugin to WordPress plugins directory
cp -r wordpress-openbotauth /path/to/wordpress/wp-content/plugins/

# Or create a symlink for development
ln -s /path/to/openbotauth/plugins/wordpress-openbotauth /path/to/wordpress/wp-content/plugins/
```

**Option 2: ZIP Upload**

```bash
# Create ZIP
cd plugins
zip -r wordpress-openbotauth.zip wordpress-openbotauth

# Upload via WordPress Admin:
# Plugins → Add New → Upload Plugin
```

### Activate Plugin

1. Go to **WordPress Admin → Plugins**
2. Find **OpenBotAuth**
3. Click **Activate**

---

## ⚙️ Configuration

### Basic Setup

1. Go to **Settings → OpenBotAuth**

2. **Verifier Service URL**
   
   **For local development:**
   ```
   http://localhost:8081/verify
   ```
   
   **For production (OpenBotAuth hosted verifier):**
   ```
   https://verifier.openbotauth.org/verify
   ```
   
   **For self-hosted production:**
   ```
   https://verifier.yourdomain.com/verify
   ```

3. **Default Policy** (default: Teaser)
   - **Allow**: All bots can access content (not recommended for security)
   - **Teaser**: Show preview (first N words) - **RECOMMENDED**
   - **Deny**: Block unverified bots

4. **Teaser Word Count**
   - Number of words to show in preview (default: `100`)

5. Click **Save Settings**

> **Security Note**: The plugin defaults to "Teaser" mode to fail securely. If the verifier service is unreachable, unverified bots will only see previews, not full content.

### Advanced Configuration

For advanced policies (whitelists, blacklists, rate limits), edit the **Policy JSON** directly:

```json
{
  "default": {
    "effect": "teaser",
    "teaser_words": 100,
    "whitelist": [
      "http://localhost:8080/jwks/trusted-bot.json"
    ],
    "blacklist": [
      "http://badbot.com/*"
    ],
    "rate_limit": {
      "max_requests": 100,
      "window_seconds": 3600
    }
  }
}
```

---

## 🚀 Usage

### Per-Post Policy

You can override the default policy for individual posts:

1. Edit a post or page
2. Find the **OpenBotAuth Policy** meta box (right sidebar)
3. Check **Override default policy**
4. Configure:
   - **Effect**: Allow, Teaser, or Deny
   - **Teaser Words**: Number of words for preview
   - **Price (cents)**: Require payment (e.g., `500` for $5.00)
5. **Publish** or **Update** the post

### Testing

**Test with Bot CLI:**

```bash
# From the OpenBotAuth project root
cd packages/bot-cli

# Fetch a protected post
pnpm dev fetch https://yoursite.com/protected-post -v
```

**Expected responses:**

- ✅ **200 OK** + `X-OBA-Decision: allow`: Bot is verified and allowed
- 🎭 **200 OK** + `X-OBA-Decision: teaser`: Unverified bot sees preview
- 💰 **402 Payment Required** + `X-OBA-Decision: pay`: Payment needed
- 🚫 **403 Forbidden** + `X-OBA-Decision: deny`: Bot is denied
- ⏱️ **429 Too Many Requests** + `X-OBA-Decision: rate_limit`: Rate limit exceeded

The `X-OBA-Decision` header indicates the policy decision applied to the request.

---

## 📋 Policy Configuration

### Policy Schema

```json
{
  "default": {
    "effect": "allow|deny|teaser",
    "teaser_words": 100,
    "price_cents": 0,
    "currency": "USD",
    "whitelist": ["pattern1", "pattern2"],
    "blacklist": ["pattern3", "pattern4"],
    "rate_limit": {
      "max_requests": 100,
      "window_seconds": 3600
    }
  }
}
```

### Policy Fields

| Field | Type | Description |
|-------|------|-------------|
| `effect` | string | Default action: `allow`, `deny`, or `teaser` |
| `teaser_words` | number | Words to show in preview (0 = no teaser) |
| `price_cents` | number | Price in cents (0 = free, >0 = 402 response) |
| `currency` | string | Currency code (default: `USD`) |
| `whitelist` | array | Bot patterns to always allow |
| `blacklist` | array | Bot patterns to always deny |
| `rate_limit` | object | Rate limiting configuration |
| `rate_limit.max_requests` | number | Max requests per window |
| `rate_limit.window_seconds` | number | Time window in seconds |

### Pattern Matching

Patterns can be:
- **Exact match**: `http://localhost:8080/jwks/bot.json`
- **Wildcard**: `http://example.com/*`
- **Key ID**: `3312fbbe-4e79-4b06-8d88-c6aa78b81d4a`

### Policy Examples

**Example 1: Open Access**
```json
{
  "default": {
    "effect": "allow"
  }
}
```

**Example 2: Teaser for All**
```json
{
  "default": {
    "effect": "teaser",
    "teaser_words": 150
  }
}
```

**Example 3: Whitelist Only**
```json
{
  "default": {
    "effect": "deny",
    "whitelist": [
      "http://localhost:8080/jwks/trusted-bot.json",
      "https://registry.example.com/jwks/*"
    ]
  }
}
```

**Example 4: Payment Required**
```json
{
  "default": {
    "effect": "allow",
    "price_cents": 500,
    "currency": "USD"
  }
}
```

**Example 5: Rate Limited**
```json
{
  "default": {
    "effect": "allow",
    "rate_limit": {
      "max_requests": 50,
      "window_seconds": 3600
    }
  }
}
```

**Example 6: Combined**
```json
{
  "default": {
    "effect": "teaser",
    "teaser_words": 100,
    "whitelist": [
      "http://localhost:8080/jwks/premium-bot.json"
    ],
    "blacklist": [
      "http://badbot.com/*"
    ],
    "rate_limit": {
      "max_requests": 100,
      "window_seconds": 3600
    }
  }
}
```

---

## 🔌 API Reference

### REST Endpoints

**Get Policy**
```
GET /wp-json/openbotauth/v1/policy?post_id=123
```

Response:
```json
{
  "effect": "teaser",
  "teaser_words": 100,
  "price_cents": 0
}
```

### Hooks & Filters

**Filter: `openbotauth_policy`**

Modify policy before applying:

```php
add_filter('openbotauth_policy', function($policy, $post) {
    // Custom logic
    if ($post->post_type === 'premium') {
        $policy['price_cents'] = 1000;
    }
    return $policy;
}, 10, 2);
```

**Action: `openbotauth_verified`**

Triggered when a bot is verified:

```php
add_action('openbotauth_verified', function($agent, $post) {
    // Log verified access
    error_log("Bot {$agent['jwks_url']} accessed post {$post->ID}");
}, 10, 2);
```

**Action: `openbotauth_payment_required`**

Triggered when 402 is returned:

```php
add_action('openbotauth_payment_required', function($agent, $post, $price) {
    // Track payment requests
}, 10, 3);
```

---

## 💡 Examples

### Example 1: Public Blog with Teasers

**Use Case**: Public blog that shows previews to unverified bots

**Configuration**:
```json
{
  "default": {
    "effect": "teaser",
    "teaser_words": 200
  }
}
```

**Result**: 
- Human visitors: See full content
- Unverified bots: See first 200 words
- Verified bots: See full content

---

### Example 2: Premium Content Site

**Use Case**: Subscription site with paid access

**Configuration**:
```json
{
  "default": {
    "effect": "allow",
    "price_cents": 500
  }
}
```

**Per-Post Override** (for free articles):
- Effect: Allow
- Price: 0

**Result**:
- Free articles: Open access
- Premium articles: 402 Payment Required

---

### Example 3: Selective Bot Access

**Use Case**: Allow only trusted research bots

**Configuration**:
```json
{
  "default": {
    "effect": "deny",
    "whitelist": [
      "https://research.university.edu/jwks/*",
      "https://trusted-ai.org/jwks/*"
    ]
  }
}
```

**Result**:
- Whitelisted bots: Full access
- Other bots: 403 Forbidden
- Human visitors: Full access

---

### Example 4: Rate-Limited API

**Use Case**: Prevent bot abuse with rate limits

**Configuration**:
```json
{
  "default": {
    "effect": "allow",
    "rate_limit": {
      "max_requests": 100,
      "window_seconds": 3600
    }
  }
}
```

**Result**:
- Each bot: Max 100 requests/hour
- Exceeding limit: 429 Too Many Requests

---

## 🐛 Troubleshooting

### Verifier Connection Failed

**Error**: "Verifier service error: Connection refused"

**Solution**:
1. Check verifier service is running:
   ```bash
   curl http://localhost:8081/health
   ```
2. Verify URL in **Settings → OpenBotAuth**
3. Check firewall rules

---

### Signature Verification Failed

**Error**: Bot receives 403 despite valid signature

**Possible causes**:
1. **Clock skew**: Ensure server clocks are synchronized
2. **Expired signature**: Check `created` and `expires` timestamps
3. **Wrong JWKS URL**: Verify bot's JWKS is accessible
4. **Cached JWKS**: Clear verifier cache:
   ```bash
   curl -X POST http://localhost:8081/cache/clear-all
   ```

---

### Teaser Not Showing

**Issue**: Full content shown instead of teaser

**Check**:
1. Policy effect is set to `teaser`
2. `teaser_words` > 0
3. User is not logged in (logged-in users see full content)
4. Request is not verified (verified bots see full content)
5. Check the `X-OBA-Decision` header in the response to see what policy was applied

### No X-OBA-Decision Header

**Issue**: Response doesn't include `X-OBA-Decision` header

**Check**:
1. Ensure you're testing on a singular post/page (not homepage or archive)
2. Log out of WordPress (plugin skips filtering for logged-in users)
3. Check PHP error logs for verifier connection issues:
   ```bash
   tail -f /path/to/wordpress/wp-content/debug.log
   ```
4. Verify the verifier URL is correct and accessible

---

### 402 Not Working

**Issue**: Payment required but 402 not returned

**Check**:
1. `price_cents` > 0 in policy
2. Bot has not already paid (check transients)
3. Payment URL is configured

---

## 🤝 Contributing

Contributions are welcome! Please see the [main project README](../../README.md) for contribution guidelines.

### Development Setup

```bash
# Clone the repo
git clone https://github.com/OpenBotAuth/openbotauth.git
cd openbotauth/plugins/wordpress-openbotauth

# Symlink to WordPress
ln -s $(pwd) /path/to/wordpress/wp-content/plugins/

# Enable WP_DEBUG in wp-config.php
define('WP_DEBUG', true);
define('WP_DEBUG_LOG', true);
```

### Running Tests

```bash
# Install WordPress test suite
bash bin/install-wp-tests.sh wordpress_test root '' localhost latest

# Run tests
phpunit
```

---

## 📄 License

MIT License - see [LICENSE](../../LICENSE) for details

---

## 🔗 Links

- **Main Project**: [github.com/OpenBotAuth/openbotauth](https://github.com/OpenBotAuth/openbotauth)
- **Documentation**: [Main README](../../README.md)
- **Registry Service**: [packages/registry-service](../../packages/registry-service)
- **Verifier Service**: [packages/verifier-service](../../packages/verifier-service)
- **Bot CLI**: [packages/bot-cli](../../packages/bot-cli)
- **RFC 9421**: [HTTP Message Signatures](https://www.rfc-editor.org/rfc/rfc9421.html)

---

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/OpenBotAuth/openbotauth/issues)
- **Discussions**: [GitHub Discussions](https://github.com/OpenBotAuth/openbotauth/discussions)

---

**Made with ❤️ by the OpenBotAuth team**

