# Sprint S06 — Invoice Builder
**Date:** 2026-06-11
**Status:** AWAITING-VERIFY
**Build gate:** ✅ `npx tsc --noEmit` → 0 errors | `npm run build` → PASS

---

## What was implemented

### Gap 1 — Recurring invoices
- **`src/app/api/cron/invoices-recurring/route.ts`** (NEW) — daily cron at `0 9 * * *`
  - Queries `recurring_invoices` WHERE `is_active=true` AND `next_due_date <= today`
  - For each: fetches base invoice + line items, clones into new invoice with today's issue_date
  - Generates fresh `signature_token` per cloned invoice
  - Sends email via Resend (with HTML invoice body and public link)
  - Advances `next_due_date` by frequency (weekly/monthly/quarterly)
  - Uses existing `invoice_settings.next_invoice_seq` for sequential invoice numbers
- **`vercel.json`** — added `invoices-recurring` cron entry (53 crons total, function configs unchanged at 9)
- No DB migration needed — `recurring_invoices` table already existed

### Gap 2 — E-signature
- **DB migration (applied):** `invoices` now has `signature_token TEXT UNIQUE`, `signed_at TIMESTAMPTZ`, `signed_by_name TEXT`
- **`src/app/api/invoices/send/route.ts`** — generates `crypto.randomUUID()` as `signature_token` on first send (idempotent: skip if already set)
- **`src/app/api/invoices/public/[id]/route.ts`** — returns `signature_token`, `signed_at`, `signed_by_name` in public GET
- **`src/app/api/invoices/public/[id]/sign/route.ts`** (NEW) — public POST endpoint
  - Validates token matches invoice, full name ≥ 2 chars
  - Idempotent (returns `already_signed: true` if already signed)
  - Sets `signed_at` + `signed_by_name` on success
  - Calls `markBriefingStale` after signing
- **`src/app/invoice/[id]/page.tsx`** — e-signature UI block added
  - Shows below "Mark as paid" only when `signature_token` exists AND `!signed_at` AND `!isPaid`
  - Checkbox + full name input + "Sign Invoice" button
  - Disabled until both agreed + name ≥ 2 chars
  - After success: shows "Invoice signed by [name] on [date]" confirmation panel

### Gap 3 — Overdue escalation
- **`src/app/api/cron/mark-overdue/route.ts`** — enhanced with:
  - 7-day final notice: queries `status='overdue'` AND `due_date <= 7 days ago` AND `auto_reminders=true`
  - Dedup guard via `invoice_reminders` table (`trigger_type='7d_final'`)
  - On first final notice: inserts to `invoice_reminders`, then calls `upsertAriaAction` (category=revenue, priority=high)
  - Returns `seven_day_final_notices_sent` count in response

---

## Aria Intelligence Rule
- `upsertAriaAction` called for each 7d+ overdue invoice → appears in Aria recommendations panel as `category='revenue'`, `priority='high'`
- Source tagged as `'cron/mark-overdue'` with full payload for traceability
- `markBriefingStale` called on signature so next briefing reflects signed invoice state

---

## Vercel constraint check
- Function configs: 9 (limit 22) ✅
- Cron entries: 53 ✅ (all daily `"0 X * * *"` or weekly — no sub-daily)

---

## Files changed
| File | Change |
|---|---|
| `src/app/api/cron/invoices-recurring/route.ts` | NEW |
| `src/app/api/invoices/public/[id]/sign/route.ts` | NEW |
| `src/app/api/invoices/send/route.ts` | + signature_token generation on send |
| `src/app/api/invoices/public/[id]/route.ts` | + signature fields in select |
| `src/app/api/cron/mark-overdue/route.ts` | + 7d final notice + upsertAriaAction |
| `src/app/invoice/[id]/page.tsx` | + e-signature UI block |
| `vercel.json` | + invoices-recurring cron |
| `prompts/S06-invoice-builder.md` | CONSTRAINT CATALOGUE filled, status → AWAITING-VERIFY |
| `prompts/MANIFEST.md` | S06 → AWAITING-VERIFY |

---

## Founder verify checklist

- [ ] **Send an invoice** → inspect DB: `invoices.signature_token` is now populated (UUID)
- [ ] **Open public invoice URL** (`/invoice/[id]`) → e-signature block appears at bottom (checkbox + name input + "Sign Invoice" button)
- [ ] **Sign the invoice** → enter full name, tick checkbox, click "Sign Invoice" → confirmation panel shows "Invoice signed by [name] on [date]"
- [ ] **Confirm in DB**: `invoices.signed_at` and `invoices.signed_by_name` are populated
- [ ] **Recurring invoice**: create an invoice, add a `recurring_invoices` row via Supabase with `next_due_date = today`, `is_active = true` — then hit `/api/cron/invoices-recurring` with `Authorization: Bearer [CRON_SECRET]` → response shows `processed_count: 1`, new invoice appears in `/invoices`, `next_due_date` advanced by frequency
- [ ] **7-day overdue escalation**: set an invoice to `status='overdue'` with `due_date = 8 days ago` and `auto_reminders=true` → trigger `/api/cron/mark-overdue` → `seven_day_final_notices_sent` incremented, row in `invoice_reminders` with `trigger_type='7d_final'`, row in `aria_actions` with `category='revenue'` + `priority='high'`
- [ ] **Re-run overdue cron** → `seven_day_final_notices_sent = 0` (idempotent — `invoice_reminders` guard working)
- [ ] **Xero sync still works** (no regressions: new columns are nullable, existing invoice flow unchanged)
- [ ] `/invoices` page loads, no JS errors

---

## Not in scope (already exists)
- Invoice draft/create UI — existing
- PDF generation — existing (send route)
- 3-day advance reminder — existing
- Overdue flip cron — existing

---

## Push instruction
```
git add -A
git commit -m "feat(invoices-S06): recurring invoices cron, e-signature flow, 7d overdue escalation + aria actions"
git push origin main
```
