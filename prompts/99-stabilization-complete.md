# Prompt 99 — Stabilization: Finish All Undelivered Prompt 95 Tasks

Prompt 95 was partially executed. This finishes every outstanding item.
Read CLAUDE.md and AUDIT_STATE.md before starting.

## Pre-flight (MANDATORY — read CLAUDE.md first)
```
git pull origin main
npx tsc --noEmit   # must be zero errors
npm run build      # must pass
```
Read CLAUDE.md. Read every file you will edit before touching it.
One commit per task. After every commit: git push origin main, then confirm git log origin/main..HEAD is empty.
State "Build verified green, all commits pushed." before finishing.

## UPGRADE-ONLY RULE
Never remove, stub, or downgrade any existing feature. Fix forward only.

## ARIA INTELLIGENCE RULE (applies to every task)
Every new feature must:
1. Write relevant data to aria_ai_calls (log AI usage)
2. Feed insights back into the daily briefing context (update buildAskAriaContext or daily-briefing route to include new data)
3. Log significant actions to aria_autopilot_actions
4. Use claude-haiku-4-5-20251001 unless the task requires complex reasoning (then claude-sonnet-4-5-20250929)


## TASK 1 — Briefing cache invalidation
src/lib/aria/briefing-cache.ts — create a cache layer for daily briefings.
The briefing is rebuilt from scratch on every request even when data hasn't changed.
Fix: cache the briefing result in Supabase (daily_briefings table, keyed by business_id + date).
On POST /api/aria/daily-briefing: check if today's briefing exists and data hasn't changed → return cached.
Invalidate cache when: a sale is recorded, a product is updated, a customer action fires.
Invalidation: POST /api/aria/briefing-cache/invalidate { business_id } — call this from pos/sale, pos/products PATCH, customers winback.
Commit: "fix(briefing): cache invalidation — avoid full rebuild when data unchanged"

## TASK 2 — CSP tightening (prompt 95 Task 2)
Read src/middleware.ts. Tighten Content-Security-Policy:
- Remove 'unsafe-eval' if present (only keep if Sentry requires it — check)
- Add frame-ancestors 'none' (prevents clickjacking)
- Add upgrade-insecure-requests
- Verify ariaos.site loads without CSP violations in browser console
Commit: "fix(security): tighten CSP — remove unsafe-eval, add frame-ancestors none"

## TASK 3 — Weekly BI Report PDF (serverless-safe)
The weekly report Puppeteer job fails on Vercel because full Chromium doesn't fit in the serverless bundle.
Fix: use @sparticuz/chromium + puppeteer-core (Lambda-compatible Chromium).
Install: npm i @sparticuz/chromium puppeteer-core
Read src/app/api/cron/ to find the weekly report cron route.
Replace puppeteer.launch() with:
```typescript
const chromium = require('@sparticuz/chromium')
const browser = await puppeteer.launch({
  args: chromium.args,
  defaultViewport: chromium.defaultViewport,
  executablePath: await chromium.executablePath(),
  headless: chromium.headless,
})
```
PDF stored to Vercel Blob → URL saved → emailed via SendGrid Monday 8am AEST.
Commit: "fix(weekly-report): serverless-safe PDF with @sparticuz/chromium"

## TASK 4 — Competitor table column mismatch fix
Read src/lib/aria/agents.ts — competitor-watch agent.
Read the actual competitor_snapshots table schema from Supabase (list_tables).
Fix any column name mismatches found. Specifically check: competitor_name, price, product_name, scraped_at, source_url.
Commit: "fix(competitors): column name mismatches in competitor_snapshots query"

## TASK 5 — Roster guard rails
Read src/app/api/pos/roster/route.ts and related.
Add: staff cannot be rostered for more than 10 hours in a single shift (hard limit).
Add: if a staff member is already scheduled for an overlapping shift, return a 409 conflict error with the conflicting shift details.
Commit: "fix(roster): 10hr shift limit + overlap conflict detection"

## TASK 6 — Sentry verification
Confirm Sentry is actually capturing production errors.
In src/sentry.server.config.ts and src/sentry.client.config.ts: verify DSN is set from NEXT_PUBLIC_SENTRY_DSN or SENTRY_DSN env var.
Add a test route GET /api/test/sentry-check that throws a test error (development only — gate behind NODE_ENV !== 'production').
Confirm the error appears in your Sentry dashboard before removing the test route.
Commit: "fix(observability): verify Sentry DSN wired + test route"

## TASK 7 — vercel.json audit
Read vercel.json. Confirm:
- Function count ≤ 22
- No cron schedule is sub-daily (anything more frequent than "0 9 * * *" violates Vercel Pro limits)
- If any crons fire more frequently, merge them into the 9am daily cron or change to daily
Commit: "fix(vercel): audit function count + cron schedules"
