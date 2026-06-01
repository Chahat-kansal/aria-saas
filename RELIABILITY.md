# Reliability Runbook — Aria OS

**Phase:** PRR-4 · **Last updated:** 2026-06-01

---

## 1. Degradation behaviour by dependency

| Dependency | What happens when it's down | POS affected? |
|---|---|---|
| **Anthropic (Claude)** | Aria chat returns "Aria is temporarily unavailable, try again shortly" (503). Briefing generation fails silently and retries next cron run. | No — POS checkout, stock, customers all work. |
| **Basiq** | Bank feed sync returns `{ degraded: true }` and shows last-synced data with a "couldn't refresh" notice. | No |
| **Twilio (SMS)** | SMS sends are wrapped in try/catch — failure is logged, not propagated. Xero-sync SMS is non-fatal. | No |
| **Resend (email)** | Email sends fail silently (logged). Customer-facing flows don't surface the error. | No |
| **Xero** | Sync job logs the error, increments error count, moves to next business. Operator sees next morning's cron result. | No |
| **Square** | Sync job degrades per-business, logs error. Existing POS data unchanged. | No |
| **Stripe** | Payment processing returns a clear user-facing error. Sale is NOT marked paid. No double-charge risk. | Yes — payment blocked, not crashed. |
| **OpenRouter** | Falls through to error response from model-router. Aria features degrade; POS unaffected. | No |
| **Google (reviews)** | Review-sync cron logs failure and skips. Existing reviews remain visible. | No |

---

## 2. Timeout policy

All external network calls carry an `AbortSignal.timeout()`. The hierarchy:

| Category | Timeout |
|---|---|
| Default (Twilio, Resend, Xero APIs, Google) | 10 s |
| Bank/financial APIs (Basiq) | 15 s |
| AI inference (Anthropic, OpenRouter, batch) | 30 s |
| Cron + serverless hard limit | 300 s (`maxDuration`) |

Serverless AI routes: 120 s (`maxDuration`). If a call exceeds the signal timeout, the
`AbortError` is caught and converted to a 503 response.

---

## 3. Retry policy

**Helper:** `src/lib/reliability/retry.ts` — `withRetry(fn, { retries, baseDelayMs, label })`

Default: 3 retries, 500 ms base, exponential backoff (500 → 1 000 → 2 000 ms).

| Use | Retry? | Reason |
|---|---|---|
| Integration syncs (Xero, Basiq, Square) | Yes | Reads / idempotent writes |
| Review fetches | Yes | Read-only |
| Anthropic AI calls | Yes (cron path only) | Non-user-facing |
| POS sale creation | **No** | Use idempotency key instead |
| Stripe payment charge | **No** | Double-charge risk |
| Twilio/Resend sends | **No** | Double-send risk |

Cron routes use `withCronRetry` (3 retries) from `src/lib/api/retry.ts`.

---

## 4. Idempotency

`pos/sale` accepts an optional `idempotency_key` (client-generated UUID per checkout attempt).

- Client should generate a UUID at the start of checkout and include it in the POST body.
- Server looks up `(business_id, idempotency_key)` before inserting — returns the existing sale if found.
- A unique partial index on `pos_sales(business_id, idempotency_key) WHERE idempotency_key IS NOT NULL` enforces uniqueness at the DB level.
- Result: a network retry or double-tap creates exactly one sale record.

---

## 5. Known capacity limits

| Query / endpoint | Limit applied | Notes |
|---|---|---|
| `pos_sales` revenue fetch (admin) | 10 000 rows | Time-bounded too |
| `pos_customers` (loyalty insight) | 10 000 rows | 30-day window |
| `pos_loyalty_transactions` | 5 000 rows | Per request |
| `aria_ai_calls` (AI cost admin) | 10 000 rows | 30-day window |
| POS dashboard sales | 500 rows | Paginated |

All hot-path tables have covering indexes (see migration `20260601000003`).

---

## 6. Database indexes (PRR-4)

Migration: `supabase/migrations/20260601000003_prr4_hot_query_indexes.sql`

Key indexes applied to production:

- `pos_sales(business_id, created_at DESC)` — all sales queries
- `pos_sale_items(sale_id)` — receipt join
- `pos_products(business_id)` — product list
- `pos_customers(business_id)` — customer list
- `pos_sale_payments(sale_id)` — payment join
- `aria_ai_calls(business_id, created_at DESC)` — cost analytics
- `bank_transactions(business_id, transaction_date DESC)` — cash flow
- `cron_runs(cron_name, started_at DESC)` — health dashboard

Verified with `EXPLAIN` — all hot queries show Index Scan.

---

## 7. Outage response

### Immediate checks

1. **Vercel dashboard** → Deployments tab → check for failed build or OOM SIGKILL.
2. **Supabase dashboard** → Database health → look for connection pool exhaustion or slow queries.
3. **Vercel logs** → Runtime logs for the affected route → look for `AbortError`, `ECONNREFUSED`, or 5xx from upstream.

### Anthropic down

- Aria chat and briefing degrade (503 to client). POS continues.
- No action needed unless outage lasts > 1 hour.
- Check https://status.anthropic.com

### Basiq down

- Bank feed shows last-synced data. No data loss.
- Run manual sync once Basiq recovers via `/api/integrations/basiq/sync`.

### Supabase down / slow

- Entire app degrades. Check https://status.supabase.com
- If connection pool exhausted: check for runaway queries in Supabase dashboard → Query Performance.
- Increase connection pool size in Supabase project settings if needed.

### Build / deploy broken

1. Check `git log origin/main --oneline -5` for the breaking commit.
2. Run `npx tsc --noEmit` locally to find TypeScript errors.
3. Fix the error — never revert a feature to unbreak a build (RULE 0).
4. Push fix; Vercel auto-redeploys.

---

## 8. Monitoring

- **System health dashboard:** `/dashboard/system-health` — cron run history, error rates.
- **AI cost dashboard:** `/admin/ai-costs` — per-business spend, anomaly alerts.
- **Logs:** structured JSON via `src/lib/observability/logger.ts` → Vercel log drain.
- **Error capture:** `withErrorCapture` wraps all API routes → Sentry.