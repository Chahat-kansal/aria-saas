# Aria OS — Observability Setup Guide

This document covers every monitoring layer for Aria in production. Follow the
steps in order; each section is independent but they work best together.

---

## 1. Sentry — Error Tracking

### Verify it's working
1. Set `SENTRY_DEBUG_SECRET` in Vercel project settings (any secret string).
2. Deploy, then visit `https://ariaos.site/dashboard/debug` (login required).
3. Click **Send server error to Sentry** and enter the secret. Check the Sentry
   dashboard for "PRR-3 Sentry test — server" within 60 seconds.
4. Click **Send client error to Sentry**. Check for "[Sentry test] Verify error
   capture" in the Sentry dashboard.

### Required Vercel env vars
| Variable | Description |
|---|---|
| `SENTRY_DSN` | Server / edge DSN from Sentry project settings |
| `NEXT_PUBLIC_SENTRY_DSN` | Client-side DSN (same value as above, safe to expose) |
| `SENTRY_ORG` | Sentry organisation slug |
| `SENTRY_PROJECT` | Sentry project slug |
| `SENTRY_AUTH_TOKEN` | Used by withSentryConfig during build (source map upload) |
| `SENTRY_DEBUG_SECRET` | Secret to guard `/api/debug/sentry-test` endpoint |

### Alert rules to configure in Sentry
1. **Payment errors**: Go to Alerts → Create Alert → Issue Alert.
   - Filter: `route:stripe/webhook OR route:pos/sale`
   - Action: Email + Slack on first occurrence.
2. **Error rate spike**: Go to Alerts → Create Alert → Metric Alert.
   - Metric: Error count per minute > 10 (5-min window)
   - Action: Email notification.
3. **New error type**: Use "New Issue" alert type, notify on every new unique error.

---

## 2. Structured Logs — Vercel Log Drains

All API routes, cron jobs, and AI calls emit structured JSON to stdout via
`src/lib/observability/logger.ts`. Each log line is a JSON object:

```json
{ "level": "info", "message": "pos/sale completed", "route": "pos/sale",
  "businessId": "uuid", "ms": 142, "timestamp": "2026-06-01T10:00:00Z" }
```

### Set up a log drain (optional but recommended)
1. In Vercel Dashboard → Project → Settings → Log Drains.
2. Choose Datadog, Logtail, or any NDJSON endpoint.
3. Filter on `level:error` for alerting; use `route:cron/*` to monitor crons.

No PII is logged. Fields: `level`, `message`, `route`, `businessId`, `userId`
(opaque IDs only), `ms` (duration), `error` (message text, no stack).

---

## 3. Health Checks — Uptime Monitoring

Two endpoints are available:

| Endpoint | Auth | Description |
|---|---|---|
| `GET /api/health` | None | Lightweight ping — returns `{ status, ok, timestamp, version }` |
| `GET /api/health/deep` | None | Full dependency check — Supabase, Anthropic, Upstash |

The deep health check returns 200 when all critical deps are up, 503 otherwise:
```json
{
  "status": "ok",
  "timestamp": "...",
  "checks": {
    "supabase": { "ok": true, "ms": 12 },
    "anthropic": { "ok": true, "ms": 0 },
    "redis": { "ok": true, "ms": 8 }
  }
}
```

### Set up an uptime monitor (free, 5-min checks)

**Option A — UptimeRobot (free)**
1. Sign up at uptimerobot.com.
2. Add Monitor → HTTPS → URL: `https://ariaos.site/api/health`.
3. Interval: 5 minutes. Alert contact: email.
4. Optional: add a second monitor for `/api/health/deep` with keyword check `"status":"ok"`.

**Option B — Better Uptime (recommended)**
1. Sign up at betteruptime.com.
2. Add Monitor → Uptime → `https://ariaos.site/api/health`.
3. Interval: 3 minutes. On-call escalation: email → Slack.
4. Status page: create a public status page and link it from your site.

---

## 4. Cron Job Monitoring

All 40 cron jobs run via Vercel cron. 5 key crons write execution records to
the `cron_runs` table (schema: `cron_name`, `started_at`, `completed_at`,
`status`, `duration_ms`, `rows_affected`, `error`).

Tracked crons:
- `daily-briefing-submit` (briefings)
- `xero-sync` (accounting)
- `marketing-automations` (email/SMS campaigns)
- `nightly-sync` (intelligence events)
- `run-scheduled-reorders` (inventory)

All 40 crons also have Sentry error capture via `withCronRetry` (tag: `cron:<name>`).

To see failures in Sentry: filter by `cron:xero-sync` (or any cron name).

To query recent failures from the `cron_runs` table:
```sql
select cron_name, started_at, status, duration_ms, error
from cron_runs
where status = 'failed'
order by started_at desc
limit 20;
```

### Vercel cron limits (Pro plan)
- Current cron count: 40 (verify against plan at vercel.com/docs/cron-jobs).
- All schedules are daily-maximum (no sub-daily). Sub-daily crons silently fail on Pro.

---

## 5. System Health Dashboard

Available at `/dashboard/system-health` (owner login required).

Shows:
- Live dependency status (Supabase, Anthropic, Upstash) from `/api/health/deep`
- Recent cron run history from `cron_runs` table
- Integration connection status (Xero, Basiq, Square, Stripe)
- Rate limit configuration summary

---

## 6. Quick Reference — What Breaks What

| Symptom | First place to check |
|---|---|
| AI features broken | Sentry filter `route:aria/*` + Anthropic API status |
| Payments failing | Sentry filter `route:stripe/webhook` + Stripe dashboard |
| Briefings not arriving | Sentry filter `cron:daily-briefing-submit` + `cron_runs` table |
| Bank sync broken | Sentry filter `route:integrations/basiq/sync` |
| Site down | `/api/health/deep` → look for Supabase 503 |
| Cron silent failure | Query `cron_runs where status='failed'` |

---

*Last updated: 2026-06-01. Next review after PRR-4 (Reliability).*