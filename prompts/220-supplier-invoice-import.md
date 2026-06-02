# Prompt 220 — Supplier Invoice OCR Import (No Integration Required)

Read CLAUDE.md in full first. Read every file listed before touching it.
One commit per task. npx tsc --noEmit + npm run build before every commit.
UPGRADE-ONLY. Amounts in dollars. Model: claude-haiku-4-5-20251001 for AI.

## WHAT EXISTS
pos_suppliers table: id, business_id, name, contact_name, email, phone, etc.
supplier_price_lists: id, business_id, supplier_name, file_name, uploaded_at, item_count
supplier_price_items: id, list_id, business_id, supplier_name, product_name, sku, unit_price, case_price
supplier_product_prices: id, business_id, supplier_id, product_id, cost_price, recorded_at
warehouse_purchase_orders: likely exists — check before creating

NO supplier_invoices table. NO invoice line items. NO OCR import route for invoices.
Check with Supabase MCP what exists before creating anything.

## TASK 1 — DB migrations
Commit: "feat(supplier-invoices): DB migrations — supplier_invoices + line_items tables"

```sql
CREATE TABLE IF NOT EXISTS supplier_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  supplier_id uuid REFERENCES pos_suppliers(id) ON DELETE SET NULL,
  supplier_name text NOT NULL,
  invoice_number text,
  invoice_date date,
  due_date date,
  subtotal numeric DEFAULT 0,
  gst_amount numeric DEFAULT 0,
  total numeric DEFAULT 0,
  status text DEFAULT 'pending' CHECK (status IN ('pending','matched','approved','paid','disputed')),
  source text DEFAULT 'manual' CHECK (source IN ('manual','ocr_pdf','ocr_image','email')),
  file_url text,
  raw_text text, -- OCR extracted text stored for audit
  ai_confidence numeric, -- 0-1 how confident Claude was in extraction
  notes text,
  paid_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE supplier_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_supplier_invoices" ON supplier_invoices
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
CREATE INDEX ON supplier_invoices (business_id, status);
CREATE INDEX ON supplier_invoices (business_id, created_at DESC);

CREATE TABLE IF NOT EXISTS supplier_invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid REFERENCES supplier_invoices(id) ON DELETE CASCADE NOT NULL,
  business_id uuid NOT NULL,
  sku text,
  product_name text NOT NULL,
  description text,
  quantity numeric DEFAULT 1,
  unit_price numeric DEFAULT 0,
  line_total numeric DEFAULT 0,
  gst_applicable boolean DEFAULT true,
  pos_product_id uuid REFERENCES pos_products(id) ON DELETE SET NULL, -- auto-matched
  match_confidence numeric, -- 0-1 how confident the SKU/name match was
  contracted_price numeric, -- from supplier_product_prices if available
  variance_amount numeric, -- unit_price - contracted_price
  variance_pct numeric, -- % difference
  created_at timestamptz DEFAULT now()
);
ALTER TABLE supplier_invoice_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_supplier_invoice_items" ON supplier_invoice_items
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
CREATE INDEX ON supplier_invoice_items (invoice_id);
CREATE INDEX ON supplier_invoice_items (business_id, pos_product_id);
```

## TASK 2 — OCR extraction API route
Commit: "feat(supplier-invoices): Claude vision OCR extraction route"

Create: src/app/api/supplier-invoices/extract/route.ts
export const runtime = 'nodejs'
Method: POST, multipart form
Fields: file (PDF or image), business_id

Steps:
1. Auth check + business ownership verify
2. Upload file to Vercel Blob → get URL
3. Send to Claude (claude-sonnet-4-5-20250929 for accuracy — invoices need precision):
   - PDF: use document block (base64)
   - Image: use image block (base64)
   - Prompt: extract supplier name, invoice number, invoice date, due date, line items (sku, product_name, description, quantity, unit_price, line_total, gst_applicable), subtotal, gst_total, total. Return JSON only, no markdown.
4. Parse JSON response
5. For each line item: attempt to match to pos_products by SKU exact match, then barcode match, then fuzzy name match (>80% similarity). Store pos_product_id + match_confidence.
6. If supplier name matches a pos_suppliers row, link supplier_id.
7. Check each matched product's contracted price from supplier_product_prices. Compute variance_amount + variance_pct.
8. Insert supplier_invoices row + supplier_invoice_items rows
9. Log to aria_ai_calls
10. Return: { invoice_id, invoice, items, unmatched_count, variance_alerts }

Claude prompt for extraction:
"""
Extract all data from this supplier invoice. Return ONLY valid JSON with this exact structure:
{
  "supplier_name": string,
  "invoice_number": string | null,
  "invoice_date": "YYYY-MM-DD" | null,
  "due_date": "YYYY-MM-DD" | null,
  "items": [{ "sku": string | null, "product_name": string, "description": string | null, "quantity": number, "unit_price": number, "line_total": number, "gst_applicable": boolean }],
  "subtotal": number,
  "gst_total": number,
  "total": number,
  "confidence": number (0-1, your confidence in the extraction accuracy)
}
All amounts in dollars. If a field is not found, use null. Do not include any text outside the JSON.
"""

## TASK 3 — CRUD routes
Commit: "feat(supplier-invoices): CRUD API — list, get, update status, delete"

### GET /api/supplier-invoices
List invoices. Params: status, supplier_id, date_from, date_to, limit, offset.
Returns: { invoices, total, stats: { pending_count, pending_total, overdue_count, overdue_total, paid_this_month } }

### GET /api/supplier-invoices/[id]
Returns invoice + all line items + supplier info.

### PATCH /api/supplier-invoices/[id]
Update status (pending→approved→paid), add notes, manually edit fields, link supplier_id.

### DELETE /api/supplier-invoices/[id]
Soft delete (set status='voided'). Hard delete only if status='pending' and owner confirms.

## TASK 4 — Dashboard page
Commit: "feat(supplier-invoices): dashboard page — upload, review, match, approve"

Create: src/app/dashboard/supplier-invoices/page.tsx

Tabs: Inbox | Upload | Matched | Paid

Design: dark theme matching Aria Financial Trust palette.

### Inbox tab (pending + approved, not paid)
Stats row: Pending invoices | Total owed | Overdue | Paid this month
Invoice list: Supplier | Invoice # | Date | Due | Total | Status | Variance alerts | Actions
Click invoice → expands to show line items table:
  - SKU | Product name | Qty | Unit price | Contracted price | Variance | Matched product
  - Green row = matched to POS product
  - Amber row = matched but price variance >5%
  - Red row = no match found (needs manual linking)
  - "Link product" button on unmatched rows → opens product search modal
"Approve" button → PATCH status=approved
"Mark paid" button → PATCH status=paid, paid_at=now()
"Dispute" button → PATCH status=disputed, add note

### Upload tab
Drag + drop zone or file picker. Accepts PDF, JPG, PNG, WEBP.
"Also accepts: forward your supplier emails to invoices@[business].ariaos.site" (placeholder — not building email parsing, just showing the concept)
On upload: POST /api/supplier-invoices/extract → show loading spinner with "Aria is reading your invoice..."
On success: redirect to the invoice detail in Inbox tab
On error: show what Claude couldn't parse, allow manual entry

Manual entry form (fallback): supplier name, invoice number, date, due date, line items (add/remove rows), totals.

### Matched tab
All invoices with status=matched or approved. Shows variance summary at top.

### Paid tab
Paid invoices, filterable by date range. Running total paid per supplier.

## TASK 5 — Variance alerts + Aria intelligence
Commit: "feat(supplier-invoices): variance alerts in profit leaks + Aria briefing context"

1. If any invoice item has abs(variance_pct) > 5%:
   - Create an intelligence_events row: type='supplier_price_variance', severity='high' if >10% else 'medium'
   - title: "{supplier} charged ${variance} more than contracted for {product}"
   - Feed into profit leaks as a pricing_gap leak

2. In buildAskAriaContext add:
   - Pending supplier invoices count + total owed
   - Overdue invoices (due_date < today, status != paid)
   - Any variances detected this week
   Format: "Supplier invoices: {count} pending (${total} owed). {overdue} overdue. {variance_count} price variances detected this week."

## TASK 6 — Sidebar link
Commit: "feat(supplier-invoices): sidebar link"

Add to ALL_ITEMS in Sidebar.tsx:
'supplier-invoices': { href: '/dashboard/supplier-invoices', label: 'Supplier invoices', icon: FileTextIcon, badge: 'AI', section: 'Operations' }

Add to retail, liquor, cafe, restaurant, warehouse industry configs.

## COMPLETION CHECKLIST
- [ ] Both tables created with RLS
- [ ] OCR extraction working for PDF + image
- [ ] Product matching by SKU/barcode/name
- [ ] Contracted price comparison + variance computed
- [ ] Dashboard: all 4 tabs functional
- [ ] Upload → extract → review flow end-to-end
- [ ] Variance alerts fire to intelligence_events
- [ ] Aria briefing context updated
- [ ] Sidebar link present for relevant industries
- [ ] npx tsc --noEmit passes
- [ ] npm run build passes
State "Build verified green, all commits pushed." when done.
