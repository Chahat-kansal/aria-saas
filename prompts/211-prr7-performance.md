# Prompt 211 — PRR-7: Performance & Scalability

Seventh production-readiness phase. The system is hardened, secure, observable, reliable,
data-safe, and tested. Now it needs to be fast and scalable enough for the soft launch.
A slow Aria is a dead Aria — owners will not wait 8 seconds for a briefing.

## Pre-flight + MANDATORY COMMIT PROTOCOL
Read CLAUDE.md FIRST. Before EVERY commit: npx tsc --noEmit → npm run build → commit → push → verify.
One commit per task. No rapid-fire commits.

## WHAT THIS PHASE COVERS
1. Response time audit — find every route taking >2s and fix it
2. Cold start elimination — lambda warm-up for the 4 most-called routes
3. Council synthesis caching — don't re-run 5 Haiku calls for the same question twice
4. DB query audit — N+1 queries, missing indexes, RLS full-table scans
5. Bundle size — landing page and dashboard initial load
6. Cron efficiency — daily briefing and signal engine run time

---

## TASK 1 — Response time audit (identify hotspots)

Read Vercel runtime logs for the last 7 days. Filter by duration >2000ms. List every route
that appears more than 3 times. For each:
- What is it doing that takes so long? (DB queries, LLM calls, external API)
- Is there a cache that should exist but doesn't?
- Is there a serial chain of awaits that could be parallelised with Promise.all?

Output a ranked list: route | p50ms | p95ms | root cause | fix type

Then fix the top 3 worst offenders. Acceptable fix types:
- Parallelise serial awaits with Promise.all
- Add a Redis/KV cache (use Vercel KV if available, else in-memory Map with TTL)
- Move heavy computation to a background job
- Add a DB index (write migration)
- Reduce LLM prompt size (fewer tokens = faster)

Commit per fix: "perf(route): <route-name> — <fix description>, p95 <before>→<after>ms"

---

## TASK 2 — Parallelise serial awaits in critical routes

The daily briefing route (`/api/aria/daily-briefing`) and Ask Aria route (`/api/aria/ask`)
both have serial await chains that should be parallel. Pattern to find and fix:

BAD (serial):
```typescript
const ctx = await buildContext(bid)
const brain = await runBrains(ctx)
const synthesis = await synthesise(brain)
```

GOOD (parallel where inputs don't depend on each other):
```typescript
const [ctx, externalSignals] = await Promise.all([
  buildContext(bid),
  fetchExternalSignals(bid),
])
const brain = await runBrains(ctx, externalSignals)
```

Read the full daily-briefing route and the council.ts file. Find every serial await where
the inputs are independent. Parallelise them. Measure the impact.

Commit: "perf(briefing): parallelise context + external signal fetch — removes serial bottleneck"

---

## TASK 3 — Council synthesis cache

The council runs 5 Haiku calls every time a strategic question is asked. If the same
business asks the same category of question twice within 30 minutes, the second run should
return the cached result instantly.

Cache key: `council:${businessId}:${intentHash}` where intentHash is a 8-char hash of
the normalised question (lowercase, strip stopwords, sort tokens).

Cache store: Supabase table `council_cache` with columns:
- id uuid pk default gen_random_uuid()
- business_id uuid references businesses(id) on delete cascade
- intent_hash text not null
- result jsonb not null
- created_at timestamptz default now()
- expires_at timestamptz not null

Index: (business_id, intent_hash) unique.

Migration name: `add_council_cache_table`

Cache TTL: 30 minutes. On cache hit, return immediately with `cached: true` in the response.
On cache miss, run normally then write to cache.

Read council.ts. Add the cache check at the top of `runAriaCouncil` and the cache write
at the bottom, after successful synthesis.

Commit: "perf(council): 30-min synthesis cache — council:${bid}:${hash}, council_cache table"

---

## TASK 4 — DB query audit

Run these diagnostic queries on the Supabase project (nxfzippunqvqsvkmwtjv):

```sql
-- Find tables with no indexes (except PK)
SELECT schemaname, tablename
FROM pg_tables pt
WHERE schemaname = 'public'
  AND NOT EXISTS (
    SELECT 1 FROM pg_indexes pi
    WHERE pi.schemaname = pt.schemaname
      AND pi.tablename = pt.tablename
      AND pi.indexname NOT LIKE '%_pkey'
  );

-- Find the 10 slowest query patterns (requires pg_stat_statements)
SELECT query, calls, mean_exec_time, total_exec_time
FROM pg_stat_statements
WHERE query NOT LIKE '%pg_stat%'
ORDER BY mean_exec_time DESC
LIMIT 10;

-- Tables with most sequential scans (missing index candidates)
SELECT relname, seq_scan, idx_scan,
  ROUND(seq_scan::numeric / NULLIF(seq_scan + idx_scan, 0) * 100, 1) AS seq_pct
FROM pg_stat_user_tables
WHERE seq_scan > 100
ORDER BY seq_scan DESC
LIMIT 15;
```

For each table with high seq_scan %: add a covering index on the columns used in WHERE
clauses by the most-called routes. Write one migration per table.

Priority tables (most queried):
- `pos_sales` — add index on (business_id, created_at DESC)
- `pos_products` — add index on (business_id, is_active) where is_active = true
- `aria_ai_calls` — add index on (business_id, created_at DESC)
- `supplier_ai_suggestions` — add index on (business_id, accepted, created_at DESC)
- `daily_briefings` — add index on (business_id, date DESC)

Migration name: `add_performance_indexes`
Commit: "perf(db): covering indexes on pos_sales, pos_products, aria_ai_calls, supplier_ai_suggestions, daily_briefings"

---

## TASK 5 — Bundle size audit

Run `npm run build` and capture the bundle analysis output. Identify any route or page
with a First Load JS > 500kB. These are candidates for:
- Dynamic import with `next/dynamic` + `ssr: false` for heavy client-only components
- Moving large static data out of the bundle into API routes
- Replacing a heavy library with a lighter alternative

Target pages to check:
- `/dashboard` (main dashboard)
- `/pos` (POS terminal — must be fast, it's the till)
- `/` (landing page)
- `/dashboard/ask-aria`

For the landing page specifically: ensure ALL Remotion/animation code is behind
`dynamic(() => import(...), { ssr: false })`. No animation code should be in the SSR bundle.

For the POS terminal: it should load in <2s on a 4G connection. If First Load JS >300kB,
split the barcode scanner, receipt printer, and split payment modules into lazy-loaded chunks.

Commit: "perf(bundle): dynamic imports for landing animations + POS heavy modules"

---

## TASK 6 — Cron efficiency

The daily briefing cron (`0 9 * * *`) currently runs sequentially per business. If there
are 50 businesses, it takes 50x longer than one business. Fix:

Read `src/app/api/cron/briefing/route.ts` (or wherever the briefing cron lives). If it
processes businesses sequentially in a for-loop, replace with `Promise.allSettled` in
batches of 5:

```typescript
// BAD
for (const biz of businesses) {
  await generateBriefing(biz.id)
}

// GOOD — batches of 5, failure of one doesn't block others
const BATCH = 5
for (let i = 0; i < businesses.length; i += BATCH) {
  const batch = businesses.slice(i, i + BATCH)
  await Promise.allSettled(batch.map(b => generateBriefing(b.id)))
}
```

Also check the signal engine cron. Apply same batch pattern if sequential.

Commit: "perf(cron): batch briefing + signal engine to 5 parallel — removes serial bottleneck"

---

## TASK 7 — Vercel function cold start mitigation

Identify the 4 routes called most frequently from the dashboard on first load. These are
the routes that cause the longest perceived wait because they cold-start on the first
request after inactivity.

Add a keep-warm ping from the client for these routes. Pattern:

In `src/app/dashboard/layout.tsx`, after mount, fire background pings to the 4 heaviest
routes with a minimal payload:

```typescript
useEffect(() => {
  const WARM = [
    '/api/aria/daily-briefing',
    '/api/aria/ask',
    '/api/aria/live-intelligence',
    '/api/aria/business-brain',
  ]
  // Fire and forget — don't await, don't handle errors
  WARM.forEach(url => fetch(url, { method: 'HEAD' }).catch(() => {}))
}, [])
```

Note: Vercel Pro allows HEAD requests to wake functions without executing the full handler
if the route exports `export const preferredRegion = 'iad1'`. Add this to the 4 warm routes.

Commit: "perf(cold-start): keep-warm HEAD pings for 4 heaviest routes from dashboard layout"

---

## ACCEPTANCE CRITERIA

Before marking PRR-7 complete, verify:

- [ ] No route in Vercel logs shows p95 >3s for the last 24h (excluding council synthesis)
- [ ] Council synthesis returns cached result in <100ms on cache hit
- [ ] Daily briefing cron processes 10 businesses in parallel batches, not sequentially
- [ ] Landing page First Load JS <400kB
- [ ] POS terminal First Load JS <300kB
- [ ] DB sequential scan % <30% on pos_sales, pos_products, aria_ai_calls
- [ ] `npx tsc --noEmit` passes
- [ ] `npm run build` passes
- [ ] All existing Playwright tests still pass

---

## WHAT NOT TO DO

- Do not add Redis or any new paid infrastructure — Supabase + Vercel KV only
- Do not optimise routes that aren't in the hot path (check logs first)
- Do not break existing functionality to make something faster
- Do not cache anything that must be real-time (POS sale creation, payment processing)
- Do not add keep-warm pings to payment routes (security risk)
