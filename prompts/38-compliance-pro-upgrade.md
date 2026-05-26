# Prompt 38 — Compliance Page Pro Upgrade

## Context
`src/app/dashboard/compliance/page.tsx` is 14KB. Basic checklist with notes.
Must beat Vanta for small business compliance.

## Pre-edit checklist (MANDATORY)
1. Read full: `src/app/dashboard/compliance/page.tsx`
2. Read: `src/app/api/compliance/route.ts`
3. Check DB: `compliance_items` table — all columns
4. Check: does `compliance_items` have `expiry_date`, `document_url` columns?

## Features to add

### 1. Compliance score
Large circular score at top: "87% Compliant"
Calculate: (completed items / total items) × 100
Color: green >80%, amber 60-80%, red <60%
Subtitle: "3 items need attention"

### 2. Industry-specific auto-populated checklist
On first load, if no items exist, auto-seed based on business industry:
- **Liquor store**: RSA certification, Liquor licence display, CCTV operational, Minors policy posted, ID checking policy, ATO BAS lodgement, WorkCover insurance, Public liability insurance
- **Cafe**: Food safety supervisor cert, Council food premises approval, WorkCover, Public liability, Menu allergen display, Fair Work compliance
- **Retail**: WorkCover, Public liability, Fire safety, ATO BAS
Call `/api/compliance?action=seed&industry={industry}` — build this endpoint.

### 3. Expiry calendar
New "Calendar" tab next to "Checklist" tab.
Shows a simple monthly calendar grid.
Items with `expiry_date` show as coloured dots on their expiry date.
Red = overdue, Amber = within 30 days, Green = 30+ days away.
Click date to see which item expires.

### 4. Document upload per item
Each compliance item gets a "Upload document" button.
On click: file input opens, uploads to Vercel Blob storage.
Store URL in `compliance_items.document_url`.
Show "📄 View document" link if document exists.
Use existing Vercel Blob setup (already configured).

### 5. Auto-reminders
When item has `expiry_date`, show reminder toggle.
If ON: store in `compliance_items.reminder_enabled = true`.
Existing `aria-intelligence` cron checks daily for items expiring in 90/60/30 days and creates an `aria_actions` record.
Add this check to `src/lib/aria/intelligence/alerts.ts`.

## DB migrations needed
```sql
ALTER TABLE compliance_items ADD COLUMN IF NOT EXISTS expiry_date date;
ALTER TABLE compliance_items ADD COLUMN IF NOT EXISTS document_url text;
ALTER TABLE compliance_items ADD COLUMN IF NOT EXISTS reminder_enabled boolean DEFAULT false;
ALTER TABLE compliance_items ADD COLUMN IF NOT EXISTS industry text;
```
Run via Supabase MCP.

## Execution
1. Run DB migrations
2. Read all pre-edit files
3. Build all features — no stubs
4. `npx tsc --noEmit` — fix ALL errors
5. `npm run build` — must pass
6. `git add -A && git commit -m "feat: compliance — score, industry checklist, expiry calendar, document upload, auto-reminders" && git push`
