# Prompt 63 — Shopify Integration: Live Online Store Data in Ask Aria

## What this unlocks
Owner asks: "How is my online store doing vs in-store?"
Aria pulls: orders, revenue, top products, abandoned carts, customer count from Shopify.
No partnership needed — Shopify Partner API is free and public.

## Pre-edit checklist (MANDATORY)
1. `cat src/app/dashboard/integrations/page.tsx` — full read (27KB)
2. `cat src/app/dashboard/settings/page.tsx` — full read (22KB)
3. Check DB via Supabase MCP: does `integrations` table exist? What columns?
4. Check: `businesses` table — any shopify columns?

## What to build

### 1. DB migration
```sql
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS shopify_store_url text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS shopify_access_token text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS shopify_connected boolean DEFAULT false;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS shopify_connected_at timestamptz;
CREATE TABLE IF NOT EXISTS shopify_sync_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id),
  data_type text, -- orders, products, customers, analytics
  payload jsonb,
  synced_at timestamptz DEFAULT now()
);
```

### 2. OAuth connect flow
Shopify uses OAuth 2.0. Owner enters their Shopify store URL (e.g. mysip.myshopify.com).
`src/app/api/integrations/shopify/connect/route.ts` — GET
- Takes `shop` param (store URL)
- Redirects to: `https://{shop}/admin/oauth/authorize?client_id={SHOPIFY_API_KEY}&scope=read_orders,read_products,read_customers,read_analytics&redirect_uri={CALLBACK_URL}&state={businessId}`

`src/app/api/integrations/shopify/callback/route.ts` — GET
- Exchanges code for access token
- Stores in `businesses.shopify_access_token` + `shopify_store_url` + `shopify_connected = true`

`src/app/api/integrations/shopify/disconnect/route.ts` — POST
- Clears shopify fields on businesses table

### 3. Data sync route
`src/app/api/integrations/shopify/sync/route.ts` — GET
Fetches from Shopify Admin API:
- Orders: last 30 days — total revenue, count, avg order value
- Top products: by revenue
- Abandoned carts: count + value
- Customers: total count, new this month

Store in `shopify_sync_cache` per data_type.
Cache TTL: 1 hour — don't hit Shopify on every Ask Aria question.

Shopify API base: `https://{shop}/admin/api/2024-01/`
Auth header: `X-Shopify-Access-Token: {access_token}`

### 4. Ask Aria tool — query_shopify
Add to `src/lib/aria-tools.ts`:
```ts
{
  name: 'query_shopify',
  description: 'Fetch Shopify online store data: orders, revenue, top products, abandoned carts, customers. Use when owner asks about online store, Shopify, or online vs in-store comparison.',
  input_schema: {
    type: 'object',
    properties: {
      metric: { type: 'string', enum: ['orders', 'revenue', 'products', 'customers', 'abandoned_carts', 'summary'] }
    },
    required: ['metric']
  }
}
```

Handler: fetch from shopify_sync_cache, trigger sync if stale.
Return data as structured JSON for Aria to analyse.

### 5. Integrations page card
In `src/app/dashboard/integrations/page.tsx` add Shopify card:
- Logo + "Shopify" title
- Status: Connected ✅ / Not connected
- If not connected: store URL input + "Connect Shopify" button
- If connected: store name, last sync time, "Sync now" button, "Disconnect" button
- Shows mini summary: "142 orders this month · $8,240 revenue · 3 abandoned carts"

### 6. Env vars needed (add to Vercel)
- `SHOPIFY_API_KEY` — from Shopify Partner dashboard
- `SHOPIFY_API_SECRET` — same
- `SHOPIFY_CALLBACK_URL` — `https://ariaos.site/api/integrations/shopify/callback`

## Execution order
1. Run DB migrations via Supabase MCP
2. Build connect/callback/disconnect routes
3. Build sync route
4. Add query_shopify tool to aria-tools.ts
5. Add Shopify card to integrations page
6. `npx tsc --noEmit` → zero errors
7. `npm run build` → must pass
8. Single commit: "feat: Shopify integration — OAuth connect, live order sync, Ask Aria tool"
