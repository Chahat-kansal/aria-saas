# Sprint I2 — GOAL-AWARE-1 (weekly target + trajectory in groundTruth)
**Date:** 2026-06-14
**Status:** COMPLETE — build verified green
**Dependency:** I1 HEALTH-SIGNALS (groundTruth shape) — present. RULE 0 UPGRADE_ONLY.

> Same additive pattern as I1: a new diagnostic FACT (the owner's weekly-target trajectory) joins
> groundTruth so the council coaches against the goal instead of just analysing. NEVER invents a
> target — `status='no_target'` when the column is null, and the synthesis pointer says to ask.

---

## Files changed (2 + report)
| File | Parts |
|---|---|
| `src/lib/aria/goal-context.ts` | NEW — Part 1: `computeGoalContext(businessId)` |
| `src/app/api/aria/ask/route.ts` | Parts 2/4: `goal_context` in groundTruth + anchors + `goal_context` log |
| `src/lib/aria/council.ts` | Part 3: ONE GOAL_CONTEXT line in the SYNTHESIS input only |

---

## PRE-FLIGHT (verbatim)

### 1. pwd
`C:\Users\kansa\aria-saas-audit` ✓

### 2. I1 health-signals.ts pattern — confirmed
`computeHealthSignals(businessId): Promise<HealthSignals>` — self-contained, reads existing tables, returns a structured object joined into `available_ground_truth`, exposes `_anchor_numbers`. I2 mirrors this exactly (`computeGoalContext`).

### 3. groundTruth construction site (post-I1, ask/route.ts — verbatim, where goal_context joins)
```ts
ctxParsed.available_ground_truth = {
  note, revenue_today, revenue_this_week_calendar, revenue_last_week_calendar, same_week_last_month,
  payment_coverage_real_pct, payment_coverage_note, customer_count_with_consent, total_customer_count,
  top_customer_lifetime_values, tuesday_avg_revenue, tuesday_vs_average_gap_dollars, target_weekly_revenue,
  recent_promotion_actions,
  business_health: gtHealth ?? undefined,
  diagnostic_facts_note: '…',
  goal_context: gtGoal ?? undefined,        // ← I2
  _anchor_values: anchorValues,             // includes ...goalAnchors
}
```
`computeGoalContext(bid).catch(() => null)` was added to the existing anchor `Promise.all`, captured as `gtGoal`.

### 4. Businesses with targets set — NEEDS-DB (chat-Claude)
`SELECT business_id, weekly_revenue_target FROM businesses WHERE weekly_revenue_target IS NOT NULL;` — `weekly_revenue_target` is the existing numeric column (also read by WEEK-1's facts-packet). `computeGoalContext` returns `status='no_target'` for any business where it's null — **no default invented**.

---

## Part 1 — computeGoalContext (goal-context.ts)
Reads `businesses.weekly_revenue_target` + this-week revenue (WEEK-1 calendar window: Mon 00:00 AEST → now, `neq('status','voided')`) + yesterday's revenue. Computes:
- **days_remaining_in_week**: `6 − dowMon` (Mon=0…Sun=6; 0 on Sunday); `daysElapsed = dowMon + 1` (today counts).
- **projected_eow_revenue**: linear — `(revenue_so_far / daysElapsed) × 7`. **Late-week guard** (documented): when `days_remaining < 3`, capped at `min(projected, revenue_so_far × 2)` to stop a tiny denominator over-extrapolating. `projection_method='linear'` (the `dow_weighted` literal is reserved for a future variant using I1's dow baselines — not changing the math silently).
- **on_track_pct** = projected / target × 100; **gap_to_target** = target − projected; **pace_required** = (target − so_far) / max(1, days_remaining).
- **status**: ahead ≥110, on_track [90,110), behind [70,90), critical <70, **no_target** (target null).
- **reasoning**: one-liner ("This week $X of $Y target; projecting $Z (N% — behind). $G short; need $P/day over the D day(s) left.").

## Part 2 — surfaced to groundTruth (route.ts)
`goal_context = gtGoal`. `goalAnchors` (weekly_target, projected_eow_revenue, gap_to_target, pace_required, on_track_pct, revenue_this_week, yesterday_actual — finite-filtered) spread into `_anchor_values`, so V2 Check 6 validates any target/projection figure the synthesis cites.

## Part 3 — synthesis-only fact-pointer (council.ts), verbatim
> `GOAL_CONTEXT: The owner's weekly target trajectory is in goal_context. Frame your recommendation against the gap or pace required if relevant. If goal_context.status="no_target", do NOT invent a target — ask the owner what their target is.`

Added to `synthesisInput` ONLY (NOT the advisor `userPrompt`, per spec). No advisor system prompt touched. Not a phrasing script — points at the fact + forbids inventing a target.

## Part 4 — logAICallSafe
`{ agent_key:'goal_context', role:'analysis', provider:'other', request_summary: bid, response_summary: {status, on_track_pct, gap_to_target} }` — valid CHECK values (lands).

## Sample goal_context for Sip (with target set to $4,500 — NEEDS-DB to confirm live)
```json
{ "weekly_target": 4500, "revenue_this_week": 7.00, "days_remaining_in_week": <D>,
  "projected_eow_revenue": <~ linear from $7>, "projection_method": "linear",
  "on_track_pct": <~0.2>, "gap_to_target": <~4486>, "pace_required": <~ (4500-7)/D>,
  "yesterday_actual": <Y>, "status": "critical",
  "reasoning": "This week $7.00 of $4500.00 target; projecting $X (0.2% — critical). $4486 short; need $P/day over the D day(s) left." }
```
With no target set: `{ "weekly_target": null, "status": "no_target", "reasoning": "No weekly revenue target set… Ask the owner what target they want…" }`.

## Additive / DO-NOT compliance
New module + new groundTruth field + new anchors + ONE synthesis line + one log row. **No default target invented** (null → no_target). Projection math documented (linear + late-week cap). No advisor prompt changed (synthesis-only line). No `businesses` schema change. No dependencies. RULE 0 ✓.

## Build gate
- `npx tsc --noEmit` → **0 errors** ✓
- `npm run build` → **PASS** ✓
- Commit: **STOP BEFORE PUSH**

## Verify post-deploy
1. `update businesses set weekly_revenue_target = 4500 where id='ff5055a0-…';`
2. Fresh chat "how am I doing this week?" → Aria frames "$7 vs $4,500 target — projecting to fall short by ~$X / critical", no invented target; asks to adjust if owner raises concern.
3. `select agent_key, response_summary from aria_ai_calls where agent_key='goal_context' and business_id='ff5055a0-…' and created_at > now() - interval '5 minutes';` → row with `{status, on_track_pct, gap_to_target}`.
