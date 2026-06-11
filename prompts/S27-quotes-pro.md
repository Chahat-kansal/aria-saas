# S27 — Quotes PandaDoc-level
STATUS: ABSENT | MODE: SOLO
Covers: prompts/46-quotes-pandadoc-level.md

---

## RULE 0 — UPGRADE ONLY
Every change must ONLY upgrade, improve, or add. Never downgrade, remove, stub, or weaken.
Protected files (never touch): AnimatedBg, FlyToCart, CursorGlow, pos-sfx.ts, aria-voice-guide.ts

## Pre-flight
See RUNNER-PROTOCOL.md Pre-flight protocol steps 1–9.
Sibling-check: `%quote%`, `%proposal%`, `%estimate%`

## CONSTRAINT CATALOGUE
FIRST ACTION at execution time: run live SQL for every table this sprint touches.
Tables: businesses, pos_customers, customers, invoices, pos_products

```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name IN ('pos_customers','invoices')
ORDER BY table_name, ordinal_position;
```

Fill in results here before writing any code.
Check if a `quotes` table already exists before creating one.

## Full implementation scope

### New table: quotes
```sql
CREATE TABLE quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses NOT NULL,
  customer_id uuid REFERENCES pos_customers,
  customer_name text,
  customer_email text,
  quote_number text NOT NULL,
  status text NOT NULL DEFAULT 'draft',  -- draft|sent|viewed|accepted|declined|expired
  title text,
  line_items jsonb NOT NULL DEFAULT '[]',
  subtotal numeric NOT NULL DEFAULT 0,
  gst_total numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  notes text,
  terms text,
  valid_until date,
  sent_at timestamptz,
  viewed_at timestamptz,
  accepted_at timestamptz,
  declined_at timestamptz,
  accepted_by_name text,
  share_token text UNIQUE,
  convert_to_invoice_id uuid REFERENCES invoices,
  ai_generated boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX ON quotes (business_id, status);
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner" ON quotes USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
```

### API routes
- `GET/POST /api/pos/quotes` — list + create
- `GET/PATCH/DELETE /api/pos/quotes/[id]` — read/update/delete
- `POST /api/pos/quotes/[id]/send` — email to customer, set status='sent', generate share_token
- `POST /api/pos/quotes/[id]/convert` — convert accepted quote → invoice
- `GET /api/public/quotes/[token]` — public view (no auth)
- `POST /api/public/quotes/[token]/accept` — customer accepts; records accepted_by_name
- `POST /api/public/quotes/[token]/decline`

### Dashboard page: /dashboard/quotes
- List view with status chips (draft/sent/viewed/accepted/declined/expired)
- Create quote: business-name autofill, line items (product search or freeform), AI "suggest pricing" button
- Quote detail: preview, send button, "Convert to Invoice" button (when status=accepted)
- Metrics panel: acceptance rate, avg time to accept, quote pipeline total

### AI integration
- "Suggest pricing" button on line items → calls claude-haiku → suggests price based on product cost + margin target from business settings
- "Write cover note" → calls claude-haiku → personalised intro paragraph for the quote
- Log to aria_ai_calls (agent_key='quote_ai', role='generation')

### Public quote page: /q/[token]
- Branded with business logo + name
- Line items clearly formatted
- GST breakdown
- Accept / Decline buttons
- Tracks `viewed_at` on first view (upsert)

### Convert to Invoice
- POST /api/pos/quotes/[id]/convert
- Creates invoice from quote line_items; links quote.convert_to_invoice_id → invoice.id
- Updates quote status → 'converted'

## Aria Intelligence Rule
- Accepted quote value → feed into `aria_daily_briefings` next-day revenue context
- Declined quotes → `upsertAriaAction` category='revenue' "Quote declined: consider follow-up"
- Quotes not viewed after 3 days → `upsertAriaAction` category='revenue' "Quote unread — consider a follow-up call"
- All AI calls → `aria_ai_calls` (agent_key, model_id, input_tokens, output_tokens, cost_usd_cents, success)

## Build gate
```
npx tsc --noEmit && npm run build
```

## Founder verify checklist (15 min max)
- [ ] Create a draft quote with 3 line items; confirm saved to `quotes` table with correct totals
- [ ] Send quote → confirm share_token generated; open /q/[token] without auth → quote displays
- [ ] Accept quote via public page → confirm `accepted_at` set, status='accepted'
- [ ] Convert to Invoice → confirm invoice created in `invoices` table, linked
- [ ] "Suggest pricing" AI button returns a price; aria_ai_calls log entry created
- [ ] /dashboard/quotes shows all quotes; filter by status works
- [ ] Expired quotes (valid_until < today) auto-show as 'expired' in UI
- [ ] Xero sync unaffected; no regressions on invoices

## Push
SOLO mode — stop before push. Write reports/sprint-S27-report.md. Founder verifies, then pushes.
