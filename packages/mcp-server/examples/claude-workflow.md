# Claude Desktop Workflow Examples

## Setup

1. Add MCP server to Claude Desktop config:

```json
{
  "mcpServers": {
    "openbotauth": {
      "command": "node",
      "args": ["/path/to/openbotauth/packages/mcp-server/dist/index.js"],
      "env": {
        "DATABASE_URL": "postgresql://...",
        "REDIS_URL": "redis://localhost:6379",
        "PAYMENT_BASE_URL": "http://localhost:8082"
      }
    }
  }
}
```

2. Restart Claude Desktop

---

## Example 1: Check Access Before Fetching

**User:**
> I want to read this article: https://example.com/premium-article
> My bot ID is http://localhost:8080/jwks/mybot.json

**Claude:**
> Let me check if you have access to that article.

*Claude calls `policy_apply` tool*

**Claude (if allowed):**
> ✅ You have access! I'll fetch the article for you.

**Claude (if payment required):**
> 💰 This article requires payment: $5.00 USD
> Would you like me to create a payment link?

**Claude (if denied):**
> ❌ Access denied: Agent not whitelisted

**Claude (if rate limited):**
> ⏱️ Rate limit exceeded. Please try again in 15 minutes.

---

## Example 2: Payment Flow

**User:**
> Yes, create the payment link

**Claude:**
> Creating payment intent...

*Claude calls `payments_create_intent` tool*

**Claude:**
> 💳 Payment link created: http://payment.example.com/pay?intent_id=...
> 
> Please complete the payment and let me know when done.

**User:**
> Done, I paid

**Claude:**
> Let me verify and fetch the article...

*Claude calls `policy_apply` again, then fetches content*

**Claude:**
> ✅ Payment verified! Here's the article: [content]

---

## Example 3: Track Usage

**User:**
> Log my access to https://example.com/article/123

**Claude:**
> Logging access event...

*Claude calls `meter_ingest` tool*

**Claude:**
> ✅ Access logged for analytics
> 
> Your usage stats:
> - Total accesses: 42
> - This month: 15
> - Total spent: $25.00

---

## Example 4: Check Multiple Resources

**User:**
> I want to read these 5 articles. Check which ones I can access:
> 1. https://example.com/article/1
> 2. https://example.com/article/2
> 3. https://example.com/article/3
> 4. https://example.com/article/4
> 5. https://example.com/article/5

**Claude:**
> Checking access for all 5 articles...

*Claude calls `policy_apply` 5 times in parallel*

**Claude:**
> Access status:
> 
> ✅ Article 1: Free access
> ✅ Article 2: Free access
> 💰 Article 3: $5.00 payment required
> ❌ Article 4: Access denied
> ✅ Article 5: Free access (teaser only - 100 words)
> 
> Would you like me to:
> 1. Fetch articles 1, 2, and 5 now
> 2. Create payment for article 3
> 3. Skip article 4

---

## Example 5: Budget Management

**User:**
> What's my usage this month?

**Claude:**
> Let me check your usage stats...

*Claude queries meter events*

**Claude:**
> 📊 Your usage this month:
> 
> **Accesses:** 127
> - Free articles: 95
> - Paid articles: 32
> 
> **Spending:** $160.00
> - Average per article: $5.00
> - Most accessed site: example.com (45 articles)
> 
> **Rate Limits Hit:** 3 times
> - Last: 2 days ago on news.example.com
> 
> **Recommendations:**
> - Consider subscribing to example.com (you access it frequently)
> - You're close to your $200 monthly budget

---

## Example 6: Batch Payment

**User:**
> Create payments for all articles that require it

**Claude:**
> Found 3 articles requiring payment:
> 1. Article A: $5.00
> 2. Article B: $10.00
> 3. Article C: $5.00
> 
> Total: $20.00
> 
> Creating payment intents...

*Claude calls `payments_create_intent` 3 times*

**Claude:**
> 💳 Payment links created:
> 1. [link1]
> 2. [link2]
> 3. [link3]
> 
> Or use this batch payment link: [batch_link]

---

## Example 7: Policy Preview

**User:**
> What's the policy for https://example.com?

**Claude:**
> Checking policy...

*Claude calls `policy_apply` with a test resource*

**Claude:**
> 📋 Policy for example.com:
> 
> **Default Effect:** Teaser (100 words)
> 
> **Whitelist:** None
> **Blacklist:** None
> 
> **Rate Limit:** 100 requests/hour
> 
> **Pricing:**
> - Regular articles: Free (teaser)
> - Premium articles: $5.00
> 
> **Your Status:**
> - Requests this hour: 15/100
> - Paid articles: 5

---

## Tips for Claude

1. **Always check access first** before fetching content
2. **Batch operations** when checking multiple resources
3. **Track usage** for budget management
4. **Cache policy results** for frequently accessed sites
5. **Suggest subscriptions** for frequently accessed paid sites
6. **Warn about rate limits** before hitting them
7. **Show cost estimates** before creating payments

