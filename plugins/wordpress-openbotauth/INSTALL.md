# Quick Installation Guide

## 1. Prerequisites

- WordPress 6.0+
- PHP 8.0+
- OpenBotAuth Verifier Service running

## 2. Install Plugin

```bash
# Copy to WordPress plugins directory
cp -r wordpress-openbotauth /path/to/wordpress/wp-content/plugins/
```

## 3. Activate

1. Go to **WordPress Admin → Plugins**
2. Find **OpenBotAuth**
3. Click **Activate**

## 4. Configure

1. Go to **Settings → OpenBotAuth**
2. Set **Verifier Service URL**: `http://localhost:8081/verify`
3. Choose **Default Effect**: Teaser
4. Set **Teaser Word Count**: `100`
5. Click **Save Settings**

## 5. Test

```bash
# Test with Bot CLI
cd /path/to/openbotauth/packages/bot-cli
pnpm dev fetch https://yoursite.com/test-post -v
```

## Done! 🎉

See [README.md](README.md) for detailed configuration and usage.

