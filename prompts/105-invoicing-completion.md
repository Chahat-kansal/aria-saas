# Prompt 105 — Invoicing: Complete the Feature

Invoice tables exist. Some UI exists. Make it category-leading vs FreshBooks/Xero invoicing.

## Pre-flight
```
git pull origin main
npx tsc --noEmit  
npm run build
```
Read ALL existing files under src/app/dashboard/invoices/ and src/app/api/pos/invoices/ before writing anything.

## DB columns (already exist)
invoices: id, business_id, customer_id, invoice_number, status, bill_to_name, bill_to_email, bill_to_address, subtotal, gst_total, total, currency, notes, issue_date, due_date, sent_at, paid_at, send_method, pdf_url, ai_generated, created_at, updated_at, viewed_at, auto_reminders
invoice_line_items: id, invoice_id, description, quantity, unit_price, tax_rate, line_total

## TASK 1 — PDF generation (serverless-safe)
If /api/pos/invoices/[id]/pdf route does not exist or uses full puppeteer:
Use @sparticuz/chromium + puppeteer-core (same fix as prompt 99 Task 3).
PDF template: Aria OS branded, business logo (businesses.logo_url), ABN, line items table, GST breakdown, payment details, due date.
Store PDF URL in invoices.pdf_url (upload to Vercel Blob or Supabase Storage).
Commit: "feat(invoices): serverless PDF generation with brand template"

## TASK 2 — Send invoice
POST /api/pos/invoices/[id]/send:
- Generate PDF if pdf_url empty
- If send_method='email': SendGrid with PDF attachment, subject "Invoice {invoice_number} from {business_name}"
- If send_method='sms': Twilio with short link (use existing public invoice view route or create one)
- Update: sent_at=now(), status='sent'
- Set auto_reminders=true by default (owner can toggle off)
Commit: "feat(invoices): send via email/SMS with PDF attachment"

## TASK 3 — Auto reminders cron
Add to existing daily cron (do NOT add a new cron entry — merge into cron/daily or similar):
- Find invoices where status='sent' AND due_date <= now()+3days AND auto_reminders=true AND paid_at IS NULL
- Send reminder via same channel as original send
- Find invoices where due_date < now() AND status != 'paid' AND status != 'voided'
- Update status='overdue'
- Send overdue notice
Commit: "feat(invoices/cron): auto reminders 3 days before due + overdue marking"

## TASK 4 — Public invoice view
Create src/app/invoice/[token]/page.tsx (public, no auth):
- Show invoice details, line items, totals, due date
- "Mark as paid" button (for cash/bank transfer — owner confirms separately)
- Track viewed_at on first load
- Clean, professional layout — customer-facing
Commit: "feat(invoices): public invoice view page with view tracking"

## TASK 5 — Dashboard completeness
Audit src/app/dashboard/invoices/ — ensure:
- Invoice list: number | customer | amount | status badge | due date | actions
- Status tabs: All / Draft / Sent / Overdue / Paid
- Create invoice: customer picker (from customers table), line item builder, due date, notes, send method
- Invoice detail: PDF preview, send button, mark paid, void, duplicate
- Stats bar: total outstanding, overdue amount, paid this month
- Xero sync button per invoice (if xero connected)
Commit: "feat(invoices/dashboard): complete invoicing UI — create, send, track, remind"

## Rules
- GST = 10% (Australian standard) — pre-fill tax_rate as 10
- Amounts in dollars (numeric) not cents
- npx tsc --noEmit + npm run build before each commit
