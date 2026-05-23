# Aria OS — Audit Pass D: Security + Data Integrity — Fix Without Removing Features
ONE task, ONE commit, ONE push. Run AFTER Pass C is green.

## CORE RULE — UPGRADE ONLY
Security fixes add protection. They never remove features.
- NEVER remove a route, endpoint, or feature to fix a security problem
- Add auth checks additively — the route still works, it just now requires auth
- Fix amount units by correcting the storage/calculation, not by removing the feature
- RLS fixes add scoping, they don't remove data access that should legitimately exist
- The goal: every feature still works, but now works securely

## STEP 0 — SYNC
```
pwd   # must be C:\Users\kansa\aria-saas-audit
git status   # must be clean
git pull origin main
```

## STEP 1 — AUDIT FIRST, REPORT BEFORE FIXING
Read and check each area. Write a findings report first.

1. CRON AUTH — scan all files under src/app/api/cron/. Every GET handler must check:
   authorization header === `Bearer ${process.env.CRON_SECRET}`. List any that skip this.

2. POS STUBS — scan src/app/api/pos/ for any route that:
   - Does not call createServerSupabaseClient or equivalent
   - Does not verify the requesting user owns the business before reading/writing data
   List every unauthenticated route.

3. SQUARE SYNC — src/app/api/integrations/square/ routes. Do they verify the requesting
   user owns the business before syncing? Can any authenticated user trigger a sync
   for any business? List the gap if it exists.

4. AMOUNTS — scan src/app/api/pos/sale/ and src/app/api/pos/sales/.
   All amounts must be stored as dollars (numeric), NOT cents.
   Find any * 100 or / 100 that suggests wrong units.

5. served_by FIELD — in pos_sales inserts/updates, served_by must be stored as text
   (staff name string), not a UUID. Find any insert that stores a UUID there.

6. RLS GAPS — find routes that use supabaseAdmin on a table that should be user-scoped
   but then don't filter by business ownership. List them.

7. ACCESS_STATUS GUARD — in src/app/dashboard/layout.tsx, confirm the access_status
   check redirects pending_review/rejected users to the holding screen.

## STEP 2 — FIX IN PRIORITY ORDER
These are real security holes — fix all of them:
1. Unauthenticated POS routes → add Supabase auth + business ownership check. Route still works, just now authenticated.
2. Cron routes missing CRON_SECRET → add the auth header check at the top of the GET handler.
3. Square sync missing ownership check → add: confirm the business belongs to the requesting user before syncing.
4. Wrong amount units → fix to dollars. Correct the calculation, not remove the feature.
5. served_by storing UUID → fix to store the staff member's name string.
6. RLS gaps → add explicit ownership filter where supabaseAdmin bypasses RLS.
7. Missing access_status guard → add it additively to the dashboard layout.

## STEP 3 — BUILD GATE
npx tsc --noEmit + npm run build. Both pass. ONE commit, ONE push.
Commit: fix(security): Phase 1 security audit — add cron auth, POS route authentication, Square sync ownership check, fix amount units, served_by type, RLS ownership gaps; all features preserved
