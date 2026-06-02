# Prompt 213 — Wholesale Orders + Auto-Invoice + Anonymised Aria Marketing

Build the full wholesale order management feature exactly as specified in the approved
mockup. No deviation from layout, no skipping fields, no simplifying the invoice.
Read CLAUDE.md first.

Competitor benchmark: Cin7 wholesale, Xero invoicing, MYOB AdvancedRetail. Match 80%+
of their wholesale module — but with Aria's intelligence layer on top.

## Pre-flight (MANDATORY)
```
git pull origin main
npx tsc --noEmit
npm run build
```
Read every existing file before editing. One commit per task. After every commit:
`git push origin main`, then confirm `git log origin/main..HEAD` is empty.
State "Build verified green, all commits pushed." before finishing.

## UPGRADE-ONLY RULE
Never remove, stub, or downgrade any existing feature. Build on top of the existing
invoices table, customers table, pos_products table — do NOT duplicate them.

## ARIA INTELLIGENCE RULE
Every wholesale order writes to aria_ai_calls + feeds into buildAskAriaContext +
significant actions log to aria_autopilot_actions. Model: claude-haiku-4-5-20251001
unless task explicitly requires sonnet.

## DESIGN SYSTEM (locked — use Aria's actual palette, NOT mockup colors)
- Background: #0E1411 (page), rgba(255,255,255,0.03) (cards), rgba(255,255,255,0.05) (raised)
- Accent: #7FB897 (sage), #2D5240 (forest)
- Borders: rgba(255,255,255,0.08) (default), rgba(127,184,151,0.18) (active)
- Text: #fff (primary), rgba(255,255,255,0.6) (secondary), rgba(255,255,255,0.35) (tertiary)
- Status: #f87171 (danger), #fbbf24 (warning), #7FB897 (success), #85b7eb (info)
- Fonts: Cormorant (display/serif italic for letterhead + totals), Outfit (body),
  JetBrains Mono (SKUs, codes, monospace numbers)
- Border radius: 8px (small), 12px (medium), 16px (cards)
- Icons: Lucide React (NOT Tabler — that was mockup only) — Package, Sparkles,
  History, ClipboardList, Search, Plus, Minus, Check, X, Mail, FileText, CreditCard,
  Building, Clock, Calendar, MapPin

## RESPONSIVE BREAKPOINTS (mandatory)
- Mobile <768px: single column stacked, cart becomes bottom-sheet drawer triggered
  by a sticky FAB ("View cart · 3 items · $834")
- Tablet 768–1023px: 2-column with narrower product picker (60/40 split)
- Desktop ≥1024px: 2-column 60/40, cart sticky on scroll, max-width 1280px container

## DB SCHEMA (migrations via Supabase MCP — apply_migration)

### Migration 1: `create_wholesale_orders`
```sql
CREATE TABLE wholesale_orders (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references businesses(id) on delete cascade not null,
  order_number text not null,
  customer_id uuid references customers(id) on delete restrict,
  status text not null default 'draft', -- draft | confirmed | invoiced | sent | partial | paid | cancelled
  source text not null default 'inventory_pick', -- inventory_pick | reorder | aria_suggested | pasted_email
  po_ref text,
  delivery_date date,
  delivery_address text,
  delivery_notes text,
  payment_terms text default 'Net 14',
  subtotal numeric(12,2) default 0,
  discount_total numeric(12,2) default 0,
  freight numeric(12,2) default 0,
  gst_total numeric(12,2) default 0,
  total numeric(12,2) default 0,
  notes text,
  invoice_id uuid references invoices(id) on delete set null,
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  confirmed_at timestamptz,
  sent_at timestamptz,
  cancelled_at timestamptz,
  cancelled_reason text
);
CREATE INDEX wholesale_orders_business_status_idx ON wholesale_orders (business_id, status, created_at DESC);
CREATE INDEX wholesale_orders_customer_idx ON wholesale_orders (customer_id, created_at DESC);
ALTER TABLE wholesale_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_own_wholesale_orders" ON wholesale_orders
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
```

### Migration 2: `create_wholesale_order_items`
```sql
CREATE TABLE wholesale_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references wholesale_orders(id) on delete cascade not null,
  product_id uuid references pos_products(id) on delete restrict,
  sku text,
  name text not null,
  description text,
  quantity numeric(10,3) not null,
  unit_price numeric(12,2) not null, -- wholesale unit price (excl GST)
  retail_price numeric(12,2), -- reference only
  discount_pct numeric(5,2) default 0,
  discount_amount numeric(12,2) default 0,
  line_total numeric(12,2) not null, -- after discount, excl GST
  gst_amount numeric(12,2) default 0,
  position integer default 0
);
CREATE INDEX wholesale_order_items_order_idx ON wholesale_order_items (order_id);
ALTER TABLE wholesale_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_own_wholesale_order_items" ON wholesale_order_items
  FOR ALL USING (
    order_id IN (SELECT id FROM wholesale_orders WHERE business_id IN
      (SELECT id FROM businesses WHERE user_id = auth.uid()))
  );
```

### Migration 3: `extend_customers_wholesale`
```sql
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS customer_type text DEFAULT 'retail',
  ADD COLUMN IF NOT EXISTS business_name text,
  ADD COLUMN IF NOT EXISTS abn text,
  ADD COLUMN IF NOT EXISTS wholesale_tier integer DEFAULT 0, -- 0=none, 1=tier1 5%, 2=tier2 8%, 3=tier3 12%
  ADD COLUMN IF NOT EXISTS wholesale_discount_pct numeric(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shipping_address text,
  ADD COLUMN IF NOT EXISTS billing_address text,
  ADD COLUMN IF NOT EXISTS payment_terms_default text DEFAULT 'Net 14';
```

### Migration 4: `wholesale_order_number_sequence`
```sql
CREATE SEQUENCE IF NOT EXISTS wholesale_order_seq START 318;
CREATE OR REPLACE FUNCTION generate_wholesale_order_number() RETURNS text AS $$
BEGIN
  RETURN 'WHL-' || LPAD(nextval('wholesale_order_seq')::text, 5, '0');
END;
$$ LANGUAGE plpgsql;
```

---

## TASK 1 — Core API routes
Commit: "feat(wholesale): core API routes — list, create, update, items management"

Files:
- `src/app/api/wholesale/orders/route.ts` — GET (list with filters: status, customer_id, date_from, date_to, search, page, limit) + POST (create draft order with customer_id)
- `src/app/api/wholesale/orders/[id]/route.ts` — GET (full detail with items + customer), PATCH (update meta — po_ref, delivery_date, notes, status), DELETE (cancel only — soft delete)
- `src/app/api/wholesale/orders/[id]/items/route.ts` — POST (add item with auto-priced wholesale unit_price based on customer tier), DELETE (remove item)
- `src/app/api/wholesale/orders/[id]/items/[itemId]/route.ts` — PATCH (update qty, unit_price override, discount_pct)
- `src/app/api/wholesale/orders/[id]/totals/route.ts` — POST: recalculate subtotal, discount, gst, total from items. Apply customer wholesale_discount_pct on top of per-line discounts. Update wholesale_orders row.

Wholesale price logic:
1. Start with `pos_products.cost_price` or `pos_products.wholesale_price` if present
2. If `customer.wholesale_tier > 0`, apply tier discount on retail_price as fallback
3. Tier 1 = retail × 0.85, Tier 2 = retail × 0.78, Tier 3 = retail × 0.70
4. Owner can override per-line `unit_price` in the UI

All routes:
- Verify ownership via business_id
- Use supabaseAdmin (service role) for writes after auth check
- Log all confirmations to aria_autopilot_actions

## TASK 2 — Creation method APIs
Commit: "feat(wholesale): 4 creation methods — reorder, aria-suggest, paste-email, inventory-pick"

Files:
- `src/app/api/wholesale/orders/from-last/route.ts` — POST {customer_id}: find customer's last confirmed order, duplicate items into a new draft order
- `src/app/api/wholesale/orders/aria-suggest/route.ts` — POST {customer_id}: analyse customer's last 6 orders, detect pattern (frequency, common items, avg qty), return suggested order. If customer has clear pattern (3+ same orders) → return populated cart; else return empty + "no clear pattern". Model: haiku.
- `src/app/api/wholesale/orders/from-email/route.ts` — POST {text|file, customer_id}: AI parses pasted text or uploaded PDF/image for product names + quantities. Fuzzy-match against pos_products. Return matched items + unmatched lines for owner to review. Vision model for images: haiku.
- The 4th method (inventory_pick) uses the standard POST /orders + POST /items flow — no special endpoint.

Each method writes to aria_ai_calls with the method type.

## TASK 3 — Invoice generation (MATCH MOCKUP EXACTLY)
Commit: "feat(wholesale): invoice generation matching approved mockup — letterhead, line items, totals, payment block"

File: `src/app/api/wholesale/orders/[id]/generate-invoice/route.ts`

When called, this:
1. Builds the invoice record in the existing `invoices` table (DO NOT create a parallel invoice table — re-use existing infrastructure from prompt 105)
2. Creates invoice_line_items linked to wholesale_order_items
3. Generates the PDF (see PDF template below)
4. Uploads PDF to Supabase Storage bucket `invoices`
5. Links wholesale_orders.invoice_id ← invoices.id
6. Returns {invoice_id, pdf_url, public_view_token}

### PDF template (MATCH MOCKUP — every section, every field)

Use @sparticuz/chromium + puppeteer-core (serverless-safe). HTML template structure:

**Letterhead block (top, full width):**
- Left: logo (40×40px rounded sage-tinted badge with business initial in Cormorant italic), business name in 17px Outfit 500, then 11px tertiary: "ABN xxx · ACN xxx", address line, "email · phone · website"
- Right: "TAX INVOICE" 10px tracked uppercase tertiary, then invoice number in 18px Outfit 500, then status pill ("Awaiting payment" / "Paid" / "Overdue")
- 0.5px border bottom

**Three-column meta grid (Bill to / Ship to / Details):**
- "BILL TO": customer business_name (13px 500), then ABN, attn name, billing_address, email
- "SHIP TO": shipping_address (or same as billing if not set), delivery_notes
- "DETAILS": 11px table — Issued, Due, Terms, PO ref, Order ID
- 0.5px borders top + bottom

**Line items table:**
Columns: SKU (mono, 11px tertiary) | Description (with sub-line for variant info in 10px tertiary) | Qty | Unit price | Discount (— if 0, else green % e.g. "5%") | Line total
Header row: 10px uppercase tracked tertiary, 400 weight
Body rows: 12px, 0.5px border between rows, 10px padding
Right-align numbers

**Totals block (right-aligned, 220px wide):**
- Subtotal (excl. GST)
- Discount (green, with minus sign if > 0)
- Freight
- GST (10%)
- Total inc. GST — bold 14px with 0.5px border top
- Amount due (highlighted warning-bg pill, 11px label + 14px amount)

**Notes section (left of totals):**
- Custom notes from wholesale_orders.notes
- 11px secondary, line-height 1.6

**Payment block (full width, 3-column grid, secondary bg, 14px padding):**
- "BANK TRANSFER": BSB, Account, Reference (use invoice number)
- "PAY ONLINE": Card/PayID — secure link via invoice public view token
- "TERMS": Payment terms + late fee notice + retention of title clause

**Footer:**
- Left: "Thank you for your order — questions: {business email}"
- Right: "Generated by Aria · ariaos.site" (10px tertiary with subtle sparkles icon)

PDF page: A4, 20mm margins, Outfit body font, Cormorant for letterhead initial + total amount.

## TASK 4 — Send invoice email
Commit: "feat(wholesale): send invoice via SendGrid with branded HTML + PDF attachment"

File: `src/app/api/wholesale/orders/[id]/send/route.ts`

POST: triggers SendGrid send to customer.email
- Subject: `Invoice {invoice_number} from {business_name} — Due {due_date}`
- HTML body: branded template matching Aria's voice (warm but professional), summary table of items, total amount due, big "View invoice & pay" button linking to public view URL
- Attachments: PDF
- Updates wholesale_orders.sent_at + status='sent'
- Updates invoices.sent_at
- Logs to aria_autopilot_actions {action_type: 'wholesale_invoice_sent'}

## TASK 5 — Wholesale orders dashboard (overview page)
Commit: "feat(wholesale/dashboard): overview page with stats + orders list + create CTA"

File: `src/app/dashboard/wholesale/page.tsx`

EXACT layout from mockup 1:

**Header bar (sticky):**
- Left: page title "Wholesale orders" (24px Cormorant italic), then 13px secondary subtitle "Sell from inventory to bulk customers — invoice + email + Aria learning, all automatic"
- Right: "+ New order" button (sage bg, dark text, 13px 500)

**Stats row (4 metric cards, equal width, 12px gap):**
- "This month": revenue from wholesale_orders.total WHERE created_at >= start of month
- "Active accounts": COUNT(DISTINCT customer_id) WHERE created_at last 90 days
- "Outstanding": SUM(total) WHERE status IN ('sent','partial') AND paid=false
- "Avg order": AVG(total) all time

Each card: rgba(255,255,255,0.03) bg, 16px radius, 16px padding, 13px secondary label above 22px 500 value.

**Orders table (below stats):**
Columns: Order # | Customer | Status badge | Items | Total | Created | Actions (•••)
- Status badge colours: draft=neutral, confirmed=info, sent=warning, paid=success, cancelled=danger
- Row click → opens order detail at `/dashboard/wholesale/[id]`
- Filters above table: status tabs (All / Draft / Sent / Paid / Overdue), search by customer name, date range picker
- Pagination: 20 per page

**Aria intelligence panel (right rail, desktop only, 280px wide):**
- "What Aria notices" card — pulls top 4 insights from order pattern detection
- "What Aria does next" card — pulls top 4 suggested actions
- Generated-post preview card with Post-to-community / Adapt-for-Instagram / Adapt-for-Facebook / Rewrite buttons (post text MUST be anonymised — see TASK 8)

Empty state: clean illustration + "No wholesale orders yet. Create your first one." + "+ New order" CTA.

## TASK 6 — Create order page (Step 1: Customer + Items — MATCH MOCKUP EXACTLY)
Commit: "feat(wholesale/dashboard): create flow step 1 — customer + items picker + cart"

File: `src/app/dashboard/wholesale/new/page.tsx`

EXACT layout from mockup 3:

**Top bar (sticky, 12px vertical padding, 0.5px border-bottom):**
- Left: ← arrow + breadcrumb "Wholesale orders → New order"
- Right: 3-step indicator pills — "1. Customer + items" (active, sage bg), "2. Review" (neutral), "3. Invoice + send" (neutral)

**Customer block (raised card, 14px padding, 14px gap below):**
- Top row: 40×40 avatar circle (sage-tinted bg, initials, 13px 500), customer business_name (14px 500), email + ABN below in 11px secondary, right side: wholesale tier badge (sage pill) + stats line "12 orders · avg $847 · last 14d ago"
- 0.5px divider
- 3-column meta grid: PO reference input, Delivery date input, Payment terms input — each with 10px uppercase tracked label

**Aria pre-fill suggestion (conditional — only shows if customer has 3+ orders with same items):**
- Sage-tinted bg card, 10px padding, flex row
- Sparkles icon + "This customer ordered the same N items every cycle for X months. Pre-fill from last order?"
- "Yes, pre-fill" button (sage) + "Pick manually" button (outline)

**Two-column layout (60/40 split on desktop, stack on mobile):**

LEFT (product picker, raised card, 12px padding):
- Search input with search icon left-inset, placeholder "Search inventory by name, SKU or barcode…"
- Category chips row: All / Coffee / Milk / Bakery / Tea / Syrups / + dynamic categories from pos_products.category
- Active category chip: sage bg + sage text + 0.5px sage border
- 0.5px border-top above product list
- Product rows: 36×36 category icon + name (13px 500) + "In cart · {qty}" pill if in cart + SKU (mono 11px tertiary) + on-hand count (warning colour if low) + retail/wholesale prices stacked right + add/check button
- Hover: rgba(255,255,255,0.03) bg
- 0.5px border between rows
- Infinite scroll loaded in batches of 30

RIGHT (cart, sticky on desktop with top: 80px, raised card, 12px padding):
- Header: "ORDER CART" 10px uppercase + "N items" neutral pill
- Cart items: each row has product name (12px 500), then qty controls row — minus btn (22×22) + qty number + plus btn + "× $XX.XX" tertiary + line total right-aligned
- If volume discount applied: "−X% volume discount applied" 10px success below the qty row
- 0.5px border between items
- Totals block: Subtotal / Discount (green) / GST / Total (13px 500 with top border)
- Notes textarea: "Notes on invoice" label + 2-row textarea
- "Review order →" primary button (sage bg, full width, 10px padding, 13px 500)
- "Save as draft" outline button (full width, 8px padding, 12px)

**Mobile behaviour (<768px):**
- Cart becomes a sticky bottom-sheet drawer with a FAB trigger ("View cart · 3 items · $834")
- Tapping FAB slides up the cart; tapping outside closes it
- "Review order →" button at bottom of the drawer

**Tablet (768–1023px):**
- 2-column 60/40 but tighter margins
- Cart still sticky but narrower

## TASK 7 — Create order page (Step 2: Review)
Commit: "feat(wholesale/dashboard): create flow step 2 — review screen with invoice preview"

File: `src/app/dashboard/wholesale/new/review/page.tsx` (or use query param `?step=2`)

Shows the actual invoice rendered in-browser (NOT just summary — full invoice mockup from TASK 3).
Buttons at bottom:
- "← Back to edit" (outline)
- "Generate invoice + send →" (sage primary, full width on mobile)
- "Save as draft" (outline)

Final confirmation modal before sending: "This will email the invoice to {customer.email} and deduct stock from inventory. Continue?"

## TASK 8 — Aria intelligence + ANONYMISED post drafting
Commit: "feat(wholesale/aria): pattern detection + anonymous social post drafting with privacy guardrail"

File: `src/app/api/wholesale/aria-intelligence/route.ts`

GET {business_id}: returns
```json
{
  "notices": ["string", ...],   // What Aria observed
  "actions": ["string", ...],   // Suggested next steps
  "draft_post": {
    "community": "string",
    "instagram": "string",
    "facebook": "string"
  }
}
```

System prompt for the post drafter — INCLUDE EXACTLY:

> You are drafting a social media post for a small business that just shipped a wholesale order.
> ABSOLUTE PRIVACY RULES — non-negotiable:
> - NEVER mention the buyer's business name, person's name, suburb, city, street, or any
>   identifying detail. This is for public posts — the buyer has not consented to being named.
> - You MAY mention: the product, the quantity in generic terms ("a chunky order"),
>   your craft, your wholesale program, your contact details, hashtags.
> - You MUST anonymise any reference to where it's going. Use "one of our wholesale partners"
>   or "a Melbourne venue" (at most — never narrower than city) or just omit the destination.
> - If your draft mentions a specific business or person, regenerate. Internal data goes
>   in dashboards and invoices, not public posts.
>
> Australian English. Warm tone. Match the platform (Aria community = casual community vibe,
> Instagram = lifestyle/visual hook, Facebook = slightly more formal).

This system prompt MUST be added to `src/lib/aria-system-prompt.ts` as an exported constant
`WHOLESALE_POST_PRIVACY_RULES` so other Aria features can reuse it.

Add a validator in the API route that scans the AI output for:
- Customer business_name (exact match) → regenerate
- Customer person name (from contact field) → regenerate
- Customer suburb (if in customer.shipping_address) → regenerate
- ABN → regenerate

If any match found, regenerate up to 2 times then return a generic fallback.

## TASK 9 — Feed into Aria's daily briefing + business brain
Commit: "feat(wholesale/aria): wholesale stats feed into briefing context + business brain"

Update `src/lib/aria/business-brain.ts` (or wherever buildAskAriaContext lives) to include:
- Total wholesale revenue this month
- Top 3 wholesale customers by revenue (anonymised in any external output)
- Outstanding wholesale receivables
- Reorder reminders: customers who haven't ordered in > avg cycle days
- Wholesale-vs-retail margin comparison

Add a daily check: customers due for reorder → write a notification to aria_notifications
{type: 'wholesale_reorder_due', business_id, message: "X customer is due to reorder soon"}.
Internal notifications CAN name the customer (this is the owner's own dashboard, not public).

## TASK 10 — Order detail page (with invoice)
Commit: "feat(wholesale/dashboard): order detail with embedded invoice + actions"

File: `src/app/dashboard/wholesale/[id]/page.tsx`

Sections:
- Order header: order number, status badge, customer block (compact), created date
- Action row: "Send invoice" / "Mark paid" / "Duplicate" / "Cancel" / "Download PDF"
- Embedded invoice preview (full mockup 2 layout)
- Activity log: "Created by you · 2 hours ago", "Invoice sent · 1 hour ago", "Customer viewed · 12 min ago"
- Linked Aria intelligence: "Customers like this also order X — suggest add-on?"

## Privacy guardrail (CRITICAL — never violate)
The system prompt addition from TASK 8 is the law:
- Owner-facing dashboards CAN show customer names + details (it's their data)
- Internal Aria notifications CAN reference specific customers
- Invoice PDFs CAN show full customer details (it's the customer's own invoice)
- Email to customer CAN show full customer details (it's addressed to them)
- ANY external post (Aria community, Instagram, Facebook, Twitter) MUST be anonymised
- Validator must run on every external-post draft before display

## ACCEPTANCE CRITERIA
Before marking complete:
- [ ] All 4 creation methods working end-to-end
- [ ] Invoice PDF generated matches mockup exactly — every section, every field
- [ ] Customer receives email with PDF attachment
- [ ] Invoice appears in existing /dashboard/invoices list
- [ ] Stock is deducted from pos_products on confirm
- [ ] Aria pattern detection running — anonymised posts generated and validated
- [ ] Wholesale tier pricing auto-applied at line-item level
- [ ] Volume discount per line item working
- [ ] Mobile <768px: cart becomes bottom-sheet drawer, all flows usable
- [ ] Tablet 768-1023px: 60/40 split with narrower margins
- [ ] Desktop ≥1024px: cart sticky on scroll, max-width 1280px
- [ ] `npx tsc --noEmit` passes
- [ ] `npm run build` passes
- [ ] All commits pushed (git log origin/main..HEAD empty)
- [ ] Privacy validator catches and regenerates any post that mentions customer details

## WHAT NOT TO DO
- Do NOT create a parallel invoice table — use the existing invoices + invoice_line_items
- Do NOT change the existing customers table beyond the columns specified
- Do NOT add new cron entries (already at 39 — at the limit) — use existing daily cron for reorder reminders
- Do NOT use the mockup's light theme colors — translate to Aria's dark theme (palette above)
- Do NOT use Tabler icons — use Lucide React (the rest of the codebase)
- Do NOT skip the privacy validator on social posts
- Do NOT mention buyer in any public-facing output
