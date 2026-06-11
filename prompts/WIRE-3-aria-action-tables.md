# WIRE-3 — Aria Action Canonical Table Enforcement
STATUS: AWAITING-VERIFY | MODE: SOLO
Goal: Enforce correct table ownership across all three aria action tables.
      Every insert to the wrong table is a silent data consistency bug.

---

## RULE 0 — UPGRADE ONLY
Protected files (never touch): AnimatedBg, FlyToCart, CursorGlow, pos-sfx.ts, aria-voice-guide.ts

## Pre-flight
See RUNNER-PROTOCOL.md Pre-flight protocol steps 1–9.
Sibling-check: `%aria_action%`, `%agent_action%`, `%autopilot%`

## CONSTRAINT CATALOGUE
FIRST ACTION: run live SQL for all three tables.

```sql
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('aria_actions','aria_agent_actions','aria_autopilot_actions')
ORDER BY table_name, ordinal_position;

-- Row counts and status distributions
SELECT 'aria_actions' as t, status, count(*)
FROM aria_actions GROUP BY status
UNION ALL
SELECT 'aria_agent_actions', status, count(*)
FROM aria_agent_actions GROUP BY status
UNION ALL
SELECT 'aria_autopilot_actions', outcome, count(*)
FROM aria_autopilot_actions GROUP BY outcome
ORDER BY t, status;
```

Fill in results here before writing any code.

## Canonical ownership model

| Table | Purpose | Who writes | Who reads |
|---|---|---|---|
| `aria_actions` | AI recommendations for the founder | council, briefing, agents, watchdog | dashboard/autopilot cards |
| `aria_agent_actions` | Executor log: actions the agent TOOK (sent email, updated price, reordered stock) | agentic layer only | intelligence centre, audit log |
| `aria_autopilot_actions` | Outcomes: did the recommendation work? | outcome-check cron, founder feedback | learning system, model fine-tuning |

## Sprint scope

### Step 1 — Audit every write to all three tables

Grep for: `.from('aria_actions')`, `.from('aria_agent_actions')`, `.from('aria_autopilot_actions')`
For each write site, classify:
- Is this a recommendation (ai thinks business should do X)? → MUST write to aria_actions
- Is this an executor log (agent already did X)? → MUST write to aria_agent_actions
- Is this an outcome record (recommendation worked/failed)? → MUST write to aria_autopilot_actions

Flag any write that is in the wrong table; fix it.

### Step 2 — Confirm upsertAriaAction coverage

`src/lib/aria/upsert-aria-action.ts` was fixed in 9286df16 (dedup at all 17 insert sites).
Verify:
- No new direct `.from('aria_actions').insert(...)` calls have been added since 9286df16
- All insert calls go through `upsertAriaAction` or `bulkUpsertAriaActions`

### Step 3 — aria_agent_actions write discipline

Find all sites that write to aria_agent_actions. Verify:
- Only the agentic layer (action-executor.ts, action-planner.ts, action-rollback.ts) writes here
- No briefing crons write here (briefings are recommendations, not executed actions)

### Step 4 — aria_autopilot_actions completeness

Find all pending `aria_actions` that have been 'approved' by the founder (status='approved').
For each: confirm there is a corresponding aria_autopilot_actions row.
If missing → the outcome check cron is not creating the row on approval.
Fix: ensure the approval endpoint (`/api/aria/autopilot-actions` or similar) inserts to aria_autopilot_actions on approval.

### Step 5 — Stale expiry

Add a db trigger or cron logic: aria_actions rows with status='pending' and created_at < 30 days → auto-set to 'expired'.
This is also in the WATCHDOG auto-fix whitelist. Ensure the SQL is correct:
```sql
UPDATE aria_actions
SET status = 'expired', updated_at = now()
WHERE status = 'pending'
  AND created_at < now() - interval '30 days';
```
Add this to `api/cron/outcome-check` (already exists, add this clause).

### Step 6 — Document in AUDIT_STATE.md

Add section: "Aria Action Table Ownership (confirmed WIRE-3)"
with the canonical ownership model table from above.

## Aria Intelligence Rule
- aria_actions: recommendations only (use upsertAriaAction)
- aria_agent_actions: executor log only (direct insert in action-executor.ts)
- aria_autopilot_actions: outcomes only (outcome-check cron)
- Log every INSERT to aria_ai_calls where AI was involved in the decision

## Build gate
```
npx tsc --noEmit && npm run build
```

## Founder verify checklist (10 min max)
- [ ] Open Intelligence Centre → aria_actions shows recommendations, not executor logs
- [ ] Check Supabase: aria_agent_actions rows have source='executor' or 'agentic_layer'
- [ ] Approve a recommendation in UI → aria_autopilot_actions row created
- [ ] Run outcome-check cron manually → stale pending actions (>30d) become 'expired'
- [ ] `upsertAriaAction` dedup: create same recommendation twice → only one row

## Push
SOLO mode — stop before push. Write reports/sprint-WIRE-3-report.md. Founder verifies, then pushes.
