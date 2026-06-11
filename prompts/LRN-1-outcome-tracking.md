# LRN-1 — Learning & Outcome Tracking Pipeline
STATUS: READY | MODE: SOLO
Pre-condition: WIRE-3 complete (aria_autopilot_actions ownership confirmed)
Goal: Close the feedback loop — Aria learns whether its recommendations worked.

---

## RULE 0 — UPGRADE ONLY
Protected files (never touch): AnimatedBg, FlyToCart, CursorGlow, pos-sfx.ts, aria-voice-guide.ts

## Pre-flight
See RUNNER-PROTOCOL.md Pre-flight protocol steps 1–9.
Sibling-check: `%autopilot%`, `%outcome%`, `%learning%`

## CONSTRAINT CATALOGUE
FIRST ACTION: run live SQL for all outcome-related tables.

```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('aria_autopilot_actions','aria_actions','aria_ai_calls')
ORDER BY table_name, ordinal_position;

-- Current outcome distribution
SELECT outcome, count(*) FROM aria_autopilot_actions GROUP BY outcome ORDER BY count DESC;

-- Actions approved but no outcome yet
SELECT aa.id, aa.title, aa.category, aa.created_at
FROM aria_actions aa
LEFT JOIN aria_autopilot_actions apa ON apa.action_id = aa.id
WHERE aa.status = 'approved'
  AND apa.id IS NULL
LIMIT 20;
```

Fill in results here.

## Sprint scope

### Step 1 — Outcome check cron enrichment

`src/app/api/cron/outcome-check/route.ts`

Current behaviour: checks completed autopilot actions for outcome.
Required additions:
1. For each `aria_actions` row with `status='approved'` and no matching `aria_autopilot_actions` row:
   - Create the `aria_autopilot_actions` row with `outcome='pending'`, `action_id=aria_actions.id`
   - This ensures every approved recommendation gets tracked
2. For each `aria_autopilot_actions` row with `outcome='pending'` and `created_at` > 7 days:
   - Fetch the business's revenue for the 7 days before vs 7 days after the recommendation date
   - Compare: if revenue delta > 5% AND the recommendation category was 'revenue' → outcome='positive'
   - If the action category was 'stock' → check if stock alert cleared
   - If no signal is available → outcome='unknown'
3. Update `aria_actions.status` from 'approved' → 'completed' when outcome is resolved

### Step 2 — Founder feedback button

On the `/dashboard/autopilot` (or wherever aria_actions are displayed):
- Add a 👍 / 👎 feedback button on each completed recommendation card
- POST `/api/aria/action-feedback` → updates aria_autopilot_actions.outcome to 'positive'/'negative', stores founder_note
- No new table needed — use existing aria_autopilot_actions columns (or add `founder_feedback text` column if not present)

Check if `aria_autopilot_actions.founder_feedback` exists; if not: migration.

### Step 3 — Briefing click-through tracking

In `AriaBriefingCard.tsx`: when user clicks a recommendation's action button:
- POST `/api/aria/action-feedback` with `action_id`, `event='clicked'`
- This feeds into LRN-1's outcome signal (clicked = engaged = slightly positive signal)

### Step 4 — Agent learning summary

Add to `aria_ai_calls` a `learning_signal` field (nullable text).
When outcome-check resolves an outcome:
- Update the most recent `aria_ai_calls` row for the same action's `agent_key`:
  `learning_signal = 'positive' | 'negative' | 'unknown'`
- This allows future context windows to be prefixed with: "This agent's last 3 actions: 2 positive, 1 unknown"

Check if `aria_ai_calls.learning_signal` exists; if not: migration.

### Step 5 — Good/bad examples in system prompts

In the aria council system prompts (`src/lib/aria/council.ts` or similar):
- Add a function `getRecentLearningContext(businessId)` that fetches the last 5 `aria_ai_calls` rows
  with resolved `learning_signal` for the same agent
- Prepend to the system prompt: "Recent outcome signals for this business: ..."
- Cap at 200 chars to avoid token waste

### Step 6 — Briefing data feed

Add to `generate-briefings/route.ts` `generateMorning`:
- Fetch top 3 recent positive outcomes from `aria_autopilot_actions` for context
- Include in the enrichedContent prefix: "RECENT WINS: [outcome.title] worked (+revenue)"

## Aria Intelligence Rule
- All outcome queries → `supabaseAdmin` (cross-business analytics, bypasses RLS intentionally)
- Log the outcome-check LLM call (if any) to `aria_ai_calls` with agent_key='outcome_check'
- `aria_autopilot_actions` = outcomes table (WIRE-3 confirms); do not write to aria_actions here
- Good/bad examples must be drawn from THIS business's data only (never cross-business)

## Build gate
```
npx tsc --noEmit && npm run build
```

## Founder verify checklist (15 min max)
- [ ] Approve a recommendation in autopilot → aria_autopilot_actions row created with outcome='pending'
- [ ] Run outcome-check cron → pending outcome with 7+ days gets resolved
- [ ] 👍 feedback button on completed recommendation → updates outcome to 'positive'
- [ ] Click a briefing recommendation action button → click event recorded
- [ ] Next day's briefing includes a "RECENT WINS" section (if any positive outcomes)
- [ ] No cross-business data in learning context (verify SQL has business_id filter)

## Push
SOLO mode — stop before push. Write reports/sprint-LRN-1-report.md. Founder verifies, then pushes.
