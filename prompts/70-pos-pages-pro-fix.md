# Prompt 70 — POS Pages: Fix Every Broken/Thin Page to Pro Level + AI

## Scope
20 POS pages — every one rebuilt to professional standard with AI features where it adds value.
This is a LARGE prompt. Build in PHASES. After each phase: npx tsc --noEmit + mental build check.
If limit/context runs low: finish the current phase cleanly and STOP. Never leave build broken.

## Global rules
- Financial Trust palette: deep forest green #2D5240, sage #7FB897, bg #0d0d14
- Fraunces italic for headings/totals, Inter for body
- Every page must feel as polished as Square/Lightspeed equivalent
- All AI calls use Haiku (claude-haiku-4-5-20251001), log to aria_ai_calls
- str_replace / additive — never break working pages
- All amounts in dollars, pos_sales uses status != 'voided', served_by is text

## Pre-edit checklist (MANDATORY before each page)
Before touching ANY page: read it fully, read its API route, check the DB table columns via Supabase MCP.
Never edit a file you have not read in this session.

---

## PHASE 1 — Critical empty/stub pages (do these first)

### 1.1 — /products/new (currently 1KB stub)
Full professional add-product page. Read /products/[id] (27KB) to match its style.
Fields: name, category, price, cost price, barcode, SKU, stock quantity, reorder point,
supplier, tax code, description, image upload, product type (simple/variant).
If variant type: variant builder (from prompt 61 — sizes/packs with prices).
**AI feature:** "Aria suggest" button next to description — Haiku writes a product description
from the name + category. Also AI category suggestion — type product name, Aria suggests the category.
On save: POST /api/pos/products. Redirect to the new product page.
Margin display: live calc as price + cost entered, traffic-light (green >40%, amber 20-40%, red <20%).

### 1.2 — /sales-history/[id] (currently 0KB empty)
Full sale detail page. Read /history (29KB) for style.
Show: sale number, date/time, staff (served_by), customer (if attached), payment method,
all line items (product, qty, unit price, line total), subtotal, GST, discount, total.
Actions: print receipt, email receipt, refund this sale, void.
**AI feature:** "Aria insight" card — Haiku analyses this sale: "This was a high-value sale.
Customer also bought X — consider a follow-up." Or for refunds: pattern note.
Show payment breakdown if split payment.

### 1.3 — /settings/general (currently 0KB empty)
Full general POS settings page. Read /settings (11KB) for style.
Sections: business name, ABN, address, phone, email, timezone, currency (AUD),
receipt footer text, default tax rate, business hours, logo upload.
**AI feature:** none needed — pure settings.
Save to businesses table + pos settings.

### 1.4 — /settings/registers (currently 0KB empty)
Full register management. Read /outlets (13KB) for style.
List all registers (pos_registers table). Add/edit/delete register.
Each register: name, outlet assignment, default float amount, receipt printer assignment, active status.
**AI feature:** none — config page.

---

## PHASE 2 — Empty utility/migration pages

### 2.1 — /parcel-tracking (0KB) — POS-side
Build proper parcel tracking matching the dashboard version.
Read src/app/dashboard/parcel-tracking/page.tsx and mirror it for POS context.
17Track integration, carrier auto-detect, status timeline.

### 2.2 — /utilities/barcodes (0KB)
Barcode generation utility. Select products → generate printable barcodes (Code128 SVG).
Bulk select by category. Print sheet layout.
**AI feature:** none — utility.

### 2.3 — /setup/migrate/square (0KB)
Square migration page. Read /setup/migrate/shopfront (13KB) for the pattern.
CSV upload of Square product/customer export → column mapping → import.
**AI feature:** Haiku column auto-mapping — reads CSV headers, maps to Aria fields.

---

## PHASE 3 — Thin pages that genuinely matter — rebuild to pro level

### 3.1 — /products/[id]/edit (3KB)
Full product edit — mirror /products/new (1.1) but pre-filled.
All same fields + variant editing + AI description regenerate.

### 3.2 — /invoices (4KB) — POS invoices
Full invoice list + create. Read dashboard invoices for pattern.
List invoices, status (draft/sent/paid), create new, GST-correct PDF, send email/SMS.
**AI feature:** Aria drafts invoice line descriptions from short input.

### 3.3 — /settings/payments (4KB)
Full payment config. Payment methods accepted (cash/card/eftpos/split/gift card),
surcharge rules per method, rounding rules, tipping config.
**AI feature:** none — config.

### 3.4 — /settings/loyalty (4KB) — POS loyalty settings
Full loyalty config matching dashboard loyalty (from prompt 50).
Points per dollar, redemption rate, tiers, expiry. Link to tier management.
**AI feature:** Aria suggests optimal points rate based on average ticket size.

---

## PHASE 4 — Thin pages — upgrade to pro (not "fine as is" — all pro)

### 4.1 — /settings/tax (3KB)
Full tax config — GST settings, tax codes, tax-free items, tax holidays link.
Clean professional layout.

### 4.2 — /settings/vendors (4KB)
Full vendor/supplier directory. Add/edit vendors, contact details, payment terms,
ordering method (email/portal/phone). Link to purchase orders.
**AI feature:** none.

### 4.3 — /settings/aria-controls (4KB)
Pro Aria control panel. Toggle each AI feature on/off, set AI aggressiveness
(Conservative/Balanced/Aggressive), view AI usage + cost this month from aria_ai_calls.
**AI feature:** this IS the AI control page — make it comprehensive.

### 4.4 — /reports/cashier (4KB)
Full cashier performance report. Per staff: sales count, revenue, avg ticket,
voids, refunds, hours worked, revenue per hour.
**AI feature:** Aria performance summary per cashier — Haiku.

### 4.5 — /reports/purchases (4KB)
Full purchases report. Purchase orders by supplier, total spend, by category,
spend trend chart (recharts).
**AI feature:** Aria spend insight — "Spend on X up 30% — review."

### 4.6 — /reports/transfers (3KB)
Full stock transfer report. Transfers between outlets, in/out per outlet,
transfer history with status.

### 4.7 — /utilities/mail-log (3KB)
Full email log — every email sent (receipts, invoices, campaigns), status,
recipient, timestamp, resend button.

### 4.8 — /utilities/trash (3KB)
Full trash/recycle view — soft-deleted items, restore capability, permanent delete
(with confirmation). Read deletion_audit_log.

### 4.9 — /kds/[station] (4KB)
Full kitchen display station view. Orders for this station, bump/recall,
prep timers, order age colour coding. Read /kitchen (13KB) for pattern.

### 4.10 — /reports (4KB) — reports landing
Pro reports hub — cards linking to every report with a mini preview metric on each.

### 4.11 — /media (2KB)
Full media library — uploaded product images, logos, marketing assets.
Grid view, upload, delete, search.

### 4.12 — /price-tickets (2KB) — landing
Pro price ticket hub — links to everyday + promotional ticket generators with preview.

### 4.13 — /products/[id]/transfer-history (3KB)
Full transfer history for a product — every stock movement between outlets,
date, qty, from/to, who actioned.

### 4.14 — /promotions/attribution (3KB)
Full promotion attribution — which promos drove sales, revenue attributed per promo,
redemption count, ROI per promotion.
**AI feature:** Aria promo insight — "Promo X had best ROI — repeat it."

### 4.15 — /setup/migrate/lightspeed (1KB)
Lightspeed migration — mirror the Square migration (2.3). CSV import + AI column mapping.

---

## Execution — STRICT phase order
1. Read pre-edit files for Phase 1, build all of Phase 1, npx tsc --noEmit, mental build check
2. Commit Phase 1: "feat: POS — products/new, sale detail, general + register settings (pro + AI)"
3. Repeat for Phase 2 → commit
4. Repeat for Phase 3 → commit
5. Repeat for Phase 4 → commit
6. Each phase is its own commit so nothing is lost if limit runs out
7. npm run build must pass at end of EACH phase

## If limit runs low
Finish the current phase, commit it, STOP. Report which phases remain.
4 clean commits beats 1 broken everything.
