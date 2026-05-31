# Prompt 202 — Fix Fire-and-Forget Silent Data Loss (serverless)

## The bug class (NOT caught by column audits)
Many routes do background work in an un-awaited IIFE:
```typescript
;(async () => {
  await supabase.from('pos_customers').update({ loyalty_points: ... })
})()  // ← NOT awaited
return NextResponse.json({ ok: true })  // function returns, IIFE may be killed
```
In Vercel serverless, once the response is returned the function can be frozen/terminated.
Un-awaited async work MAY NOT COMPLETE. This silently loses: loyalty points, KDS tickets,
stock deduction, review syncs, stats updates, etc. The user sees success; the write never happened.

## The fix: Vercel `waitUntil`
Vercel provides `waitUntil` to properly background work that must finish AFTER the response:
```typescript
import { waitUntil } from '@vercel/functions'

waitUntil((async () => {
  await supabase.from('pos_customers').update({ loyalty_points: ... })
})())
return NextResponse.json({ ok: true })
```
`waitUntil` keeps the function alive until the promise settles, WITHOUT blocking the response.
Best of both worlds: fast response + guaranteed completion.

Install: npm i @vercel/functions

## Pre-flight
```
git pull origin main
```
Read CLAUDE.md (RULE 0). After every commit: push + verify (git log origin/main..HEAD empty).

## Scope — files with un-awaited background work
Confirmed candidates (verify each, fix the un-awaited ones):
- src/app/api/pos/sale/route.ts (loyalty update + KDS + ingredient deduction — line ~287, ~302)
- src/app/api/pos/sales/route.ts
- src/app/api/pos/orders/receive/route.ts
- src/app/api/pos/products/route.ts
- src/app/api/pos/products/[id]/route.ts
- src/app/api/pos/online-orders/[id]/route.ts
- src/app/api/pos/returns/route.ts
- src/app/api/pos/splits/[id]/pay/route.ts
- src/app/api/pos/sync-offline/route.ts
- src/app/api/pos/sessions/route.ts
- src/app/api/warehouse/grn/route.ts
- src/app/api/aria/actions/[id]/route.ts
- src/app/api/aria/hypotheses/[id]/route.ts
- src/app/api/aria/briefing/route.ts
- src/app/api/aria/sync-reviews/route.ts
- src/app/api/aria/price-intelligence/route.ts
- src/app/api/seo/crawl/route.ts

Also grep for more:
```bash
grep -rn ");(async () =>\|;(async()=>\|void (async" src/app/api/ --include="*.ts"
grep -rn "fire-and-forget\|non-blocking\|fire and forget" src/app/api/ --include="*.ts"
```

## How to fix each
For each un-awaited IIFE doing a DB write or external call:
1. Determine: does this work NEED to complete? (loyalty points, stock, KDS = YES. Pure analytics logging = maybe ok to drop)
2. If it needs to complete: wrap in `waitUntil(...)` instead of bare `()`
3. Keep error handling inside (try/catch) so a failure logs but doesn't crash
4. Do NOT make it blocking (don't just add await before the response — that slows checkout).
   waitUntil is the correct tool: non-blocking AND guaranteed.

Example fix for pos/sale loyalty:
```typescript
import { waitUntil } from '@vercel/functions'

if (customer_id) {
  waitUntil((async () => {
    try {
      const { data: cust } = await supabase.from('pos_customers')
        .select('loyalty_points, total_spent, visit_count').eq('id', customer_id).maybeSingle()
      if (!cust) return
      await supabase.from('pos_customers').update({
        loyalty_points: (cust.loyalty_points ?? 0) + Math.floor(total_amount),
        total_spent: (cust.total_spent ?? 0) + total_amount,
        visit_count: (cust.visit_count ?? 0) + 1,
        last_visit: new Date().toISOString(),
      }).eq('id', customer_id)
    } catch (e) { console.error('[sale] loyalty update failed:', e) }
  })())
}
```

## RULE 0 reminder
This is an UPGRADE — making sure writes that should happen DO happen. Do not remove any
background work; make it reliable. Do not make checkout slower (no blocking awaits on the
critical path — use waitUntil).

## Commit per file
"fix(area/route): waitUntil for [background work] — was silently dropped in serverless"

## Exit checklist
- [ ] @vercel/functions installed
- [ ] Every un-awaited DB-write IIFE in API routes uses waitUntil
- [ ] Checkout/sale still returns fast (waitUntil doesn't block response)
- [ ] Pure-logging fire-and-forget that's ok to drop: documented as intentional
- [ ] npx tsc --noEmit + npm run build pass
- [ ] All pushed (git log origin/main..HEAD empty)
- [ ] Deploy green

Update AUDIT_STATE.md: record fire-and-forget sweep complete + count fixed.

## Start
Begin with src/app/api/pos/sale/route.ts (loyalty + KDS + ingredients — highest impact:
every cafe sale). Then work the list.
