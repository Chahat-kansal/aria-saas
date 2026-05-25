# Aria OS — Prompt 30: Xero Integration — Push Sales to Xero
Post-launch feature. ONE task, ONE commit, ONE push.

## MANDATORY PRE-EDIT CHECKLIST

```
1. pwd → must print C:\Users\kansa\aria-saas-audit — STOP if wrong
2. git pull origin main
3. Read every file listed in STEP 1 IN FULL before writing anything
4. npx tsc --noEmit — ZERO errors before touching anything
5. npm run build — must succeed before touching anything
```

---

## STEP 1 — READ BEFORE WRITING

Read in full:
- `src/app/pos/setup/integrations/` directory
- `src/app/api/square/` — understand OAuth integration pattern
- businesses table columns — check what xero_* columns exist (or need migration)

DB MIGRATION (if xero columns missing):
```sql
alter table businesses
  add column if not exists xero_access_token text,
  add column if not exists xero_refresh_token text,
  add column if not exists xero_tenant_id text,
  add column if not exists xero_connected_at timestamptz;
```

---

## STEP 2 — XERO OAUTH

Set these env vars in Vercel: XERO_CLIENT_ID, XERO_CLIENT_SECRET, XERO_REDIRECT_URI

### src/app/api/xero/connect/route.ts
GET: redirect to Xero OAuth URL
```
https://login.xero.com/identity/connect/authorize?
  response_type=code&client_id=...&redirect_uri=...&
  scope=accounting.transactions accounting.contacts offline_access&
  state=<business_id>
```

### src/app/api/xero/callback/route.ts
GET: exchange code for tokens, store in businesses, redirect to /pos/setup/integrations?xero=connected

### src/app/api/xero/disconnect/route.ts
POST: clear xero_* columns in businesses

---

## STEP 3 — DAILY SYNC CRON

### src/app/api/cron/xero-sync/route.ts
Cron: `0 2 * * *`

For each business with xero_access_token:
1. Fetch pos_sales from yesterday
2. Group by category, sum totals
3. POST to Xero API: create invoice with line items
4. Handle token refresh if 401 response

Add to vercel.json crons.

---

## STEP 4 — INTEGRATIONS PAGE

Add Xero card to integrations page:
- Connected: show "Connected", last sync date, Disconnect button
- Disconnected: "Connect Xero" button → /api/xero/connect

## CRITICAL RULES

- DB amounts stored as DOLLARS (numeric), never cents
- Model IDs: claude-haiku-4-5-20251001 / claude-sonnet-4-5-20250929 / gemini-2.5-flash-preview-05-20
- Build gate: npx tsc --noEmit + npm run build must pass before commit
- Single commit for the entire task
- vercel.json: never add sub-daily crons
- Never touch: AnimatedBg, FlyToCart, CursorGlow, pos-sfx.ts, aria-voice-guide.ts
- (Number(x)||0).toFixed(2) for all numeric display

## COMMIT

```
git add -A
git commit -m "feat(...): description"
git push origin main
```

npx tsc --noEmit and npm run build must pass. Then push.
