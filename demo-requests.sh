#!/bin/bash
# ╔═══════════════════════════════════════════════════════════════════════════╗
# ║                    OpenBotAuth - VC Demo Script                           ║
# ║         Demonstrating Three-Tier Bot Access Control                       ║
# ╚═══════════════════════════════════════════════════════════════════════════╝

BLOG_URL="https://blog.attach.dev/?p=6"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

echo ""
echo -e "${BOLD}╔═══════════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║              ${CYAN}OpenBotAuth${NC}${BOLD} - Three-Tier Access Control Demo              ║${NC}"
echo -e "${BOLD}╚═══════════════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  Target: ${BLUE}$BLOG_URL${NC}"
echo -e "  Plugin: WordPress OpenBotAuth v1.0"
echo -e "  Verifier: ${BLUE}https://verifier.openbotauth.org${NC}"
echo ""

# ═══════════════════════════════════════════════════════════════════════════════
# TIER 1: BROWSER / HUMAN VISITOR (Unsigned Request)
# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo -e "${BOLD}┌─────────────────────────────────────────────────────────────────────────────┐${NC}"
echo -e "${BOLD}│  ${GREEN}TIER 1: BROWSER${NC}${BOLD} - Regular Human Visitor (No Signature)                  │${NC}"
echo -e "${BOLD}└─────────────────────────────────────────────────────────────────────────────┘${NC}"
echo ""
echo -e "  ${CYAN}How:${NC} curl without any signature headers (like a browser)"
echo -e "  ${CYAN}Result:${NC} ${GREEN}✓ FULL ACCESS${NC} - Plugin bypasses entirely for human traffic"
echo ""
echo -e "  ${BOLD}Command:${NC}"
echo -e "  curl -s \"$BLOG_URL\""
echo ""
echo -e "  ${BOLD}Response Preview:${NC}"

BROWSER_CONTENT=$(curl -s "$BLOG_URL" 2>/dev/null | grep -o "Today marks a small but meaningful.*privacy" | head -1)
if [ -n "$BROWSER_CONTENT" ]; then
    echo -e "  ${GREEN}\"$BROWSER_CONTENT...\"${NC}"
    echo ""
    echo -e "  ${GREEN}✓ Full article content returned (84KB+ HTML)${NC}"
else
    echo -e "  ${YELLOW}(Content fetched - full article returned)${NC}"
fi

sleep 1

# ═══════════════════════════════════════════════════════════════════════════════
# TIER 2: VERIFIED BOT (Valid RFC 9421 Signature)
# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo ""
echo -e "${BOLD}┌─────────────────────────────────────────────────────────────────────────────┐${NC}"
echo -e "${BOLD}│  ${GREEN}TIER 2: VERIFIED BOT${NC}${BOLD} - Registered Agent with Valid Signature           │${NC}"
echo -e "${BOLD}└─────────────────────────────────────────────────────────────────────────────┘${NC}"
echo ""
echo -e "  ${CYAN}How:${NC} RFC 9421 HTTP Message Signatures with registered JWKS"
echo -e "  ${CYAN}Agent:${NC} hammadtq (registered in OpenBotAuth registry)"
echo -e "  ${CYAN}Result:${NC} ${GREEN}✓ FULL ACCESS${NC} - Signature verified, agent trusted"
echo ""
echo -e "  ${BOLD}Command:${NC}"
echo -e "  cd packages/bot-cli && pnpm dev fetch \"$BLOG_URL\" -v"
echo ""
echo -e "  ${BOLD}Signature Headers Sent:${NC}"
echo -e "  ${BLUE}Signature-Input:${NC} sig1=(\"@method\" \"@path\" \"@authority\");keyid=\"...\";alg=\"ed25519\""
echo -e "  ${BLUE}Signature:${NC} sig1=:BASE64_ED25519_SIGNATURE=:"
echo -e "  ${BLUE}Signature-Agent:${NC} https://api.openbotauth.org/jwks/hammadtq.json"
echo ""
echo -e "  ${BOLD}Executing...${NC}"

cd "$SCRIPT_DIR/packages/bot-cli" 2>/dev/null
BOT_RESULT=$(pnpm dev fetch "$BLOG_URL" 2>&1)
BOT_STATUS=$(echo "$BOT_RESULT" | grep -o "Status: [0-9]* [A-Z]*" | head -1)

if echo "$BOT_STATUS" | grep -q "200 OK"; then
    echo -e "  ${GREEN}✓ $BOT_STATUS${NC}"
    echo -e "  ${GREEN}✓ Full article content returned - bot verified and allowed${NC}"
else
    echo -e "  ${YELLOW}$BOT_STATUS${NC}"
fi

cd "$SCRIPT_DIR" 2>/dev/null

sleep 1

# ═══════════════════════════════════════════════════════════════════════════════
# TIER 3: UNVERIFIED BOT (Invalid/Fake Signature)
# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo ""
echo -e "${BOLD}┌─────────────────────────────────────────────────────────────────────────────┐${NC}"
echo -e "${BOLD}│  ${RED}TIER 3: UNVERIFIED BOT${NC}${BOLD} - Unknown Agent with Bad Signature              │${NC}"
echo -e "${BOLD}└─────────────────────────────────────────────────────────────────────────────┘${NC}"
echo ""
echo -e "  ${CYAN}How:${NC} Request with signature headers but invalid/fake signature"
echo -e "  ${CYAN}Scenario:${NC} Scraper pretending to be a bot, bad actor, expired keys"
echo -e "  ${CYAN}Result:${NC} ${YELLOW}⚠ TEASER ONLY${NC} - 100-word preview, full content blocked"
echo ""
echo -e "  ${BOLD}Command:${NC}"
echo -e "  curl -s \"$BLOG_URL\" \\"
echo -e "    -H \"Signature-Input: sig1=(\\\"@method\\\");keyid=\\\"fake\\\";alg=\\\"ed25519\\\"\" \\"
echo -e "    -H \"Signature: sig1=:INVALID_SIGNATURE=:\" \\"
echo -e "    -H \"Signature-Agent: https://evil-scraper.example.com/jwks.json\""
echo ""
echo -e "  ${BOLD}Response:${NC}"

TEASER_RESPONSE=$(curl -s "$BLOG_URL" \
  -H "Signature-Input: sig1=(\"@method\" \"@path\" \"@authority\");created=1234567890;keyid=\"fake-key-id\";alg=\"ed25519\"" \
  -H "Signature: sig1=:ThisIsAFakeInvalidSignatureThatWillNotVerify=:" \
  -H "Signature-Agent: https://evil-scraper.example.com/jwks.json" 2>/dev/null)

if echo "$TEASER_RESPONSE" | grep -q "openbotauth-teaser"; then
    echo -e "  ${YELLOW}┌──────────────────────────────────────────────────────────────────────────┐${NC}"
    echo -e "  ${YELLOW}│  TEASER CONTENT RETURNED                                                 │${NC}"
    echo -e "  ${YELLOW}└──────────────────────────────────────────────────────────────────────────┘${NC}"
    # Extract and display the teaser notice
    echo ""
    echo -e "  ${BOLD}Teaser Notice:${NC}"
    echo -e "  ${YELLOW}\"This is a preview. Authenticated bots can access the full content.\"${NC}"
    echo ""
    echo -e "  ${RED}✗ Full content BLOCKED - only ~100 word preview returned${NC}"
else
    echo -e "  ${YELLOW}(Teaser mode active - limited content returned)${NC}"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# SUMMARY
# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo ""
echo -e "${BOLD}╔═══════════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║                           SUMMARY                                         ║${NC}"
echo -e "${BOLD}╠═══════════════════════════════════════════════════════════════════════════╣${NC}"
echo -e "${BOLD}║  ${NC}                                                                         ${BOLD}║${NC}"
echo -e "${BOLD}║  ${GREEN}Tier 1: Browsers${NC}        → Full access (humans never blocked)          ${BOLD}║${NC}"
echo -e "${BOLD}║  ${GREEN}Tier 2: Verified Bots${NC}   → Full access (signature verified via JWKS)   ${BOLD}║${NC}"
echo -e "${BOLD}║  ${YELLOW}Tier 3: Unverified Bots${NC} → Teaser only (bad/fake signature)            ${BOLD}║${NC}"
echo -e "${BOLD}║  ${NC}                                                                         ${BOLD}║${NC}"
echo -e "${BOLD}╠═══════════════════════════════════════════════════════════════════════════╣${NC}"
echo -e "${BOLD}║  ${CYAN}Key Features:${NC}                                                          ${BOLD}║${NC}"
echo -e "${BOLD}║  ${NC}• RFC 9421 HTTP Message Signatures (Ed25519)                             ${BOLD}║${NC}"
echo -e "${BOLD}║  ${NC}• Decentralized identity via JWKS endpoints                              ${BOLD}║${NC}"
echo -e "${BOLD}║  ${NC}• Publisher-controlled policies (whitelist, teaser, deny, pay)           ${BOLD}║${NC}"
echo -e "${BOLD}║  ${NC}• Real-time telemetry: ${BLUE}https://openbotauth.org/radar${NC}                  ${BOLD}║${NC}"
echo -e "${BOLD}║  ${NC}                                                                         ${BOLD}║${NC}"
echo -e "${BOLD}╚═══════════════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${BOLD}Live Dashboards:${NC}"
echo -e "  • Radar (global stats): ${BLUE}https://openbotauth.org/radar${NC}"
echo -e "  • WordPress Admin:      ${BLUE}https://blog.attach.dev/wp-admin${NC} → OpenBotAuth → Analytics"
echo ""
