#!/bin/bash

# Setup Bot CLI with Real Keys from Portal
# This script helps you configure the bot CLI to use the keys you registered in the portal

echo "🔑 Setting up Bot CLI with your registered keys"
echo ""
echo "You need your PRIVATE KEY that you saved when you generated keys in the portal."
echo ""
echo "⚠️  IMPORTANT: This is the private key you copied when you clicked 'Generate New Key Pair' in the portal."
echo ""

# Get username
read -p "Enter your username (default: hammadtq): " USERNAME
USERNAME=${USERNAME:-hammadtq}

# Fetch JWKS to get kid
echo ""
echo "Fetching your JWKS from registry..."
JWKS_URL="http://localhost:8080/jwks/${USERNAME}.json"
KID=$(curl -s "$JWKS_URL" 2>/dev/null | jq -r '.keys[0].kid')

if [ -z "$KID" ] || [ "$KID" = "null" ]; then
  echo "❌ Could not fetch JWKS from $JWKS_URL"
  echo "   Make sure:"
  echo "   1. Registry service is running (http://localhost:8080)"
  echo "   2. You have registered keys in the portal"
  echo "   3. Your username is correct"
  exit 1
fi

echo "✅ Found key: $KID"

# Get public key
PUBLIC_KEY=$(curl -s "$JWKS_URL" 2>/dev/null | jq -r '.keys[0].x')

echo ""
echo "Now, paste your PRIVATE KEY (the one you saved from the portal)."
echo "It should look like:"
echo "-----BEGIN PRIVATE KEY-----"
echo "MC4CAQAwBQYDK2VwBCIEI..."
echo "-----END PRIVATE KEY-----"
echo ""
echo "Paste your private key (press Enter, then Ctrl+D when done):"

# Read multi-line private key
PRIVATE_KEY=$(cat)

if [ -z "$PRIVATE_KEY" ]; then
  echo "❌ No private key provided"
  exit 1
fi

# Validate private key format
if ! echo "$PRIVATE_KEY" | grep -q "BEGIN PRIVATE KEY"; then
  echo "❌ Invalid private key format"
  echo "   Make sure you pasted the complete key including:"
  echo "   -----BEGIN PRIVATE KEY-----"
  echo "   ...key data..."
  echo "   -----END PRIVATE KEY-----"
  exit 1
fi

# Create config directory
CONFIG_DIR="$HOME/.openbotauth"
mkdir -p "$CONFIG_DIR"

# Create config file
CONFIG_FILE="$CONFIG_DIR/bot-config.json"

cat > "$CONFIG_FILE" << EOF
{
  "jwks_url": "$JWKS_URL",
  "kid": "$KID",
  "private_key": $(echo "$PRIVATE_KEY" | jq -Rs .),
  "public_key": "$PUBLIC_KEY"
}
EOF

echo ""
echo "✅ Configuration saved to $CONFIG_FILE"
echo ""
echo "Configuration:"
echo "  JWKS URL: $JWKS_URL"
echo "  Key ID: $KID"
echo ""
echo "🧪 Test it:"
echo "  cd packages/bot-cli"
echo "  pnpm dev fetch http://localhost:3000/protected -v"
echo ""

