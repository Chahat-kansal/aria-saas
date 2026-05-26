# Prompt 46 — Quote Builder: PandaDoc + Proposify-Level Pro Upgrade

## Category leader bar
PandaDoc: e-signature, quote acceptance tracking, viewed tracking, expiry dates, product catalogue, terms sections, PDF download, payment collection on acceptance.
Proposify: all above + interactive pricing tables, approval workflows, content library.
Aria must match 80% AND add AI differentiation.

## Pre-edit checklist (MANDATORY — read ALL before writing one line)
1. `cat src/app/dashboard/quote-builder/page.tsx` — full read (16KB)
2. `cat src/app/api/aria/generate-quote/route.ts` — full read (7KB)
3. Check DB via Supabase MCP: `quotes` table — ALL columns
4. `cat src/app/api/invoices/send/route.ts` — Resend email pattern
5. `cat src/app/api/pos/products/route.ts` — product catalogue pattern
6. Check if `quote_views` table exists in Supabase

## AI differentiation (what beats PandaDoc)
- **AI quote generator**: describe the job in plain language → Aria writes the full quote with correct line items, GST, terms
- **Smart pricing**: Aria checks your product catalogue and suggests correct pricing automatically
- **Win prediction**: Aria scores likelihood of quote acceptance (0-100%) based on amount, customer history, industry benchmarks
- **AI follow-up**: if quote not accepted in 3 days → Aria drafts a follow-up email for owner to review and send

## Features to build — no stubs, no TODOs

### 1. Quote acceptance + e-signature
Public quote view page: `/quote/[token]` — customer sees beautiful quote.
"Accept Quote" button → customer types their name → timestamp recorded → quote marked `accepted`.
Store: `accepted_at`, `accepted_by_name`, `acceptance_ip` on quotes table.
Send confirmation email to both owner and customer on acceptance.
Show on dashboard: accepted quotes with green checkmark + acceptance timestamp.
This is NOT a real legal e-signature (that requires DocuSign) — it's a digital acceptance record, which is legally sufficient for most Australian small business quotes.

### 2. Quote viewed tracking
Every time customer opens `/quote/[token]`: record a view.
Store in `quote_views` table:
```sql
CREATE TABLE IF NOT EXISTS quote_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid REFERENCES quotes(id),
  viewed_at timestamptz DEFAULT now(),
  ip_address text,
  user_agent text
);
```
On dashboard quote list: "Viewed 3 times — last viewed 2 hours ago"
Show view timeline: list of view timestamps.

### 3. Quote expiry
"Expires in X days" field on quote creation (default 30 days).
On public quote page: countdown "This quote expires in 12 days"
After expiry: show "This quote has expired — contact [business] for a new quote"
Auto-expire cron: mark quotes as `expired` when `expires_at < now()`.
Add: `expires_at timestamptz`, `status text` to quotes table.

### 4. Product catalogue integration
When generating quote: pull from POS products.
"Add from catalogue" button in quote builder.
Shows searchable product list from `/api/pos/products`.
Click product → adds line item with correct name + price.
Owner can override price per line item.
Mix catalogue items + custom items in same quote.

### 5. Interactive pricing table
Quote has two views:
- **Simple**: flat price, description, total
- **Itemised**: table with qty, unit price, line total, GST, grand total
Toggle between modes.
GST calculation: always correct — show GST-exclusive + GST amount + GST-inclusive total.
Discount field: flat amount or percentage.
Deposit field: "50% deposit required = $X"

### 6. AI win prediction + follow-up
On each quote card in history: AI win score badge.
Call Claude Haiku: given quote amount + customer (if known) + days since sent → score 0-100% likelihood of acceptance.
Log to `aria_ai_calls`.
If quote not accepted in 3 days: show "📨 Aria suggests following up" banner on quote card.
Click: shows AI-drafted follow-up email in editable textarea → owner approves → sends via Resend.

### 7. Quote pipeline view
Toggle between List view and Pipeline view.
Pipeline: 5 columns — Draft | Sent | Viewed | Accepted | Declined/Expired
Each quote card: client name, amount, days since sent, win score.
Revenue metrics at top:
- Quotes sent this month: $X total value
- Accepted: $Y (Z%)
- Pipeline value: $W outstanding

### 8. Terms and conditions section
Each quote has a terms section at bottom.
Owner sets default terms in settings (stored in `businesses.default_quote_terms`).
Shows on public quote page below pricing.
Editable per quote.
Add `businesses.default_quote_terms text` column.

## DB migrations (run via Supabase MCP FIRST)
```sql
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS token text DEFAULT gen_random_uuid()::text;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS accepted_at timestamptz;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS accepted_by_name text;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS acceptance_ip text;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS expires_at timestamptz DEFAULT (now() + interval '30 days');
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS status text DEFAULT 'draft' CHECK (status IN ('draft','sent','viewed','accepted','declined','expired'));
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS win_score integer;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS terms text;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS view_count integer DEFAULT 0;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS last_viewed_at timestamptz;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS default_quote_terms text;
CREATE TABLE IF NOT EXISTS quote_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid REFERENCES quotes(id) ON DELETE CASCADE,
  viewed_at timestamptz DEFAULT now(),
  ip_address text,
  user_agent text
);
```

## Routes to build
- `src/app/quote/[token]/page.tsx` — public quote view + acceptance page
- `src/app/api/quotes/[id]/accept/route.ts` — POST acceptance
- `src/app/api/quotes/[id]/view/route.ts` — POST view tracking
- `src/app/api/aria/quote-followup/route.ts` — AI follow-up draft

## Design
- Public quote page: clean professional white theme. Business logo at top. Fraunces italic for quote title.
- Dashboard: Financial Trust dark palette
- Pipeline view columns: colour-coded headers
- Win score: green pill if >70%, amber 40-70%, red <40%
- Accepted quotes: green checkmark icon + "Accepted by [name] on [date]"

## Quality bar
Public quote page must feel as professional as a PandaDoc quote. Owner dashboard must show full pipeline visibility.

## Execution order
1. Run ALL DB migrations via Supabase MCP
2. Read ALL pre-edit files
3. Build public quote page `/quote/[token]`
4. Build accept + view tracking routes
5. Build AI follow-up route
6. Upgrade `src/app/dashboard/quote-builder/page.tsx` — additive, keep existing AI generator
7. `npx tsc --noEmit` — zero TS errors
8. `npm run build` — must pass
9. `git add -A && git commit -m "feat: quotes — PandaDoc-level acceptance tracking, viewed tracking, expiry, product catalogue, pipeline view, AI win prediction" && git push`
