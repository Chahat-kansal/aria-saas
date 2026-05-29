# Prompt 108 — Xero Sync: Complete the Review-First Flow

Xero is connected (OAuth tokens stored in businesses table). The sync route exists but review-first flow is partial.

## Pre-flight
```
git pull origin main
npx tsc --noEmit
npm run build
```
Read ALL existing files under src/app/api/pos/xero-sync/ and src/app/api/integrations/xero/ before writing anything.

## What "review-first" means
Owner sees a preview of what will be synced to Xero BEFORE anything is sent.
They approve or reject each item. Only approved items sync.

## TASK 1 — Daily sync preparation (preview generation)
Create/update src/app/api/pos/xero-sync/prepare/route.ts
POST: { business_id, date }
- Pull all pos_sales for the date (status != 'voided')
- Group by payment_method
- Prepare Xero journal entry structure:
  - Sales account (revenue)
  - GST liability
  - Cash/card clearing accounts
- Store preview in xero_sync_previews table (id, business_id, date, status='pending', payload jsonb, created_at)
- Return preview with line items for owner review
Commit: "feat(xero): daily sync preparation — generate preview before pushing"

## TASK 2 — Approval + push
Create src/app/api/pos/xero-sync/approve/route.ts
POST: { preview_id, approved_items[] }
- Validate preview exists + belongs to business
- Push approved items to Xero API (POST /api.xero.com/api.xro/2.0/Journals)
- Handle Xero OAuth token refresh if expired (use businesses.xero_refresh_token)
- Update preview: status='synced', synced_at=now()
- Log to aria_autopilot_actions
Commit: "feat(xero): push approved items to Xero API with token refresh"

## TASK 3 — Xero sync dashboard UI
Update the Xero section in /dashboard/integrations or create /dashboard/xero:
- Connection status (connected / token expired / not connected)
- "Sync today's sales" button → calls prepare → shows review modal
- Review modal: table of line items with amounts, approve/reject toggles, "Push to Xero" button
- Sync history: date | items synced | status | synced_at
- "Reconnect Xero" button if token expired
Commit: "feat(xero/dashboard): review-first sync UI — preview, approve, history"

## TASK 4 — Auto-sync cron option
Add to businesses table (or settings): xero_auto_sync boolean (default false).
If enabled: daily cron auto-prepares AND auto-approves (no review) and pushes.
Owner can enable in settings: "Auto-sync to Xero daily (no review)"
Commit: "feat(xero): optional auto-sync mode for hands-off accounting"

## DB tables needed
xero_sync_previews: id, business_id, date, status (pending/approved/synced/failed), payload (jsonb), synced_at, created_at
Create via migration.

## Rules
- Xero OAuth: access_token in businesses.xero_access_token, refresh in xero_refresh_token, tenant in xero_tenant_id
- All amounts dollars not cents in DB; Xero API expects amounts as decimals — pass as-is
- npx tsc --noEmit + npm run build before each commit
