# Aria OS — Prompt 11: AI Invoice Builder
ONE task, ONE commit, ONE push.

## STEP 0 — SYNC FIRST
```
pwd   # must be C:\Users\kansa\aria-saas-audit
git status   # must be clean
git pull origin main
```
Confirm Prompt 10 (customer management) is deployed and green first.

## STEP 1 — READ BEFORE WRITING
Read the customer management page from Prompt 10 and how customers rows are
used. Read the existing email AND SMS sending code (winback / review-request
features use it — reuse that pipeline, do not build a new sender). Read how
PDFs are generated or stored elsewhere in the repo. Read the businesses row
fields (abn, gst_registered, legal_name, trading_name, address, city —
needed on the invoice). Read how aria_ai_calls is written. Do NOT write code
before reading.

## CONTEXT — DB ALREADY BUILT, do not create/alter tables
billable_services: id, business_id, name, description, unit_price (numeric,
ex-GST dollars), gst_applicable (bool), recurring (bool), active, timestamps.

invoices: id, business_id, customer_id, invoice_number, status
('draft'|'sent'|'paid'|'overdue'|'cancelled'), bill_to_name, bill_to_email,
bill_to_address, subtotal, gst_total, total, currency (default 'AUD'), notes,
issue_date, due_date, sent_at, paid_at, send_method, pdf_url, ai_generated,
timestamps. unique(business_id, invoice_number).

invoice_line_items: id, invoice_id, business_id, service_id, description,
quantity, unit_price, gst_applicable, line_subtotal, line_gst, line_total,
position.

invoice_settings: business_id (PK), next_invoice_seq, invoice_prefix
(default 'INV-'), default_due_days (14), default_notes, payment_details.

## STEP 2 — BILLABLE SERVICES
At /dashboard/invoices add a "Services" tab or section: add, edit, deactivate
billable_services (name, description, unit_price ex-GST, gst_applicable
toggle, recurring toggle). This is the catalogue owners pick lines from.

## STEP 3 — INVOICE BUILDER UI
New sidebar entry "Invoices". At /dashboard/invoices:
- Invoice list (number, customer name, total, status, due date), filterable
  by status.
- "New invoice" opens the builder:
  - Pick a customer from the customers table.
  - Add line items: either pick from billable_services or type a custom line.
    Each line: description, quantity, unit_price, gst_applicable.
  - DETERMINISTIC MATHS — always in code, never via AI:
      line_subtotal = quantity * unit_price
      line_gst = gst_applicable ? Math.round(line_subtotal * 0.10 * 100) / 100 : 0
      line_total = line_subtotal + line_gst
      invoice.subtotal = sum(line_subtotal)
      invoice.gst_total = sum(line_gst)
      invoice.total = subtotal + gst_total
    Always use (Number(x)||0).toFixed(2) for display.
  - Save as draft: insert invoices + invoice_line_items rows. Assign
    invoice_number from invoice_settings (prefix + next_invoice_seq
    zero-padded to 4 digits e.g. INV-0001), then atomically increment
    next_invoice_seq. Upsert invoice_settings if it doesn't exist yet.

## STEP 4 — AI DRAFTING (the moat)
A "Draft with Aria" option in the builder. The owner types plain language
(e.g. "March monthly swim lessons for the Patel family, 2 children, $85
each"). An API route /api/invoices/draft-ai sends that text + the business's
active billable_services list + the chosen customer to Claude
(claude-sonnet-4-5-20250929), which returns STRICT JSON:
{ lines: [{ description, quantity, unit_price, gst_applicable }] }

Parse safely (strip code fences). Pre-fill the builder with those lines for
the owner to review and edit — NEVER auto-save or auto-send. Set
invoices.ai_generated=true. Log the AI call to aria_ai_calls
(feature='invoice_draft'). The maths is always recomputed in deterministic
code after the owner confirms — AI only proposes lines, never computes totals.

## STEP 5 — GST-COMPLIANT TAX INVOICE PDF
Generate a PDF tax invoice. Use the storage/blob pattern already in the repo.
Required elements (ATO tax invoice requirements):
- The words "Tax Invoice" prominently (or "Invoice" if gst_registered=false)
- Seller: legal_name (or trading_name), ABN, address
- Invoice number and issue date
- Each line item: description, quantity, unit price, line total
- Subtotal (ex-GST), GST total shown separately, grand total
- Due date and payment_details from invoice_settings
- Buyer identity (bill_to_name)
- If businesses.gst_registered is false: label "Invoice" not "Tax Invoice",
  show no GST column

Generate the PDF server-side. Store it (reuse the existing blob/storage
pattern for the pdf_url). Save invoices.pdf_url.

## STEP 6 — SEND + STATUS
"Send" action: generate the PDF if not already done, then send via the
EXISTING email/SMS pipeline with the PDF attached or linked. On send:
invoices.status='sent', sent_at=now(), send_method set.
"Mark paid": invoices.status='paid', paid_at=now().
Overdue display: an invoice past due_date that is still 'sent' should
display as overdue in the list (compute on read — no separate cron needed
for v1).

## STEP 7 — AI PAYMENT REMINDERS
For an overdue invoice, an "Draft reminder with Aria" option: Claude writes
a polite payment-reminder message referencing the invoice number, amount owed,
and due date. Show it to the owner to approve, then send via the existing
pipeline. Log to aria_ai_calls (feature='invoice_reminder').
NEVER auto-send a reminder without explicit owner approval.

## AI RULES
- AI drafts line items and reminder wording only
- All money maths, GST, invoice numbering and the PDF are deterministic code
- Every AI call logs to aria_ai_calls with model + token counts
- Never let Claude compute totals or GST — that is always code

## UI RULES (locked)
- Financial Trust palette: #2D5240 forest, #7FB897 sage
- Fraunces italic headings, Inter body
- No backtick template literals inside className={...} or style={{}}
- 'use client' line 1 where needed
- All amounts stored and displayed as dollars (numeric). (Number(x)||0).toFixed(2)

## STEP 8 — BUILD GATE
npx tsc --noEmit, then npm run build. Both must pass. Fix only TS/build
errors. ONE commit, ONE push.

Commit message:
feat(invoices): AI Invoice Builder — billable services, Aria-drafted invoices from plain language, GST-correct tax-invoice PDF, send via existing email/SMS, status tracking, AI payment reminders
