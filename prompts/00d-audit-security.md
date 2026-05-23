# Aria OS — Audit Pass D: API Security + Data Integrity
ONE task, ONE commit, ONE push. Run AFTER Pass C is green.

## STEP 0 — SYNC
```
pwd   # must be C:\Users\kansa\aria-saas-audit
git status   # must be clean
git pull origin main
```

## STEP 1 — AUDIT FOR SECURITY GAPS
Read and check each of the following. Report findings before fixing.

1. CRON AUTH — scan all files under src/app/api/cron/. Every GET handler
   must check: authorization header === `Bearer ${process.env.CRON_SECRET}`.
   List any cron that skips this check.

2. UNAUTHENTICATED ROUTES — scan all routes under src/app/api/pos/.
   Every route that reads or writes business data must authenticate via Supabase
   (createServerSupabaseClient or equivalent) and confirm the user owns the business.
   List any route that skips auth entirely.

3. SQUARE SYNC OWNERSHIP — src/app/api/integrations/square/ routes.
   Do they verify the requesting user owns the business before syncing?
   Or can any authenticated user trigger a Square sync for any business?

4. AMOUNTS AS DOLLARS — scan src/app/api/pos/sale/ and src/app/api/pos/sales/.
   All amounts must be stored as dollars (numeric), not cents. Find any
   multiplication by 100 or division by 100 that suggests the wrong unit.

5. status != 'voided' — in any query on pos_sales, confirm the filter is
   `status != 'voided'` (not `status = 'completed'` or similar).

6. served_by field — in pos_sales inserts/updates, served_by must be stored
   as text (staff name), not as a UUID. Find any insert that stores a UUID there.

7. RLS BYPASS — find any route that uses supabaseAdmin on a table that has
   RLS but then filters by user_id manually instead of relying on RLS.
   This is a pattern where someone added admin and then forgot to scope it.

## STEP 2 — FIX IN PRIORITY ORDER
These are the Phase 1 security holes that block the soft launch:
1. Unauthenticated POS stub routes — add Supabase auth + business ownership check
2. Cron routes missing CRON_SECRET check — add the auth header check
3. Square sync ownership verification — add the user-owns-business check
4. Wrong amount units — fix to dollars if anything is stored as cents
5. Wrong served_by type — fix to text if anything stores a UUID
6. Any RLS bypass — fix to use proper RLS or add explicit ownership filter

## STEP 3 — BUILD GATE
npx tsc --noEmit + npm run build. Both pass. ONE commit, ONE push.
Commit: fix(security): Phase 1 security audit — cron auth, unauthenticated POS routes, Square sync ownership, amount units, served_by type, RLS gaps
