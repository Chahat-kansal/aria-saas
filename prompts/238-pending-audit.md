# Prompt 238 — Pending Prompts: Full Audit-Verified Implementation

## HOW TO USE THIS
Run each section in order. After every commit: `npx tsc --noEmit` + `npm run build` + `git push origin main`.
UPGRADE-ONLY: never remove, stub, or downgrade any existing feature. Fix forward only.
Read every file you will edit IN FULL before writing a single line.

---

## WHAT'S ALREADY DONE — DO NOT REIMPLEMENT

After full code audit, these are confirmed done and must NOT be touched:

- **P04 TourSpotlight** — `src/components/dashboard/TourSpotlight.tsx` exists (102 lines). ✅ Component built.
- **P17-18 POS Layout** — `POSLayoutCustomiser.tsx` (448 lines), `layout-preferences/route.ts` (99 lines), `@dnd-kit` installed. ✅ Core built.
- **P29 Privacy** — `/api/account/export` (49 lines, Content-Disposition header ✅), `/api/account/delete` (56 lines, deleteUser ✅), `/goodbye` page ✅. Settings page has privacy section ✅.
- **P62 Outlets API** — `/api/pos/outlets/[id]` GET/POST/PATCH (99 lines) ✅. Settings has locations tab ✅.
- **P68 Live POS** — live-staffing (80 lines) ✅, basket-analysis (68 lines) ✅, pricing-intelligence (62 lines) ✅, AriaInlineCard ✅, terminal uses nudges ✅.
- **P75 Ad Network** — dashboard page (253 lines) ✅, API (129 lines) ✅, display page shows ads ✅.
- **P89 Hub** — `/{slug}` catch-all route ✅, `/dashboard/share` ✅, `/dashboard/inbox` ✅.
- **P92 resolveBusinessId** — `src/lib/aria/resolve-business.ts` ✅.
- **P104 CRM** — customers/[id] routes ✅, segment route ✅, import route ✅, customers page 460 lines with RFM ✅.
- **P111 Bookings** — availability route ✅, `/book/[slug]` public page ✅, `/book/cancel` ✅, dashboard 484 lines with reminder ✅.

---

## GENUINELY PENDING — GAPS CONFIRMED BY CODE AUDIT

---

## SECTION 1 — P04: Wire Setup Guide to Dashboard

**What's done:** `TourSpotlight.tsx` component exists.
**What's missing:** No setup card on the actual dashboard home. `business_setup_progress` table not referenced anywhere in code. The card never shows.

### DB (run via Supabase MCP first)
```sql
CREATE TABLE IF NOT EXISTS business_setup_progress (
  business_id uuid PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  completed_tasks jsonb DEFAULT '[]',
  dismissed boolean DEFAULT false,
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE business_setup_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_setup" ON business_setup_progress
  FOR ALL USING (user_id = auth.uid());
```

### API route
`src/app/api/setup/progress/route.ts`:
- GET: fetch or auto-create row for current user's active business. Cross-check real data: mark `add_product` done if business has ≥1 pos_product, `test_sale` done if has ≥1 pos_sale, `set_hours` done if business_hours exists, `invite_staff` done if staff_members count > 0, `connect_google` done if google_business_url is set.
- PATCH `{ task_key, completed }`: update completed_tasks array. Also accepts `{ dismissed: true }`.

### Dashboard card
In `src/app/dashboard/page.tsx` (read it fully first), add a `SetupGuideCard` component that:
- Fetches `GET /api/setup/progress` on mount
- Shows if `dismissed=false` AND not all required tasks complete
- Displays progress bar (X/N done) + task list with "Do it →" buttons
- Each button routes to the relevant page AND passes `?guide={task_key}` query param
- TourSpotlight already exists — wire it: when `?guide=add_product` is in the URL on `/pos/products`, find the element with `data-tour="add-product"` and activate TourSpotlight
- "Dismiss" link → PATCH dismissed=true

Add `data-tour="add-product"` to the "Add product" button in the products page if not present.

Commit: `"feat(setup-guide): wire SetupGuideCard to dashboard home + DB progress tracking"`

---

## SECTION 2 — P17-18: Wire POS Layout Customiser into POS Terminal

**What's done:** `POSLayoutCustomiser.tsx` (448 lines) + `layout-preferences/route.ts` built.
**What's missing:** No "Customise layout" button in the POS terminal or settings. The component exists but is unreachable.

### What to add
1. Read `src/app/pos/(fullscreen)/terminal/page.tsx` fully before editing.
2. In the POS terminal header/settings area, add a "Customise layout" button (gear or grid icon).
3. On click, render `POSLayoutCustomiser` as a slide-in panel or modal.
4. On POS terminal mount, fetch `GET /api/pos/layout-preferences` and apply saved `nav_order` / `nav_groups` to the nav rendering.
5. Add a "Reset to default" button that calls `DELETE /api/pos/layout-preferences` (already built — only clears nav columns, not product grid).

Commit: `"feat(pos-layout): wire POSLayoutCustomiser into terminal — customise button + load on mount"`

---

## SECTION 3 — P29: Surface Privacy in Settings Page

**What's done:** Export route (49 lines ✅), delete route (56 lines ✅), goodbye page ✅, settings has a privacy section.
**What's missing:** Check if the settings page actually has working "Download my data" and "Delete account" buttons wired to the routes. The privacy section exists in settings but may be incomplete.

### What to verify and fix
1. Read `src/app/dashboard/settings/page.tsx` fully.
2. Ensure "Download my data" button calls `GET /api/account/export` and triggers browser download.
3. Ensure "Delete account" section has: warning text, text input requiring `"DELETE MY DATA"`, red button calling `DELETE /api/account/delete`, redirect to `/goodbye` on success.
4. If these buttons exist and work → skip. Only add what's missing.

Commit: `"fix(privacy): ensure export download + delete account buttons are wired in settings"`

---

## SECTION 4 — P62: Multi-Outlet — Missing Pieces

**What's done:** Outlets API (GET/POST/PATCH) ✅, Settings has locations tab ✅.
**What's missing:** No outlet switcher in POS terminal. No `pos_outlet_stock` table. `pos_cash_sessions.outlet_id` may be missing.

### DB (Supabase MCP)
```sql
ALTER TABLE pos_cash_sessions ADD COLUMN IF NOT EXISTS outlet_id uuid REFERENCES pos_outlets(id);
CREATE TABLE IF NOT EXISTS pos_outlet_stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id uuid REFERENCES pos_outlets(id) ON DELETE CASCADE,
  product_id uuid REFERENCES pos_products(id) ON DELETE CASCADE,
  stock_quantity numeric DEFAULT 0,
  reorder_point numeric DEFAULT 5,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(outlet_id, product_id)
);
```

### Outlet switcher in POS terminal
Read `src/app/pos/(fullscreen)/terminal/page.tsx` fully first.

Add outlet switcher to terminal header (only shows if business has >1 outlet):
```tsx
// Small pill in header: "📍 Bentleigh East ▼"
// Click → dropdown of active outlets
// On select: localStorage.setItem(`aria_pos_outlet_${businessId}`, newOutletId)
// Reload products for new outlet, clear cart
```
On terminal mount: `const outletId = localStorage.getItem('aria_pos_outlet_' + businessId) ?? outlets[0]?.id`
Pass `outlet_id` when opening a cash session.

Commit: `"feat(multi-outlet): outlet switcher in POS terminal + outlet_id on cash sessions"`

---

## SECTION 5 — P66: Slack Integration (Zero code exists)

**What's done:** Nothing. No Slack code anywhere in the codebase.
**What's missing:** Everything.

### DB (Supabase MCP)
```sql
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS slack_access_token text,
  ADD COLUMN IF NOT EXISTS slack_team_id text,
  ADD COLUMN IF NOT EXISTS slack_team_name text,
  ADD COLUMN IF NOT EXISTS slack_channel_id text,
  ADD COLUMN IF NOT EXISTS slack_channel_name text,
  ADD COLUMN IF NOT EXISTS slack_connected boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS slack_briefing_enabled boolean DEFAULT false;
```

### OAuth routes
`src/app/api/integrations/slack/connect/route.ts` — redirect to Slack OAuth:
```
https://slack.com/oauth/v2/authorize?client_id={SLACK_CLIENT_ID}&scope=chat:write,channels:read&redirect_uri={CALLBACK_URL}
```

`src/app/api/integrations/slack/callback/route.ts` — exchange code for token, save to businesses table, redirect to integrations page.

`src/app/api/integrations/slack/disconnect/route.ts` — clear slack columns.

### Channel selector
`PUT /api/integrations/slack/channel` — save channel_id + channel_name to businesses.

### Send route
`src/app/api/integrations/slack/send/route.ts`:
```typescript
// POST { business_id, message, blocks? }
// Calls: POST https://slack.com/api/chat.postMessage
// Headers: Authorization: Bearer {slack_access_token}
```

### Wire into daily briefing
In the daily briefing cron route, after briefing is generated, check if `slack_connected && slack_briefing_enabled`. If yes: format as Slack Block Kit and send via the send route.

Slack Block Kit format:
```json
{
  "blocks": [
    {"type": "header", "text": {"type": "plain_text", "text": "☀️ Aria Morning Briefing — {business_name}"}},
    {"type": "section", "text": {"type": "mrkdwn", "text": "{briefing_text}"}},
    {"type": "actions", "elements": [{"type": "button", "text": {"type": "plain_text", "text": "Open Aria"}, "url": "https://ariaos.site/dashboard"}]}
  ]
}
```

### Integrations page card
Read `src/app/dashboard/integrations/page.tsx` fully first. Add Slack card with:
- Connect/disconnect button
- Channel selector dropdown (after connected)
- "Send daily briefing to Slack" toggle
- "Send test message" button

Env vars needed: `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`

Commit: `"feat(slack): Slack OAuth + daily briefing to channel + integrations card"`

---

## SECTION 6 — P89: Customer Hub Gaps

**What's done:** `/{slug}` catch-all route ✅, `/dashboard/share` ✅, `/dashboard/inbox` ✅.
**What's missing:** `businesses.slug` column not referenced anywhere — the hub route may not actually resolve by slug. `customer_hub_clicks` table missing. Loyalty default config not seeded.

### DB (Supabase MCP)
```sql
-- businesses.slug for hub URL
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS slug text UNIQUE;
UPDATE businesses SET slug = lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g')) WHERE slug IS NULL;

ALTER TABLE businesses ADD COLUMN IF NOT EXISTS hub_visible_features jsonb DEFAULT '["loyalty","booking","community","review","website"]';

-- Hub click tracking
CREATE TABLE IF NOT EXISTS customer_hub_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  visitor_id text,
  target text,
  referrer text,
  user_agent text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE customer_hub_clicks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hub_clicks_owner_read" ON customer_hub_clicks FOR SELECT TO authenticated
  USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
CREATE POLICY "hub_clicks_anon_insert" ON customer_hub_clicks FOR INSERT TO anon WITH CHECK (true);

-- Default loyalty config for all businesses missing one
INSERT INTO pos_loyalty_config (business_id, program_type, points_per_dollar, stamps_to_reward, stamp_reward_text, public_enrol_enabled)
SELECT id, 'points', 1, 10, 'Free item', false
FROM businesses
WHERE id NOT IN (SELECT business_id FROM pos_loyalty_config WHERE business_id IS NOT NULL);
```

### Wire slug lookup in hub route
Read `src/app/[slug]/page.tsx` fully. Ensure it resolves by `businesses.slug` column (not just `businesses.name`). If it's currently doing a name-based lookup, switch to slug column lookup.

Log hub visits to `customer_hub_clicks` with `target = 'hub_view'` on each page load.

### Wire resolveBusinessId across public loyalty routes
`src/lib/aria/resolve-business.ts` exists (13 lines). Ensure it's imported and used in:
- `src/app/api/public/loyalty/[business_id]/route.ts` (and sub-routes)
- `src/app/api/bookings/public/[business_id]/route.ts`
- Any other public-by-id routes

Commit: `"feat(hub): slug column + hub click tracking + loyalty default config + resolveBusinessId across public routes"`

---

## SECTION 7 — P104: Customer CRM — Missing Pieces

**What's done:** customers/[id] routes ✅, segment route ✅, import ✅, 460-line page with RFM ✅.
**What's missing:** `/api/customers/bulk-winback` route. Customer detail slide-over panel in the UI (page has no `slide` or `detail` panel logic). Customer detail sub-routes exist (`ai-summary`, `winback`) but UI may not surface them.

### Bulk winback route (missing)
`src/app/api/customers/bulk-winback/route.ts`:
```typescript
// POST { customer_ids: string[], message_override?: string }
// Rate limit: max 100 at once
// For each customer: call /api/customers/[id]/winback logic
// Stagger: 1 per second to avoid Twilio limits
// Return: { sent: number, failed: number, errors: [] }
```

### Customer detail slide-over
Read `src/app/dashboard/customers/page.tsx` fully. The page is 460 lines but has no slide-over/detail panel. Add:
- Click on customer row → right slide-over panel
- Shows: name, email, phone, segment badge, RFM scores, tags (editable inline), notes
- Spend chart: monthly spend bar chart (last 6 months) — use recharts
- Visit history: last 10 pos_sales for this customer
- AI summary section with "Regenerate" button → calls `/api/customers/[id]/ai-summary`
- "Send winback" button → calls `/api/customers/[id]/winback` with preview

Add "Bulk action" toolbar (shows when rows selected): Bulk winback | Export selected

Commit: `"feat(crm): bulk-winback route + customer detail slide-over panel with history + AI summary"`

---

## SECTION 8 — P108: Xero Sync — Review-First Flow

**What's done:** Xero OAuth connect/callback/disconnect ✅. That's it — no sync routes.
**What's missing:** The entire sync flow. `/api/xero` only has `callback`, `connect`, `disconnect` — no prepare/preview/approve/sync routes. No Xero dashboard page.

### DB (Supabase MCP)
```sql
CREATE TABLE IF NOT EXISTS xero_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  synced_at timestamptz DEFAULT now(),
  sales_count integer DEFAULT 0,
  total_amount numeric DEFAULT 0,
  xero_invoice_ids jsonb DEFAULT '[]',
  status text DEFAULT 'success' CHECK (status IN ('success','failed','partial')),
  error_message text
);
ALTER TABLE xero_sync_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_xero_log" ON xero_sync_log FOR ALL
  USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));

ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS xero_synced boolean DEFAULT false;
ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS xero_invoice_id text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS xero_auto_sync boolean DEFAULT false;
```

### Sync routes (read existing xero connect/callback routes first for token pattern)
`POST /api/xero/sync/prepare` — `{ business_id, date_from, date_to }`:
- Pull pos_sales not yet synced (xero_synced=false) in date range
- Group by day → daily summary line items
- Return `{ pending: [{ date, total_sales, gst, net, line_items[] }] }`

`GET /api/xero/sync/preview` — returns pending items

`POST /api/xero/sync/approve` — `{ business_id, item_ids[] }`:
- Create as Xero invoices (ACCREC, status SUBMITTED) via Xero API
- Mark pos_sales xero_synced=true, store xero_invoice_id
- Write to xero_sync_log

`POST /api/xero/sync/auto` — prepare + approve in one step (for auto-sync)

Token refresh: check token expiry on every Xero API call, refresh if within 24h.

### Xero dashboard page
`src/app/dashboard/xero/page.tsx`:
- Connection status: connected workspace, token expiry, last sync date
- "Sync now" button → prepare → preview modal (show what will be sent) → "Approve & sync" button
- Auto-sync toggle (writes `businesses.xero_auto_sync=true`)
- Sync history table: date | sales count | total | status | errors
- Error rows have "Retry" button

In `src/components/dashboard/Sidebar.tsx`, ensure Xero has a sidebar entry if not already present.

Commit: `"feat(xero): review-first sync flow — prepare/preview/approve + Xero dashboard page"`

---

## SECTION 9 — P219: Gift Cards — Missing Dashboard + Transactions

**What's done:** `/api/pos/gift-cards/route.ts` (153 lines, has issue but not redeem/topup). `pos_gift_cards` table exists.
**What's missing:** `gift_card_transactions` table, `gift_card_settings` table, `/api/gift-cards` routes (separate from `/api/pos/gift-cards`), `/dashboard/gift-cards` page, POS payment integration.

### DB (Supabase MCP)
```sql
CREATE TABLE IF NOT EXISTS gift_card_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  gift_card_id uuid REFERENCES pos_gift_cards(id) ON DELETE CASCADE NOT NULL,
  type text NOT NULL CHECK (type IN ('issue','redeem','topup','refund','void','expire')),
  amount numeric NOT NULL,
  balance_after numeric NOT NULL,
  sale_id uuid REFERENCES pos_sales(id) ON DELETE SET NULL,
  staff_name text,
  note text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE gift_card_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_gc_txns" ON gift_card_transactions FOR ALL
  USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
CREATE INDEX ON gift_card_transactions (business_id, gift_card_id);
CREATE INDEX ON gift_card_transactions (business_id, created_at DESC);

CREATE TABLE IF NOT EXISTS gift_card_settings (
  business_id uuid PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
  enabled boolean DEFAULT true,
  expiry_months integer DEFAULT 36,
  min_load numeric DEFAULT 10,
  max_load numeric DEFAULT 500,
  max_balance numeric DEFAULT 1000,
  allow_topup boolean DEFAULT true,
  allow_partial_redeem boolean DEFAULT true,
  prefix text DEFAULT 'GC',
  brand_color text DEFAULT '#2D5240',
  terms_text text,
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE gift_card_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_gc_settings" ON gift_card_settings FOR ALL
  USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));

ALTER TABLE pos_gift_cards ADD COLUMN IF NOT EXISTS redeemed_amount numeric DEFAULT 0;
ALTER TABLE pos_gift_cards ADD COLUMN IF NOT EXISTS last_used_at timestamptz;
ALTER TABLE pos_gift_cards ADD COLUMN IF NOT EXISTS voided_at timestamptz;
ALTER TABLE pos_gift_cards ADD COLUMN IF NOT EXISTS void_reason text;
```

### API routes — `/api/gift-cards/`
Read existing `/api/pos/gift-cards/route.ts` first — do NOT duplicate, extend.

`GET /api/gift-cards` — list all for business with stats (active_count, total_liability, redeemed_this_month, issued_this_month)
`POST /api/gift-cards` — issue new card. Generate code: `{prefix}-{4chars}-{4chars}`. Create pos_gift_cards row + gift_card_transactions row (type='issue').
`GET /api/gift-cards/[code]` — public balance check, no auth required.
`PATCH /api/gift-cards/[id]` — actions: redeem | topup | void | flag. Each creates a gift_card_transactions row.
`GET /api/gift-cards/[id]/transactions` — full transaction history.

### Dashboard page
`src/app/dashboard/gift-cards/page.tsx` with 4 tabs:
- **Overview**: stats row (4 cards) + gift cards table with search + click to expand transaction history
- **Issue**: form (balance, recipient, message) → POST → show code + copy button
- **Lookup**: code input → GET → show balance/status + Redeem/Top up buttons
- **Settings**: form matching gift_card_settings fields

### POS integration (UPGRADE ONLY — read terminal page fully first)
Add "Gift card" to payment method options in POS terminal. On select: code input → balance check → redeem on confirm. Handle partial redemption (prompt for remaining via another method).

### Sidebar
Add to `src/components/dashboard/Sidebar.tsx` under Revenue section:
`'gift-cards': { href: '/dashboard/gift-cards', label: 'Gift cards', icon: CreditCardIcon }`

Commit: `"feat(gift-cards): transactions table + dashboard (4 tabs) + API routes + POS payment + sidebar"`

---

## FINAL RULES
- Each section = its own commit(s)
- `npx tsc --noEmit` + `npm run build` before every commit
- `git push origin main` after every commit
- Vercel: max 22 functions, cron = daily only
- UPGRADE-ONLY: never remove existing code — only add
- All DB amounts in dollars (numeric), never cents
- Models: `claude-haiku-4-5-20251001` for AI calls

## PRIORITY ORDER if limit runs low
1. **Section 8** — Xero sync (nothing exists, high business value)
2. **Section 9** — Gift cards dashboard (API partial, dashboard missing)
3. **Section 5** — Slack (zero code, quick win)
4. **Section 1** — Setup guide wiring (component exists, just not connected)
5. **Section 7** — CRM bulk-winback + slide-over
6. **Section 6** — Hub slug + loyalty seeding
7. **Section 4** — Multi-outlet switcher in terminal
8. **Section 2** — POS layout customiser button
9. **Section 3** — Privacy settings buttons (likely already done)
