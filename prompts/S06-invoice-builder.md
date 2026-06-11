# S06 — Invoice Builder
STATUS: AWAITING-VERIFY | MODE: SOLO
Covers: prompts/11-invoice-builder.md, 35-invoices-pro-upgrade.md
Missing pieces: scheduled/recurring invoices, e-signature flow, overdue auto-reminder escalation

---

## RULE 0 — UPGRADE ONLY
Every change must ONLY upgrade, improve, or add. Never downgrade, remove, stub, or weaken.
Protected files (never touch): AnimatedBg, FlyToCart, CursorGlow, pos-sfx.ts, aria-voice-guide.ts

## Pre-flight
See RUNNER-PROTOCOL.md Pre-flight protocol steps 1–9.
Key tables to sibling-check: `%invoice%`, `%quote%`

## CONSTRAINT CATALOGUE
Filled from live SQL run at execution time (2026-06-11).

### invoices (key columns)
| column | type | nullable | notes |
|---|---|---|---|
| id | uuid | NO | PK |
| business_id | uuid | NO | FK → businesses |
| customer_id | uuid | YES | FK → pos_customers |
| invoice_number | text | NO | |
| status | text | NO | CHECK: draft/sent/overdue/paid/voided |
| bill_to_name | text | NO | |
| bill_to_email | text | YES | |
| bill_to_address | text | YES | |
| bill_to_phone | text | YES | |
| notes | text | YES | |
| issue_date | date | YES | |
| due_date | date | YES | |
| subtotal | numeric | YES | |
| gst_total | numeric | YES | |
| total | numeric | YES | |
| currency | text | YES | default 'AUD' |
| send_method | text | YES | email/sms |
| sent_at | timestamptz | YES | |
| paid_at | timestamptz | YES | |
| viewed_at | timestamptz | YES | |
| pdf_url | text | YES | |
| auto_reminders | boolean | YES | default true |
| ai_generated | boolean | YES | |
| signature_token | text | YES | UNIQUE — added by S06 migration |
| signed_at | timestamptz | YES | added by S06 migration |
| signed_by_name | text | YES | added by S06 migration |
| created_at | timestamptz | YES | |
| updated_at | timestamptz | YES | |

### recurring_invoices (sibling table — used instead of adding to invoices)
| column | type | nullable |
|---|---|---|
| id | uuid | NO |
| business_id | uuid | NO |
| base_invoice_id | uuid | NO |
| frequency | text | NO | CHECK: weekly/monthly/quarterly |
| next_due_date | date | NO |
| is_active | boolean | NO | default true |
| created_at | timestamptz | YES |

### invoice_reminders
| column | type | nullable |
|---|---|---|
| id | uuid | NO |
| invoice_id | uuid | NO |
| business_id | uuid | NO |
| remind_at | timestamptz | YES |
| trigger_type | text | YES | e.g. '7d_final' |
| sent_at | timestamptz | YES |
| created_at | timestamptz | YES |

## Gap closure scope

### Gap 1 — Recurring / scheduled invoices
- Add `recurrence_rule` (text, nullable) to `invoices` — migration required
- Add `next_send_at` (timestamptz) to `invoices`
- UI: toggle on invoice create/edit: "Repeat this invoice" → frequency picker (weekly/monthly/custom)
- Cron `api/cron/invoices-recurring` (daily, 0 9 * * *) — query invoices WHERE next_send_at <= now(), clone to new invoice, email, update next_send_at
- Verify vercel.json count stays ≤ 22 functions

### Gap 2 — E-signature
- `invoices.signature_token` (text unique, nullable) — migration
- `invoices.signed_at` (timestamptz, nullable)
- `invoices.signed_by_name` (text, nullable)
- Public route `api/public/invoices/[token]/sign` (POST) — verify token, record signature, update status='signed'
- PDF generation includes signature block
- No external e-signature provider needed — self-hosted checkbox + name field meets AU legal requirements for simple service invoices

### Gap 3 — Overdue escalation
- Aria action: when invoice is 7d overdue → `upsertAriaAction` with category='revenue', priority='high'
- Email escalation: 3-day reminder + 7-day final notice (use existing email infrastructure)
- `invoices.last_reminder_sent_at` (timestamptz) — migration

## Aria Intelligence Rule
- Feed overdue invoice total into `aria_daily_briefings` structured context (already done in BRIEF-1? verify)
- Log all invoice-related AI calls (draft generation, reminder copy) to `aria_ai_calls`
- `upsertAriaAction` for overdue invoices → writes to `aria_actions` (recommendations table)

## Build gate
```
npx tsc --noEmit && npm run build
```
Zero errors, zero warnings. Fix errors before committing.

## Founder verify checklist (10 min max)
- [ ] Create invoice → enable "Repeat monthly" → confirm `recurrence_rule` + `next_send_at` saved
- [ ] Send invoice via public link → sign it → confirm `signed_at` populated
- [ ] Create invoice, mark as sent, wait for overdue trigger OR manually set created_at to 8d ago and run cron → confirm aria_action created
- [ ] Xero sync still works (invoice status changes sync correctly)
- [ ] `/invoices` page loads without errors; no regressions on existing invoices

## Push
SOLO mode — stop before push. Write reports/sprint-S06-report.md. Founder verifies, then pushes.
