# Prompt 77 — AI Bundle Builder

## What this is
Aria analyses basket data (what sells together) and auto-builds profitable bundles.
"Wine + cheese + crackers — $35" — looks like a deal to the customer,
is actually a higher-margin sale than the items alone.
Bundles push to the POS and the In-Store kiosk.

## Pre-edit checklist
1. Check basket-analysis route (prompt 68): src/app/api/pos/basket-analysis/route.ts
2. DB: pos_products, pos_sale_items, pos_sales

## DB migration
```sql
CREATE TABLE IF NOT EXISTS product_bundles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id),
  bundle_name text,
  product_ids jsonb,         -- array of product ids
  bundle_price numeric,
  individual_total numeric,  -- sum if bought separately
  margin_at_bundle numeric,
  status text DEFAULT 'active',
  times_sold integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
```

## Build
1. Engine: src/app/api/aria/bundle-builder/route.ts
   - Reads basket co-occurrence data — products frequently bought together
   - For each strong pair/triple, calculates: a bundle price that looks like a
     discount to the customer BUT keeps margin healthy (uses cost_price)
   - Haiku names the bundle appealingly + writes a one-line pitch
   - Returns suggested bundles with the margin maths shown
2. Dashboard page src/app/dashboard/bundles/page.tsx
   - Lists Aria's suggested bundles + owner-created ones
   - Each: products, bundle price vs individual total, margin, "looks like X% off"
   - Owner approves a bundle → it becomes active
   - Shows times_sold + revenue per bundle
3. POS + kiosk integration
   - Active bundles show as a one-tap add in the POS terminal
   - Active bundles surface in the In-Store kiosk as suggestions

## Rules
- The bundle must ALWAYS keep healthy margin — never suggest a loss-making bundle
- Show the owner the real maths — customer-perceived discount vs actual margin
- npx tsc --noEmit + npm run build, single commit
- "feat: AI bundle builder — auto-built profitable bundles, POS + kiosk integration"
