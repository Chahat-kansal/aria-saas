# Prompt 75 — In-Store Ad Network: Sell Screen Space to Brands

## What this is
The owner's customer display + In-Store kiosk become advertising space.
Brands (a wine label, a local supplier) pay to feature on the screen.
The owner earns pure-margin income for screen space they already own.
Aria manages it end to end.

## Pre-edit checklist
1. Check existing customer display: src/app/pos/display/page.tsx
2. Check the kiosk (prompt 74): src/app/kiosk/[business_id]/page.tsx
3. DB: businesses, pos_products

## DB migrations (Supabase MCP)
```sql
CREATE TABLE IF NOT EXISTS ad_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id),
  advertiser_name text, advertiser_contact text,
  ad_title text, ad_body text, ad_image_url text,
  weekly_rate numeric, start_date date, end_date date,
  status text DEFAULT 'pending',  -- pending, active, paused, ended
  impressions integer DEFAULT 0, created_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ad_impressions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid REFERENCES ad_campaigns(id),
  business_id uuid REFERENCES businesses(id),
  shown_at timestamptz DEFAULT now()
);
```

## Build
1. Dashboard page src/app/dashboard/ad-network/page.tsx
   - Owner creates an ad slot: advertiser name, ad content, weekly rate, dates
   - Lists active campaigns, revenue earned, impressions
   - "Aria suggests" — which local brands/suppliers would be a good fit (from supplier data)
2. Ad display integration
   - On the customer display + kiosk idle screen, rotate active ads between Aria's own content
   - Each show logs an ad_impression
   - Ads look native — clean, not spammy, match the screen design
3. Revenue tracking
   - ad-network page shows: total ad revenue this month, per campaign, impressions delivered
4. API routes: /api/pos/ad-campaigns (CRUD), /api/pos/ad-impressions (log)

## Rules
- Ads only show on the owner's OWN screens — never cross-business
- Owner approves every ad before it goes live
- Clean native design — never degrade the customer experience
- npx tsc --noEmit + npm run build, single commit
- "feat: in-store ad network — sell display/kiosk screen space, revenue tracking"
