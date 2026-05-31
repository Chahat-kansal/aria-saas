# Audit Session 6 — Silent Failure & Safety Sweep (END TO END)

The most important audit. Column-name correctness was Sessions 1-5. This session catches
SILENT FAILURES — bugs that return empty/wrong data with no error, and security/deploy risks.

## Pre-flight
```
git pull origin main
```
Read AUDIT_STATE.md for schema + the RLS table list.

## CRITICAL RULE THIS SESSION
After EVERY commit: `git push origin main` then `git log origin/main..HEAD` (must be empty).
Never batch commits without pushing — this is the lesson from the 31-unpushed-commits incident.

---

## CHECK 1 — RLS / anon-key silent empty results (HIGHEST PRIORITY)

### The bug
Server routes that query an RLS-protected table using the ANON key
(createServerSupabaseClient / createServerClient) get back empty [] with NO error.
Looks identical to "no data". Completely silent. This is the #1 silent-failure source.

### How to audit
For every file under src/app/api/:
1. Identify which Supabase client it uses:
   - supabaseAdmin / createClient(url, SERVICE_ROLE_KEY) → bypasses RLS ✓ safe for any table
   - createServerSupabaseClient / anon key → subject to RLS
2. For routes using the anon/server client, check every table queried.
3. If the table has RLS enabled (check the RLS list in AUDIT_STATE.md / Supabase) AND the
   route is doing server-side data fetching (not user-scoped reads that SHOULD respect RLS),
   it must use supabaseAdmin.

### Rule of thumb
- Background/cron/admin/cross-business reads → supabaseAdmin
- User-facing reads that should be limited to the logged-in user → anon client is correct (RLS protects them)
- The bug is using anon client for data that RLS then silently hides

Run this to find candidates:
```bash
grep -rl "createServerSupabaseClient\|createServerClient" src/app/api/ --include="*.ts"
```
For each: verify the tables queried aren't being silently blocked by RLS.

Fix: switch to supabaseAdmin where appropriate. One commit per route fixed.
Commit: "fix(area/route): use supabaseAdmin to avoid silent RLS empty-result on [table]"

---

## CHECK 2 — Unchecked Supabase errors

### The bug
```typescript
const { data, error } = await supabase.from(...).select(...)
// error never checked — if query failed, data is null, code continues silently
return NextResponse.json({ items: data })  // returns null silently
```

### Audit
grep for destructured queries, verify error is handled:
```bash
grep -rn "const { data" src/app/api/ --include="*.ts"
```
For each: is there an `if (error)` check after, OR is error intentionally ignored with a comment?
If error is silently dropped AND the result matters → add error handling.

Fix: add `if (error) { console.error(...); return NextResponse.json({ error: error.message }, { status: 500 }) }`
Commit: "fix(area/route): handle previously-swallowed Supabase error"

---

## CHECK 3 — Missing await on Supabase calls

### The bug
```typescript
supabase.from('x').insert({...})  // no await — fire and forget, may not complete
```

### Audit
```bash
grep -rn "supabase.*\.\(insert\|update\|delete\|upsert\)" src/app/api/ --include="*.ts"
```
For each mutation: is it awaited? Unawaited mutations in serverless functions often
don't complete before the function returns. Silent data loss.

Fix: add await. Commit: "fix(area/route): await previously-unawaited [insert/update]"

---

## CHECK 4 — .single() vs .maybeSingle()

### The bug
- .single() throws if 0 rows or >1 rows → crashes the route
- .maybeSingle() returns null if 0 rows → safe

### Audit
```bash
grep -rn "\.single()" src/app/api/ --include="*.ts"
```
For each .single(): will this query ALWAYS return exactly one row?
- Querying by primary key that definitely exists → .single() ok
- Querying by a filter that might return 0 rows → should be .maybeSingle()

Fix the risky ones. Commit: "fix(area/route): .single()→.maybeSingle() — was crashing on zero rows"

---

## CHECK 5 — Error-swallowing try/catch

### The bug
```typescript
try { ... } catch { return NextResponse.json({ items: [] }) }
// real errors hidden as empty results
```

### Audit
```bash
grep -rn "catch {" src/app/api/ --include="*.ts"
grep -rn "catch (e) {}" src/app/api/ --include="*.ts"
```
For each empty or return-empty catch: should it log the error? Should it return a 500
instead of fake-empty data? Fix cases where a real failure is being masked as "no data".

Commit: "fix(area/route): surface error instead of swallowing as empty result"

---

## CHECK 6 — Silent insert/update no-ops

### The bug
An .update() or .delete() with a .eq() filter that matches zero rows succeeds with no error
but changes nothing. The user thinks it worked.

### Audit
For update/delete routes, after the mutation check if the operation should verify it
affected rows:
```typescript
const { data, error } = await supabase.from(x).update(y).eq(...).select()
if (!error && (!data || data.length === 0)) {
  // nothing was updated — likely wrong id or ownership issue
}
```
Focus on: price updates, status changes, settings saves, ownership transfers.

Commit: "fix(area/route): detect zero-row update no-op"

---

## CHECK 7 — Auth / ownership gaps (SECURITY)

### The bug
A route accepts business_id from the request and queries it WITHOUT verifying the
logged-in user owns that business. = cross-business data leak.

### Audit
For every route that takes business_id (from query param, body, or path):
1. Is there a check that the user owns it? Pattern:
```typescript
const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).maybeSingle()
if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })
```
2. OR uses resolveBusinessId which does the check internally.
3. Public routes (under /api/public/) are EXEMPT — they're intentionally public via token/slug.

Flag every route that reads/writes business data without an ownership check.
This is the most important SECURITY check. A leak here = one business seeing another's data.

Commit: "fix(area/route): add business ownership check — was allowing cross-business access"

---

## CHECK 8 — vercel.json safety

### Known issues found (fix these):
1. CRON: `/api/cron/parcel-insights` is `0 */6 * * *` (every 6 hours) — SUB-DAILY.
   Locked rule: sub-daily crons silently break Vercel Pro deploys. Change to daily: `0 */6` → pick a daily time like `0 6 * * *` (or split into one daily run).
2. CRON COUNT: 40 crons total. Verify the Vercel plan allows this many. If on a plan with
   a lower limit, the deploy will reject. (Hobby = limited, Pro = higher). If over limit,
   consolidate related crons into fewer routes that do multiple jobs.

### Also check:
3. FUNCTION COUNT: count distinct function entries. The locked rule says keep at 22.
   Count actual API route files: `find src/app/api -name route.ts | wc -l`. If the glob
   patterns in vercel.json cover them fine, ok — but if individual function configs exceed
   limits, consolidate.

Fix: change parcel-insights to daily. Verify cron count against plan. 
Commit: "fix(vercel): parcel-insights cron sub-daily→daily (was risking deploy break)"

---

## CHECK 9 — New code from prompts 110-113 (catch-up)

These files were created AFTER their areas were audited, so they need a pass:
- Prompt 112: src/app/api/community/upload-media, posts, live/* + src/app/community/create, live/*
- Prompt 113: src/lib/aria/ask/business-context (deep context queries), council, ask/memory-writer,
  long-doc-processor, fetch_url in aria-tools, image analysis
Run CHECKS 1-7 on these specific new files.

Commit per fix as found.

---

## Output per check
```
CHECK [N] COMPLETE
Files scanned: X
Issues found: Y
  - file: issue → fix (commit, pushed ✓)
```
Update AUDIT_STATE.md after each check + push.

## On completion
Final summary:
- Total silent-failure bugs fixed
- Total security/ownership gaps closed
- vercel.json issues resolved
- Confirm: git log origin/main..HEAD is empty (everything pushed)
- Mark in AUDIT_STATE.md: SILENT FAILURE + SAFETY SWEEP COMPLETE

## Start
Begin CHECK 1 (RLS/anon-key) — the highest priority. Then 2→9 in order.
Push after every single commit. Verify each push landed.
