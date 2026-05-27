# Prompt 64 — Google Ads Integration: Ad Performance in Ask Aria

## What this unlocks
Owner asks: "Is my Google ad profitable?" or "How much did I spend on ads this week?"
Aria pulls: campaigns, spend, clicks, conversions, ROAS from Google Ads.
No partnership needed — Google Ads API is free with OAuth.

## Pre-edit checklist (MANDATORY)
1. `cat src/app/dashboard/integrations/page.tsx` — full read
2. Check DB: `businesses` table — any google_ads columns?
3. Check: existing Google OAuth setup (we already use Google for social features)

## What to build

### 1. DB migration
```sql
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS google_ads_customer_id text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS google_ads_access_token text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS google_ads_refresh_token text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS google_ads_connected boolean DEFAULT false;
CREATE TABLE IF NOT EXISTS google_ads_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id),
  period text, -- today, 7d, 30d
  spend numeric, clicks integer, impressions integer,
  conversions numeric, conversion_value numeric,
  top_campaign text, synced_at timestamptz DEFAULT now()
);
```

### 2. OAuth connect
Google Ads uses Google OAuth 2.0 with additional scope: `https://www.googleapis.com/auth/adwords`

`src/app/api/integrations/google-ads/connect/route.ts`
- Redirect to Google OAuth with adwords scope
- Store refresh token on callback

`src/app/api/integrations/google-ads/callback/route.ts`
- Exchange code for tokens
- Call Google Ads API to get customer ID
- Store in businesses table

### 3. Data sync
`src/app/api/integrations/google-ads/sync/route.ts`
Google Ads API v17: `https://googleads.googleapis.com/v17/customers/{customer_id}/googleAds:searchStream`

GAQL query:
```sql
SELECT campaign.name, metrics.cost_micros, metrics.clicks, 
metrics.impressions, metrics.conversions, metrics.conversions_value
FROM campaign WHERE segments.date DURING LAST_30_DAYS
```

Convert cost_micros to dollars (÷ 1,000,000).
Cache in google_ads_cache with 1hr TTL.

### 4. Ask Aria tool
Add `query_google_ads` to `src/lib/aria-tools.ts`:
- Returns: total spend, clicks, conversions, ROAS (revenue/spend), top campaign
- Aria uses this to answer: "Is my ad profitable?", "What campaign is working?"

### 5. Integrations page card
- Connected status, customer ID, last sync
- Mini summary: "Spent $340 this month · 1,240 clicks · 23 conversions · ROAS 2.4x"
- "Not connected" state with Connect button

### 6. Env vars needed
- `GOOGLE_ADS_CLIENT_ID`
- `GOOGLE_ADS_CLIENT_SECRET`
- `GOOGLE_ADS_DEVELOPER_TOKEN` — free from Google Ads API center

## Execution order
1. DB migrations via Supabase MCP
2. OAuth connect/callback routes
3. Sync route with GAQL
4. Add query_google_ads tool to aria-tools.ts
5. Add card to integrations page
6. `npx tsc --noEmit` + `npm run build` → must pass
7. Single commit: "feat: Google Ads integration — OAuth, campaign sync, Ask Aria tool"
