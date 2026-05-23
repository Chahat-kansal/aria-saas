# Aria OS — Audit Pass B: Broken + Incomplete Features
ONE task, ONE commit, ONE push. Run AFTER Pass A is green.

## CORE RULE — UPGRADE ONLY
This pass fixes things that are broken. It does not simplify, remove, or reduce anything.
- NEVER remove a feature, route, AI capability, or UI element
- NEVER replace a real implementation with a simpler one
- NEVER remove error handling, logging, or AI context
- If a feature is partially built → complete it, do not gut it
- If a route returns fake data → wire it to real data, do not delete it
- The goal is: everything that should work, works. Nothing that works gets touched.

## STEP 0 — SYNC
```
pwd   # must be C:\Users\kansa\aria-saas-audit
git status   # must be clean
git pull origin main
```

## STEP 1 — AUDIT FIRST, REPORT BEFORE FIXING
Read and check each area below. Write a findings report — what works, what's broken,
what's a stub. Only start fixing after you have reported back.

1. src/app/dashboard/website-chat/ — does it fully work? Missing imports, broken queries, missing types?
2. src/app/api/onboarding/ — are routes step/submit/review all complete and wired correctly?
3. src/app/onboarding/ — all pages present and functional (wizard, review, holding, provisioning)?
4. src/app/api/pos/parcel-tracking/ — is 17TRACK v2.2 consistent across route, cron, and webhook?
5. src/app/api/studio/generate-video/ — is the Blob re-upload complete? Is the poll handler solid?
6. src/app/api/cron/ — scan all cron routes: broken imports? Wrong table names? Wrong model IDs? Missing CRON_SECRET auth?
7. src/lib/aria/ — any broken imports, circular dependencies, or dead exports?
8. src/app/dashboard/layout.tsx — is the access_status guard present and correct?
9. src/app/auth/callback/route.ts — does it redirect new users to /onboarding?
10. Scan the whole repo for TODO, FIXME, placeholder, or stub comments — list every one.

## STEP 2 — FIX IN PRIORITY ORDER
Fix only what is genuinely broken. In order:
1. Broken imports / missing files that cause runtime crashes → fix the import or create the missing piece
2. Wrong table or column names causing silent DB failures → fix to the correct name
3. Routes returning hardcoded fake data instead of real DB queries → wire to real data, do not simplify
4. Missing auth checks on sensitive routes → add Supabase auth + business ownership check
5. TODOs that represent genuinely broken functionality → implement properly, not stub
6. Incomplete features → complete them to the same quality level as the rest of the app

For each fix: read the full file, understand the intent, fix precisely. Never gut a feature.

## STEP 3 — BUILD GATE
npx tsc --noEmit + npm run build. Both pass. ONE commit, ONE push.
Commit: fix(features): repair broken and incomplete features — broken imports, wrong table names, stub routes wired to real data, missing auth, completed TODOs; nothing removed or simplified
