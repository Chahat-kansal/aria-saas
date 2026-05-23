# Aria OS — Audit Pass B: Broken + Incomplete Features
ONE task, ONE commit, ONE push. Run AFTER Pass A is green.

## STEP 0 — SYNC
```
pwd   # must be C:\Users\kansa\aria-saas-audit
git status   # must be clean
git pull origin main
```

## STEP 1 — AUDIT FOR BROKEN FEATURES
Read and check each of these areas. For each, report what works, what's broken,
and what's a stub. Do NOT fix anything yet — audit first, report back.

Check these specifically:
1. src/app/dashboard/website-chat/ — does it fully work? Missing imports, broken queries?
2. src/app/api/onboarding/ — are all routes (step, submit, review) complete and wired?
3. src/app/onboarding/ — all pages present and functional (wizard, review, holding, provisioning)?
4. src/app/api/pos/parcel-tracking/ — is the 17TRACK v2.2 integration consistent across route, cron, webhook?
5. src/app/api/studio/generate-video/ — Veo route: is the Blob re-upload complete and the poll handler solid?
6. src/app/api/cron/ — scan all cron routes: any that import something that doesn't exist? Any that reference wrong table names? Any with hardcoded wrong model IDs?
7. src/lib/aria/ — any broken imports or circular dependencies?
8. src/app/dashboard/layout.tsx — is the access guard (access_status check) present and correct?
9. src/app/auth/callback/route.ts — does it redirect to /onboarding for new users?
10. Any route that has a TODO, FIXME, or placeholder comment — list them all.

## STEP 2 — FIX IN PRIORITY ORDER
Fix only what is genuinely broken (runtime errors, missing imports, wrong table names,
broken API calls, missing required logic). In this order:
1. Broken imports / missing files that would cause runtime crashes
2. Wrong table or column names that would cause silent DB failures
3. Routes that return hardcoded fake data instead of real DB queries
4. Missing required middleware (auth checks) on sensitive routes
5. TODOs that are actually breaking the feature

Do NOT: rewrite working code, change UI, improve things that work, touch locked files.

## STEP 3 — BUILD GATE
npx tsc --noEmit + npm run build. Both pass. ONE commit, ONE push.
Commit: fix(features): repair broken and incomplete feature implementations found in audit
