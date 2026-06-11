# Aria OS — WATCHDOG Protocol
Twice-daily automated audit. Run at 06:00 and 18:00 AEST.
Any findings that are NOT on the AUTO-FIX WHITELIST go to a report + proposed-fix prompt.
Never commit a watchdog fix directly to main.

---

## 1. Pull & baseline

```
git pull origin main
git log --oneline -5          # confirm up to date
```

## 2. Build gate

```
npx tsc --noEmit              # MUST be zero errors
npm run build                 # MUST exit 0
npx next lint --max-warnings 0  # MUST be zero warnings (auto-fixable ones run below)
```

If build fails: create `reports/watchdog-YYYY-MM-DD-HH.md` with exact error output.
Do NOT commit a fix to main. Create a `watchdog/fix-YYYY-MM-DD` branch with a proposed fix prompt.

## 3. Sentry unresolved

```bash
# Requires SENTRY_AUTH_TOKEN + SENTRY_ORG in env
npx @sentry/cli issues list --project ariaos --status unresolved --limit 20
```

Flag any issue that:
- Appeared in the last 24 hours AND
- Has user_count > 0 AND
- Is not already in a `watchdog/` branch

## 4. Wiring SQL suite

Run against the live Supabase project (service role). Copy results into the report.

### 4a. Schema drift check
```sql
-- Tables referenced in code that no longer exist
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
-- Compare against AUDIT_STATE.md "Total DB tables (341)" baseline
-- Flag any table count change > 5 from baseline
```

### 4b. Headless RLS check
```sql
-- Spot-check that key tables have RLS enabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'businesses','pos_sales','pos_products','staff_members',
    'aria_actions','aria_daily_briefings','pos_customers',
    'pos_timesheets','pos_sale_items'
  )
ORDER BY tablename;
-- Alert if rowsecurity = false for any of the above
```

### 4c. Payment health
```sql
-- Stripe webhook processing (last 24 hours)
SELECT count(*) as total,
       sum(case when status = 'processed' then 1 else 0 end) as ok,
       sum(case when status = 'failed' then 1 else 0 end) as failed
FROM stripe_webhook_events
WHERE created_at > now() - interval '24 hours';
-- Alert if failed > 0
```

### 4d. Aria action pending counts (per canonical table)
```sql
-- aria_actions (recommendations) — should not accumulate
SELECT count(*) as pending_recommendations,
       count(case when created_at < now() - interval '30 days' then 1 end) as stale_30d
FROM aria_actions WHERE status = 'pending';

-- aria_agent_actions (executor) — completed or failed; pending > 50 is a backlog warning
SELECT count(*) as pending_executor_actions
FROM aria_agent_actions WHERE status = 'pending';

-- aria_autopilot_actions (outcomes) — all should be resolved
SELECT count(*) as unresolved_outcomes
FROM aria_autopilot_actions WHERE outcome IS NULL OR outcome = 'pending';
```

### 4e. Briefing write health
```sql
-- Confirm briefings wrote for each business yesterday
SELECT b.name, adb.briefing_date, adb.generated_at
FROM businesses b
LEFT JOIN aria_daily_briefings adb
  ON adb.business_id = b.id
  AND adb.briefing_date = current_date - 1
WHERE b.is_active = true
  AND b.morning_briefing_enabled = true
  AND adb.id IS NULL;
-- Alert for every business in the result (missed morning briefing)
```

### 4f. AI call failure rates (last 24 hours)
```sql
SELECT agent_key,
       count(*) as calls,
       sum(case when success = false then 1 else 0 end) as failures,
       round(100.0 * sum(case when success = false then 1 else 0 end) / count(*), 1) as failure_pct
FROM aria_ai_calls
WHERE created_at > now() - interval '24 hours'
GROUP BY agent_key
ORDER BY failure_pct DESC;
-- Alert if failure_pct > 15% for any agent_key
```

### 4g. Vercel cron coverage
```
# Diff vercel.json crons against route files
node -e "
  const v = JSON.parse(require('fs').readFileSync('vercel.json'));
  const fs = require('fs');
  const missing = v.crons.filter(c => {
    const p = 'src/app/' + c.path.replace('/api/', 'api/') + '/route.ts';
    return !fs.existsSync(p);
  });
  if (missing.length) { console.error('MISSING CRON ROUTES:', missing); process.exit(1); }
  console.log('All cron routes present');
"
```

---

## 5. Auto-fix whitelist

The ONLY changes a watchdog run may commit automatically (to a `watchdog/autofix-YYYY-MM-DD` branch, NOT main):

| Fix | Command |
|---|---|
| ESLint auto-fixable lint errors | `npx next lint --fix` |
| Dead import removal (if tsc flags unused import) | Edit specific file only |
| Stale aria_actions expiry (>30 days pending → expired) | SQL: `UPDATE aria_actions SET status='expired', updated_at=now() WHERE status='pending' AND created_at < now()-interval'30 days'` |

Everything else → report only, no auto-fix.

---

## 6. Report format

Create `reports/watchdog-YYYY-MM-DD-HH.md`:

```markdown
# Watchdog — YYYY-MM-DD HH:00 AEST

## Build
- [ ] tsc: N errors
- [ ] build: PASS/FAIL
- [ ] lint: N warnings

## Sentry
- N new unresolved issues in last 24h (list titles)

## Wiring SQL
- Schema drift: N tables (baseline 341, now N)
- RLS gaps: [list tables with rowsecurity=false]
- Payment failures: N
- Pending recommendations (aria_actions): N (stale: N)
- Pending executor (aria_agent_actions): N
- Unresolved outcomes (aria_autopilot_actions): N
- Missed briefings: [list business names]
- Highest AI failure rate: agent_key at N%

## Auto-fixes applied
- [list or "none"]

## Proposed fix prompts committed to watchdog/ branch
- [list or "none"]
```

---

## 7. Branch discipline

- Watchdog findings → `watchdog/YYYY-MM-DD/` branch only
- Auto-fixes → `watchdog/autofix-YYYY-MM-DD` branch, PR to main, founder approves
- NEVER push watchdog output directly to main
- NEVER use `--force` or `--no-verify` in watchdog operations
