# Prompt 205 — PRR-3: Observability

Third production-readiness phase. You can't fix what you can't see. This phase makes failures
VISIBLE — so when something breaks in production you know immediately, not when a customer complains.
Sentry is installed (@sentry/nextjs ^10.52.0) with PII scrubbing (PRR-2). Now verify + extend it.

## Pre-flight
```
git pull origin main
```
Read CLAUDE.md (RULE 0). Push + verify after every commit.

## TASK 1 — Verify Sentry actually captures production errors
Sentry is configured but UNVERIFIED — it may not be catching anything.
1. Create a temporary test route: src/app/api/debug/sentry-test/route.ts
   ```typescript
   import * as Sentry from '@sentry/nextjs'
   export async function GET() {
     try { throw new Error('PRR-3 Sentry test — server') }
     catch (e) { Sentry.captureException(e); await Sentry.flush(2000) }
     return Response.json({ sent: true })
   }
   ```
2. Add a client-side test button on a debug page: src/app/dashboard/debug/page.tsx
   that throws a client error.
3. Deploy, hit both, confirm BOTH appear in the Sentry dashboard within 60s.
4. If they DON'T appear: fix the Sentry config (DSN env var, init in instrumentation.ts,
   tunnelRoute, etc.) until they do.
5. Once verified working: KEEP the debug route but guard it behind an admin/env check
   (don't expose error-throwing endpoints publicly — but keep for future verification).
Commit: "feat(observability): verify + fix Sentry production error capture"

## TASK 2 — Structured logging
Replace scattered console.log with a structured logger that's queryable in Vercel logs.
Create src/lib/observability/logger.ts:
```typescript
type LogLevel = 'debug' | 'info' | 'warn' | 'error'
interface LogContext { businessId?: string; userId?: string; route?: string; [k: string]: unknown }

function log(level: LogLevel, message: string, context: LogContext = {}) {
  const entry = { level, message, timestamp: new Date().toISOString(), ...context }
  // Structured JSON — Vercel log drains + Sentry can parse this
  const line = JSON.stringify(entry)
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

export const logger = {
  debug: (m: string, c?: LogContext) => log('debug', m, c),
  info: (m: string, c?: LogContext) => log('info', m, c),
  warn: (m: string, c?: LogContext) => log('warn', m, c),
  error: (m: string, c?: LogContext) => log('error', m, c),
}
```
Apply to the critical paths: sale completion, payment, AI calls, integrations, cron jobs.
Each should log start + success/failure with businessId + route context.
NEVER log PII (no raw email/phone/card — businessId and userId are ok).
Commit: "feat(observability): structured JSON logger on critical paths"

## TASK 3 — Health check endpoints
Create src/app/api/health/route.ts (public, lightweight):
```typescript
export async function GET() {
  return Response.json({ status: 'ok', timestamp: new Date().toISOString() })
}
```
Create src/app/api/health/deep/route.ts (checks dependencies):
- Supabase: run a trivial query (select 1), measure latency
- Anthropic: check API key present (don't make a paid call)
- Upstash: ping Redis
- Return { status, checks: { supabase: {ok, ms}, redis: {ok, ms}, ... } }
- Return 503 if any critical dependency is down
Commit: "feat(observability): health check + deep dependency health endpoints"

## TASK 4 — Critical-path error tracking
For the highest-value flows, ensure errors are captured to Sentry with context:
- Sale/checkout failures
- Payment failures (Stripe)
- AI call failures (Anthropic)
- Integration sync failures (Xero, Basiq, Square)
- Cron job failures
Wrap these with Sentry.captureException + logger.error including businessId.
Add Sentry context tags (business_id, route, operation) so errors are filterable.
Commit: "feat(observability): error capture + context tags on critical flows"

## TASK 5 — Cron job monitoring
40 crons run unattended. If one silently fails, you won't know.
For each cron route:
- Log start + completion + duration + rows processed
- On failure: Sentry.captureException with the cron name as a tag
- Consider a simple cron_runs table: { cron_name, started_at, completed_at, status, error, rows_affected }
  so you can see cron health history in the dashboard
Create src/app/api/cron/_lib/track-cron.ts helper that wraps cron logic with this tracking.
Apply to the most important crons (briefings, reorders, sync jobs, reminders).
Commit: "feat(observability): cron run tracking + failure alerts"

## TASK 6 — Uptime + alerting setup (documentation + config)
1. Document in OBSERVABILITY.md how to set up:
   - Vercel's built-in monitoring / log drains
   - A free uptime monitor (e.g. Better Uptime / UptimeRobot) hitting /api/health every 5 min
   - Sentry alert rules (notify on error rate spike, new error type)
2. Configure Sentry alert rules if accessible via config:
   - Alert when error rate exceeds threshold
   - Alert on any error in payment/checkout flow
3. This task is partly manual (external dashboards) — document what the user must click.
Commit: "docs(observability): OBSERVABILITY.md — uptime, alerts, monitoring setup"

## TASK 7 — Admin observability dashboard
Create src/app/dashboard/system-health/page.tsx (owner-only):
- Live health check status (calls /api/health/deep)
- Recent cron runs (from cron_runs table) with status
- Recent errors count (if accessible)
- Integration connection status (Xero/Basiq/Square/Stripe connected?)
- Rate limit status
This gives the owner one screen to see system health.
Commit: "feat(observability): system health dashboard for owner"

## PRR-3 EXIT CHECKLIST
- [ ] Sentry VERIFIED capturing both client + server errors in production
- [ ] Structured logger on all critical paths (no PII logged)
- [ ] /api/health + /api/health/deep live
- [ ] Critical flows capture errors to Sentry with context tags
- [ ] Cron jobs tracked (start/finish/failure)
- [ ] OBSERVABILITY.md documents uptime + alert setup
- [ ] System health dashboard live for owner
- [ ] npx tsc --noEmit + npm run build pass
- [ ] All pushed (git log origin/main..HEAD empty)
- [ ] Deploy green

Update PRODUCTION_READINESS.md: check off PRR-3. Next: PRR-4 (reliability).

## Rules (RULE 0)
- Observability is purely additive — never remove functionality to add logging
- NEVER log PII (email/phone/card). businessId + userId only.
- Health/debug endpoints must not expose sensitive data
- One commit per task, push + verify each

## Start
TASK 1 first — verifying Sentry actually works is the foundation. If errors aren't being
captured, everything else in this phase is built on sand. Confirm it works before proceeding.
