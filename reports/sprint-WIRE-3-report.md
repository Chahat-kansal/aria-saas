# Sprint WIRE-3 — Aria Action Canonical Table Enforcement
**Date:** 2026-06-11
**Mode:** SOLO
**Build gate:** ✅ `npx tsc --noEmit` → 0 errors | `npx next build` → PASS

---

## Constraint catalogue (pre-flight)

### Table schemas (from `src/types/database.types.ts`, confirmed)

**`aria_actions`** — Recommendations for the founder  
Columns: `business_id, category, confidence (text), created_at, executed_by_user_id, expected_impact, id, payload, priority, reason, recommendation, rollback_data, rolled_back_at, source, status, title, triggered_by, updated_at`

**`aria_agent_actions`** — Executor log  
Columns: `action_input, action_output, action_type, agent_name, approved, approved_at, approved_by, business_id, council_run_id, created_at, error_detail, executed, executed_at, id, risk_level`

**`aria_autopilot_actions`** — Outcome/autopilot records  
Columns: `action_data, action_type, agent_type, approved_at, business_id, category, channel, confidence (numeric), customer_id, description, estimated_impact, executed_at, expires_at, id, message_sent, offer_type, outcome_data, outcome_note, outcome_revenue_cents, priority, proposal_id, reasoning, status, summary, target_count, target_date, tier, title, triggered_by`

**`aria_outcomes`** — Quantitative outcome learning  
Columns: `business_id, action_id, recommendation_type, recommendation_detail, recommended_at, acted_on, acted_on_at, category, baseline_metric_cents, outcome_7d_cents, outcome_30d_cents, outcome_verdict, outcome_checked_at`

---

## Step 1 — Write-site audit

### aria_actions inserts

| File | Status | How |
|---|---|---|
| `src/lib/aria/upsert-aria-action.ts` | ✅ Canonical | `upsertAriaAction()` + `bulkUpsertAriaActions()` |
| `src/app/api/aria/ask/route.ts:180` | ✅ OK | `status='proposed'` — non-pending, direct insert correct |
| `src/lib/aria/ask/action-executor.ts:418` | ✅ OK | `status='executed'` for Brain panel — non-pending, correct |
| `src/app/api/cron/aria-health-monitor/route.ts:389` | **FIXED** | `status='pending'` with manual dedup → converted to `upsertAriaAction()` |
| `src/app/api/cron/price-schedules/route.ts:59` | ✅ OK | `status='completed'` — non-pending |
| `src/app/api/staff/roster/publish/route.ts:106` | ✅ OK | `status='completed'` — non-pending |
| `src/lib/staff/timesheets.ts:89` | ✅ OK | `status='completed'` — non-pending |

**Rule confirmed**: Only `status='pending'` inserts require dedup via `upsertAriaAction`. Non-pending inserts (completed, executed, proposed) are direct inserts — correct by design, no dedup needed.

### aria_agent_actions inserts

All writes are from the agentic layer — correct ownership:
- `src/lib/aria/agents/automation-agent.ts` — executor only ✅
- `src/lib/aria/agents/message-agent.ts` — executor only ✅  
- `src/lib/aria/agents/query-agent.ts` — executor only ✅

`aria-health-monitor/route.ts` reads `aria_agent_actions` for counts (no insert) — correct.

### aria_autopilot_actions inserts

40+ write sites across feature-level agents (CLV, flash-revenue, reputation, booking, SEO, etc.). All are business-intelligence outcome events being surfaced in their respective dashboards. These writes are correct — `aria_autopilot_actions` has accumulated a dual role as both autopilot recommendation log and feature-level outcome record. Per RULE 0, these writes are not moved.

---

## Step 2 — upsertAriaAction coverage ✅

**Fix applied**: `src/app/api/cron/aria-health-monitor/route.ts`

Before: manual dedup check (select → if exists skip → else direct insert)  
After: `upsertAriaAction({...})` — deduplicates by `business_id + category + title[0:60]` AND refreshes the existing row's fields (better than skip).

Removed: manual `supabaseAdmin.from('aria_actions').select(...).ilike(...)` dedup block.

---

## Step 3 — aria_agent_actions write discipline ✅

Confirmed: only `automation-agent.ts`, `message-agent.ts`, `query-agent.ts` write to `aria_agent_actions`. No briefing crons write here. No reclassification needed.

---

## Step 4 — aria_autopilot_actions completeness ✅

**Finding**: The approval endpoint (`/api/aria/actions/[id]` PATCH with `status='approved'`) already calls `onActionApproved()` → inserts to `aria_outcomes` (the correct quantitative tracking table with `baseline_metric_cents`, `outcome_7d_cents`, `outcome_30d_cents`, `outcome_verdict`).

**Fix applied**: Added `aria_autopilot_actions` insert inside `onActionApproved()` — fires immediately when a founder approves an `aria_actions` row. This makes the Autopilot dashboard reflect approved recommendations:
- `action_type: 'aria_recommendation_approved'`
- Maps `confidence: 'high'/'medium'/'low'` string → `0.9/0.7/0.5` numeric (schema difference)
- `triggered_by: 'aria_actions:' + actionId` (traceable back to source)

---

## Step 5 — Stale expiry ✅

**Fix applied**: `src/app/api/cron/outcome-check/route.ts`

Added at the start of the cron handler (before business loop):
```typescript
await supabaseAdmin
  .from('aria_actions')
  .update({ status: 'expired', updated_at: new Date().toISOString() })
  .eq('status', 'pending')
  .lt('created_at', thirtyDaysAgo)
```

Expires all `status='pending'` rows older than 30 days on every cron run (daily). Non-fatal — logs error but continues if this fails.

---

## Step 6 — AUDIT_STATE.md updated ✅

Added section: **"Aria Action Table Ownership (confirmed WIRE-3)"** including:
- Canonical ownership table (4 tables: aria_actions, aria_agent_actions, aria_autopilot_actions, aria_outcomes)
- Dedup rule (must use upsertAriaAction for pending inserts)
- Stale expiry rule

---

## Files changed

| File | Change |
|---|---|
| `src/app/api/cron/aria-health-monitor/route.ts` | Add import + replace manual dedup+insert with `upsertAriaAction()` |
| `src/app/api/cron/outcome-check/route.ts` | Add 30-day stale expiry before business loop |
| `src/lib/aria/hypothesis/outcome-learning.ts` | Add `aria_autopilot_actions` insert in `onActionApproved()` |
| `AUDIT_STATE.md` | Add canonical ownership section |
| `prompts/WIRE-3-aria-action-tables.md` | STATUS: READY → AWAITING-VERIFY |
| `prompts/MANIFEST.md` | WIRE-3 → AWAITING-VERIFY |

---

## Founder verify checklist

- [ ] **Intelligence Centre / Actions** → `aria_actions` shows recommendations with correct categories (no executor logs mixed in)
- [ ] **Approve a recommendation** → `aria_outcomes` row created + new `aria_autopilot_actions` row with `action_type='aria_recommendation_approved'`
- [ ] **Autopilot dashboard** → approved recommendations from `aria_actions` now appear here
- [ ] **Run outcome-check cron manually** → check Supabase: any `aria_actions` with `status='pending'` and `created_at < 30 days ago` should now show `status='expired'`
- [ ] **Health monitor cron** → red checks create `aria_actions` rows via `upsertAriaAction` (check logs for "RED action upserted" messages)
- [ ] **No duplicate system_health actions** — trigger health monitor twice → same check produces one row (refreshed), not two

---

## Push instruction
```
git add src/app/api/cron/aria-health-monitor/route.ts \
  src/app/api/cron/outcome-check/route.ts \
  src/lib/aria/hypothesis/outcome-learning.ts \
  AUDIT_STATE.md \
  prompts/WIRE-3-aria-action-tables.md \
  prompts/MANIFEST.md \
  reports/sprint-WIRE-3-report.md
git commit -m "fix(wire-3): aria action table canonical enforcement — upsertAriaAction in health-monitor, stale expiry, autopilot row on approval"
git push origin main
```
