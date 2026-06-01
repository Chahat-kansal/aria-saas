# Prompt 206 — PRR-4: Reliability

Fourth production-readiness phase. Make Aria survive load, slow queries, and third-party
outages without falling over. This is what keeps the app up when a dependency has a bad day.

## Pre-flight + MANDATORY COMMIT PROTOCOL
Read CLAUDE.md FIRST — especially the mandatory commit protocol at the top.
Before EVERY commit: npx tsc --noEmit → npm run build → commit → push → verify git log origin/main..HEAD empty.
NEVER commit or push without npm run build passing first. (Build has broken 3x from skipping this.)
At the end: final npm run build, confirm green, state "Build verified green, all pushed."

## TASK 1 — Graceful degradation when third-parties fail
The app calls Anthropic, Stripe, Twilio, SendGrid, Bunny, Cloudflare, Basiq, Xero, Square.
When one is down, the relevant feature should degrade gracefully — not crash the page or block unrelated features.

For each external dependency, ensure:
- A timeout on the call (no hanging forever — 10s default, 30s for AI)
- A try/catch that returns a clear "service temporarily unavailable" state
- The rest of the app keeps working (e.g. if Anthropic is down, POS sales still work — only Aria chat degrades)
- User sees a friendly message, not a stack trace or infinite spinner

Key flows to harden:
- Aria chat/briefing → if Anthropic down: "Aria is temporarily unavailable, try again shortly" (POS unaffected)
- Payment → if Stripe down: clear error, don't mark sale paid
- SMS/email → if Twilio/SendGrid down: queue or clear failure, don't lose the customer action
- Bank feed → if Basiq down: show last-synced data with a "couldn't refresh" notice
Commit: "feat(reliability): graceful degradation on third-party outages"

## TASK 2 — Timeouts on all external calls
```bash
grep -rn "await fetch(\|\.create(\|anthropic\|stripe\|twilio" src/app/api/ src/lib/ --include="*.ts"
```
Every external fetch/SDK call must have a timeout:
```typescript
const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
```
For AI calls (slower): 30s. For payment/critical: 15s. Default: 10s.
A call with no timeout can hang a serverless function until the platform kills it (wasting
budget + bad UX). 
Commit: "feat(reliability): timeouts on all external API calls"

## TASK 3 — Retry with backoff for transient failures
For idempotent operations that hit flaky external services (reads, syncs):
Add a retry helper src/lib/reliability/retry.ts:
```typescript
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { retries?: number; baseDelayMs?: number; label?: string } = {}
): Promise<T> {
  const { retries = 3, baseDelayMs = 500, label = 'op' } = opts
  let lastErr: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try { return await fn() }
    catch (e) {
      lastErr = e
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, baseDelayMs * Math.pow(2, attempt)))
      }
    }
  }
  throw lastErr
}
```
Apply to: integration syncs (Xero, Basiq, Square), review fetches, non-critical reads.
DO NOT retry: payments (could double-charge), SMS/email sends (could double-send), unless idempotency keys are used.
Commit: "feat(reliability): retry with exponential backoff for transient failures"

## TASK 4 — Database query performance + indexes
Slow queries cause timeouts under load. Add indexes for common query patterns.
Identify the most frequent queries (sales by business+date, products by business, customers by business):
Create a migration adding indexes where missing:
```sql
CREATE INDEX IF NOT EXISTS idx_pos_sales_business_created ON pos_sales(business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pos_sale_items_sale ON pos_sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_pos_products_business ON pos_products(business_id);
CREATE INDEX IF NOT EXISTS idx_pos_customers_business ON pos_customers(business_id);
CREATE INDEX IF NOT EXISTS idx_community_posts_business_published ON community_posts(business_id, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_aria_conversations_business ON aria_conversations(business_id, updated_at DESC);
-- Add others based on actual query patterns in the codebase
```
Review the code for the hottest queries and ensure each has a supporting index.
Run via Supabase MCP. Verify with EXPLAIN that key queries use the index.
Commit: "feat(reliability): database indexes for hot query paths"

## TASK 5 — Pagination on unbounded queries
Queries that return ALL rows will eventually time out as data grows.
```bash
grep -rn "\.select(" src/app/api/ --include="*.ts" | grep -v "limit\|single\|maybeSingle\|count"
```
For list endpoints (sales history, customers, products, posts, transactions):
- Add .limit() with sensible defaults (50-100)
- Add pagination (offset/cursor) where the UI needs more
- Never return an unbounded result set
Commit: "feat(reliability): pagination + limits on list endpoints"

## TASK 6 — Connection + resource cleanup
- Ensure no unclosed connections, unhandled promise rejections
- Verify serverless functions don't leak (each request self-contained)
- Check for any setInterval/setTimeout that never clears in API routes (memory leak)
```bash
grep -rn "setInterval\|setTimeout" src/app/api/ --include="*.ts"
```
Commit: "fix(reliability): resource cleanup + no leaked timers in API routes"

## TASK 7 — Idempotency for critical mutations
Payments and order creation should be idempotent — a double-submit (network retry, double-tap)
must not create two sales or two charges.
For pos/sale and payment routes:
- Accept an idempotency key from the client (or derive from cart+timestamp)
- Check if a sale with that key already exists before creating
- Return the existing sale if duplicate
Commit: "feat(reliability): idempotency keys on sale + payment creation"

## TASK 8 — Reliability runbook
Create RELIABILITY.md documenting:
- What happens when each dependency is down (degradation behaviour)
- Timeout + retry policy
- Known capacity limits
- How to respond to an outage (which dashboard, what to check)
Commit: "docs(reliability): RELIABILITY.md — degradation + outage runbook"

## PRR-4 EXIT CHECKLIST
- [ ] Every external call has a timeout
- [ ] Third-party outages degrade gracefully (POS works even if Anthropic down)
- [ ] Retry with backoff on idempotent operations (NOT on payments/sends)
- [ ] Indexes on all hot query paths (verified with EXPLAIN)
- [ ] List endpoints paginated/limited (no unbounded queries)
- [ ] No leaked timers/resources in API routes
- [ ] Idempotency on sale + payment creation
- [ ] RELIABILITY.md created
- [ ] npx tsc --noEmit + npm run build pass
- [ ] All pushed (git log origin/main..HEAD empty)
- [ ] Deploy green

Update PRODUCTION_READINESS.md: check off PRR-4. Next: PRR-5 (data safety).

## Rules (RULE 0 + commit protocol)
- Reliability is additive — never remove a feature to make it "more reliable"
- Graceful degradation must not silently swallow errors (log them, surface to user)
- Test that the critical path (checkout) still works after adding timeouts/retries
- Build MUST pass before every commit (CLAUDE.md protocol)

## Start
TASK 1 (graceful degradation) — the highest-impact reliability win. An outage in one
dependency must never take down the whole app.
