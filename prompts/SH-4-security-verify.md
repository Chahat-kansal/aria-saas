# SH-4 — Security Hardening Verify
STATUS: READY | MODE: SOLO
Baseline: Session 6 (28 bugs fixed) + Prompt 203 (race conditions fixed)
Goal: Confirm no new security regressions since the last sweep; verify the 10 check classes.

---

## RULE 0 — UPGRADE ONLY
Protected files (never touch): AnimatedBg, FlyToCart, CursorGlow, pos-sfx.ts, aria-voice-guide.ts

## Pre-flight
See RUNNER-PROTOCOL.md Pre-flight protocol steps 1–9.

## CONSTRAINT CATALOGUE
FIRST ACTION: run live SQL to check RLS status on key tables.

```sql
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'businesses','pos_sales','pos_products','staff_members',
    'aria_actions','aria_daily_briefings','pos_customers',
    'pos_timesheets','pos_sale_items','invoices','quotes',
    'aria_agent_actions','aria_autopilot_actions'
  )
ORDER BY tablename;
-- Alert if ANY table has rowsecurity = false
```

Fill in results here.

## Sprint scope

### Check 1 — RLS / anon-key (re-verify session 6 fixes)
For each file fixed in Session 6: confirm supabaseAdmin is still used (no regression to anon client).
Key files to check:
- src/app/api/cron/generate-briefings/route.ts ✅ (confirm still uses supabaseAdmin)
- src/app/api/cron/rfm-daily/route.ts
- src/app/api/cron/run-scheduled-reorders/route.ts
- src/lib/aria/ask/action-executor.ts, action-planner.ts, action-rollback.ts

### Check 2 — New routes since Prompt 203
Find all route files created or modified after 2026-06-02 (session 6 + Prompt 203 baseline):
```bash
git log --since="2026-06-02" --name-only --pretty=format: | grep "route.ts" | sort -u
```
For each new/modified route:
- Does it have ownership check (business_id scoped to authenticated user)?
- Does it use supabaseAdmin only for server-side reads, not for user-specific writes?
- Does it check `error` from every Supabase destructure?

### Check 3 — Missing awaits on mutations (since Prompt 203)
Find any new unawaited insert/update/delete/upsert calls added since 2026-06-02.
```bash
git log --since="2026-06-02" -p | grep "^\+" | grep "\.insert\|\.update\|\.delete\|\.upsert" | grep -v "^++"
```
Verify all are either awaited or wrapped in `waitUntil()`.

### Check 4 — waitUntil coverage
Confirm @vercel/functions waitUntil is used for all fire-and-forget patterns.
```bash
grep -r "void (async" src/app/api/ --include="*.ts"
```
Must return zero results. If any found: wrap in waitUntil.

### Check 5 — Business ownership in new routes
For every new POST/PATCH/DELETE route added since 2026-06-02:
- Confirm it reads `business_id` from the authenticated user, not from the request body alone
- Pattern: `const { data: business } = await supabase.from('businesses').select('id').eq('id', businessId).eq('user_id', user.id).maybeSingle()`

### Check 6 — Cross-business leak check
Spot-check 5 random existing API routes that accept a `businessId` param:
Confirm they verify ownership before returning data.

### Check 7 — Cron sub-daily audit
```bash
cat vercel.json | python3 -c "
import json,sys
v=json.load(sys.stdin)
for c in v.get('crons',[]):
  parts=c['schedule'].split()
  if len(parts)==5 and '*/' in parts[1]:
    print('SUB-DAILY:', c)
"
```
Alert if any cron is sub-hourly. Verify hourly crons (aria-intelligence, price-schedules, timed-prices) are intentionally hourly and discuss with founder if any should move to daily.

### Check 8 — Vercel function count
```bash
python3 -c "
import json
v=json.load(open('vercel.json'))
funcs=v.get('functions',{})
print(f'Function configs: {len(funcs)} (max 22)')
if len(funcs)>22: print('OVER LIMIT')
"
```

### Check 9 — External API error handling
Find all `fetch(` calls in src/app/api/ that do NOT check `res.ok` before using the response body.
```bash
grep -rn "await fetch(" src/app/api/ | grep -v "if.*res.ok\|res.ok" | head -20
```
Review each; add `if (!res.ok) { throw new Error(...) }` where missing.

### Check 10 — .single() vs .maybeSingle()
```bash
grep -rn "\.single()" src/app/api/ --include="*.ts" | grep -v "test\|spec"
```
For each result: is it guaranteed to return exactly one row? If not → change to .maybeSingle() + null check.

## Aria Intelligence Rule
- No new AI calls in this sprint
- If any security fix touches aria_ai_calls or aria_actions: confirm dedup/ownership is preserved

## Build gate
```
npx tsc --noEmit && npm run build
```

## Founder verify checklist (10 min max)
- [ ] Log into a different account; try to access business data from the first account → must get 404/403
- [ ] RLS check query above: all key tables show rowsecurity = true
- [ ] No `void (async` patterns in src/app/api/
- [ ] Vercel function count ≤ 22
- [ ] Cron count in vercel.json ≤ current count (no new crons added)
- [ ] reports/sprint-SH-4-report.md documents all check results

## Push
SOLO mode — stop before push. Write reports/sprint-SH-4-report.md with all 10 check results.
Founder reviews report, then pushes.
