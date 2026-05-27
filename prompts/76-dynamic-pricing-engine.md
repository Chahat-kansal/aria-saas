# Prompt 76 — AI Dynamic Pricing Engine

## What this is
An engine that suggests price adjustments to lift margin 1-3 points —
by competitor moves, demand, slow periods, day of week. Owner approves each change.
Aria already has competitor prices + the pricing agent — this makes it a real engine.

## Pre-edit checklist
1. Check src/app/api/pos/agents/[type]/route.ts (pricing agent)
2. Check competitor data: aria_competitor_watches / competitor price tables
3. DB: pos_products (price, cost_price), pos_sales, pos_sale_items

## DB migration
```sql
CREATE TABLE IF NOT EXISTS pricing_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id),
  product_id uuid REFERENCES pos_products(id),
  current_price numeric, suggested_price numeric,
  reason text, expected_margin_gain numeric,
  status text DEFAULT 'pending',  -- pending, applied, rejected
  created_at timestamptz DEFAULT now()
);
```

## Build
1. Engine: src/app/api/aria/dynamic-pricing/route.ts
   For each product, analyse:
   - Competitor price (if tracked) — if competitors higher, room to raise
   - Sales velocity — slow movers may need a drop; fast movers can hold or rise
   - Margin — products under target margin flagged for increase
   - Day/time patterns — quiet periods could support promotional pricing
   Produce pricing_suggestions with a clear reason + expected margin gain.
   Statistics-driven; use Haiku only to write the human reason.
2. Dashboard page src/app/dashboard/dynamic-pricing/page.tsx
   - Lists suggestions: product, current → suggested, reason, $ margin gain
   - Owner approves (applies the new price to pos_products) or rejects
   - Shows total annual margin gain if all applied
   - "Apply all safe suggestions" bulk action
3. Never auto-apply — owner approves every change.

## Rules
- Suggestions must be conservative — never suggest a price that kills volume
- Show the $ impact clearly — "this earns ~$1,200/year"
- npx tsc --noEmit + npm run build, single commit
- "feat: AI dynamic pricing engine — margin-lifting price suggestions, owner-approved"
