# Prompt 57 — Xero Integration: Review-First Sync (Owner Approves Before Data Leaves Aria)

## Why this exists
The current `src/app/api/cron/xero-sync/route.ts` pushes data to Xero silently and automatically every day.
This is dangerous — sync errors, wrong GST, duplicate invoices could corrupt the owner's books and cause ATO issues.
The correct design: Aria prepares the sync package daily, owner reviews it, owner approves, THEN it sends.
This is also better than Xero's own bank feeds which sync silently.

## Core design principle
**NEVER push to Xero without explicit owner approval in the Aria dashboard.**
Aria is a read-prepare layer. Owner is the send gate. Always.

## Pre-edit checklist (MANDATORY — read ALL before writing one line)
1. `cat src/app/api/cron/xero-sync/route.ts` — full read (4KB — currently auto-pushes)
2. `cat src/app/dashboard/integrations/page.tsx` — full read
3. `cat src/app/api/integrations/xero/` — list and read all files
4. Check DB via Supabase MCP: `businesses` table — xero columns (xero_access_token, xero_refresh_token, xero_tenant_id, xero_connected)
5. Check DB: does `xero_sync_queue` or `xero_sync_history` table exist?
6. Check vercel.json — what schedule is xero-sync cron on?

## What to build

### 1. DB tables for review-first sync
```sql
CREATE TABLE IF NOT EXISTS xero_sync_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id),
  sync_date date NOT NULL,
  status text DEFAULT 'pending_review' CHECK (status IN ('pending_review','approved','sent','skipped','failed')),
  line_items jsonb NOT NULL, -- array of {description, quantity, unit_amount, account_code, tax_type}
  total_sales numeric,
  total_gst numeric,
  total_refunds numeric,
  payment_breakdown jsonb, -- {cash: X, card: Y, other: Z}
  prepared_at timestamptz DEFAULT now(),
  reviewed_at timestamptz,
  sent_at timestamptz,
  xero_invoice_id text,
  error_message text,
  notes text -- owner can add notes before approving
);

CREATE TABLE IF NOT EXISTS xero_sync_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id),
  sync_date date,
  total_sales numeric,
  total_gst numeric,
  xero_invoice_id text,
  sent_at timestamptz DEFAULT now(),
  sent_by text DEFAULT 'owner'
);
```

### 2. Rewrite xero-sync cron — PREPARE ONLY, never push
Current cron: calls `pushToXero()` directly.
New cron: ONLY prepares the sync package and saves to `xero_sync_queue` with status=`pending_review`.
Does NOT call Xero API at all.
After preparing: creates `aria_actions` record: "Your Xero sync for [date] is ready to review — $X sales, $Y GST"
Also sends SMS to `businesses.owner_phone` if `alert_sms_enabled`: "Aria: Your Xero sync for [date] is ready. Review at ariaos.site/dashboard/integrations"

Cron schedule: keep existing schedule (daily).

### 3. Build Xero review UI in integrations page
New section in `src/app/dashboard/integrations/page.tsx` under the Xero connection card:

**"Pending Xero Sync" card** — shows when status=`pending_review`:
- Header: "Xero sync ready for [date] — review before sending"
- Line items table:
  | Description | Amount | GST |
  |-------------|--------|-----|
  | Sales — Cash | $1,240.00 | $112.73 |
  | Sales — Card/EFTPOS | $2,180.00 | $198.18 |
  | Refunds | -$45.00 | -$4.09 |
  | **Total** | **$3,375.00** | **$306.82** |
- Payment breakdown: Cash $1,240 | Card $2,180
- Notes field: owner can add a note (e.g. "Includes catering event")
- Two buttons:
  - **"Send to Xero →"** (green) — calls `/api/integrations/xero/approve-sync`
  - **"Skip today"** (grey) — marks as skipped, no data sent

**"Sync History" table** below — last 30 days:
| Date | Sales | GST | Status | Sent at |
|------|-------|-----|--------|---------|
| May 26 | $3,375 | $306 | ✅ Sent | 9:14am |
| May 25 | $2,100 | $190 | ⏭ Skipped | — |
| May 24 | $4,200 | $381 | ✅ Sent | 8:52am |

### 4. Build approve-sync route
`src/app/api/integrations/xero/approve-sync/route.ts` — POST

```ts
// Auth check — must be the business owner
// Get sync queue item by id
// Verify status = pending_review
// Verify business owns this queue item
// Call pushToXero() with the prepared line_items
// On success: update status=sent, sent_at=now(), xero_invoice_id=response.id
// Insert into xero_sync_history
// Return { ok: true, xero_invoice_id }
// On failure: update status=failed, error_message=error
// Return { error: message }
```

Keep the existing `pushToXero()` function logic from the current cron — just move it here.
Refresh token if 401, same as current logic.

### 5. Build skip-sync route
`src/app/api/integrations/xero/skip-sync/route.ts` — POST
Updates queue item status to `skipped`. No Xero API call. Returns `{ ok: true }`.

### 6. Safety rules (enforce in code)
- `approve-sync` route: check `status === 'pending_review'` before sending — prevent double-send
- `approve-sync` route: check business owns the queue item via auth — prevent cross-business access
- Never expose `xero_access_token` or `xero_refresh_token` to frontend — server-side only
- All Xero API calls: append-only — only POST new invoices, never PUT/DELETE existing records
- Log every Xero API call result in `xero_sync_history`

### 7. Xero connection status card upgrade
In integrations page, Xero card should show:
- Connected ✅ / Not connected ⚪
- Last sync: [date] — $X sent
- Pending review: [count] items
- "Disconnect" button
- "View in Xero" link → opens their Xero dashboard
- If not connected: "Connect Xero" → OAuth flow

### 8. OAuth connect flow (if not already built)
Check `src/app/api/integrations/xero/connect/route.ts` — if empty, build it:
- Redirect to Xero OAuth: `https://login.xero.com/identity/connect/authorize`
- Params: client_id, redirect_uri, scope=accounting.transactions accounting.settings, response_type=code
- Callback at `/api/integrations/xero/callback`: exchange code for tokens, store in businesses table
- Show success state in integrations page

## Design
- Pending sync card: amber left border (review needed), green on approval
- Line items table: clean, monospace numbers, GST column
- History table: green ✅ for sent, grey ⏭ for skipped, red ❌ for failed
- "Send to Xero" button: large, green (#7FB897), Fraunces italic label
- Warning text below button: "This will create an invoice in your Xero account. This cannot be undone."

## Quality bar
Owner must feel 100% in control. Every piece of data that goes to Xero must be explicitly approved by them. No surprises.

## Execution order
1. Run DB migrations via Supabase MCP
2. Read ALL pre-edit files fully
3. Rewrite xero-sync cron — remove pushToXero(), replace with queue preparation only
4. Build approve-sync route
5. Build skip-sync route
6. Build/fix OAuth connect + callback if empty
7. Upgrade integrations page with review UI + history table
8. `npx tsc --noEmit` — zero errors
9. `npm run build` — must pass
10. `git add -A && git commit -m "feat: xero — review-first sync, owner approves before data sent, sync history, OAuth connect" && git push`
