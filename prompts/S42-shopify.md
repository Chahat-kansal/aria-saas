# S42 — Shopify Integration
STATUS: BLOCKED | MODE: SOLO
Covers: prompts/63

## BLOCKED — Cannot execute until:
1. Founder creates a Shopify Partner account at partners.shopify.com
2. Creates a custom app with Admin API access (read_products, read_orders, write_inventory scopes)
3. Provides: SHOPIFY_API_KEY, SHOPIFY_API_SECRET, SHOPIFY_SCOPES to Claude Code session
4. Verifies a test Shopify store is available for integration testing

---

## RULE 0 — UPGRADE ONLY
Protected files (never touch): AnimatedBg, FlyToCart, CursorGlow, pos-sfx.ts, aria-voice-guide.ts

## Sprint scope (once unblocked)

### Features to implement
- OAuth connect flow: /integrations/shopify/connect → OAuth → store access token in businesses (new columns: shopify_access_token, shopify_shop_domain)
- Product sync: Shopify products → pos_products (one-way, Shopify as source)
- Order sync: Shopify orders → pos_sales (online source flag)
- Inventory sync: pos_outlet_inventory.items_on_hand → Shopify inventory level
- Cron: shopify-sync (daily 0 3 * * *) — verify vercel.json function count ≤ 22

## Push
SOLO mode — stop before push. Founder verify required.
