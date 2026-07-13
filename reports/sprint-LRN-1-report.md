# Sprint LRN-1 — Learning & Outcome Tracking Pipeline
**Date:** 2026-06-11
**Mode:** SOLO
**Build gate:** ✅ `npx tsc --noEmit` → 0 errors | `npx next build` → PASS
**Commit:** `3e4bc33d` (8 files, 351 insertions)

---

## Goal
Close the feedback loop so Aria learns whether its recommendations worked.
Every approved recommendation now gets outcome tracking; resolved verdicts feed back into council prompts and daily briefings.

---

## DB schema changes (applied via Supabase MCP)

| Table | Column added | Type | Purpose |
|---|---|---|---|
| `aria_autopilot_actions` | `outcome` | text | 'pending' / 'positive' / 'negative' / 'unknown' |
| `aria_autopilot_actions` | `founder_feedback` | text | Free-text note from founder via 👍/👎 UI |
| `aria_autopilot_actions` | `action_id` | uuid → aria_actions.id | Links autopilot tracking row to source recommendation |
| `aria_ai_calls` | `learning_signal` | text | 'positive' / 'negative' / 'unknown' / 'clicked' — written at outcome resolution |

Indexes: `idx_apa_outcome` on `(business_id, outcome, created_at DESC)` · `idx_ai_calls_learning` (partial) on non-null learning_signal rows.

---

## Step 1 — Outcome-check cron enrichment ✅

**`src/lib/aria/hypothesis/outcome-learning.ts`**
- Added `runAutopilotOutcomeChecks(businessId)`:
  - **Phase 1 backfill**: finds `aria_actions` with `status='approved'` that have no linked `aria_autopilot_actions` (checked via `action_id` or `triggered_by` fallback), creates row with `outcome='pending'`
  - **Phase 2 resolution**: for rows with `outcome='pending'` and `created_at < 7 days ago`:
    - Revenue/pricing/marketing/promotions → compares 7d-before vs 7d-after revenue; `delta > 5%` → positive, `delta < -5%` → negative, else unknown
    - Stock/inventory → checks if `pos_products.stock_quantity <= 2` cleared; 0 low-stock → positive
    - On resolution: marks linked `aria_actions.status = 'completed'`, writes `aria_ai_calls.learning_signal` for matching council agent
- Updated `onActionApproved`: new `aria_autopilot_actions` rows now include `action_id` and `outcome='pending'`

**`src/app/api/cron/outcome-check/route.ts`**
- Runs `runAutopilotOutcomeChecks` in parallel with existing `runOutcomeChecks`
- Response includes `autopilot_backfilled` and `autopilot_resolved` counts

---

## Step 2 — Founder feedback button ✅

**`src/app/api/aria/action-feedback/route.ts`** (new)
- POST endpoint — 3 modes:
  1. `{ id, feedback: 'positive'|'negative', founder_note? }` → updates `aria_autopilot_actions.outcome + founder_feedback`, marks `aria_actions` completed, writes `learning_signal` to latest council call
  2. `{ id, event: 'clicked' }` → appends click timestamp to `outcome_data`
  3. `{ business_id, event: 'clicked', prompt? }` → briefing-card click with no action ID; logs `learning_signal='clicked'` to latest council call
- Ownership check: `businesses.user_id = auth.user.id` before any write

**`src/app/dashboard/autopilot/page.tsx`**
- Added `outcome?: string | null` to `AutopilotAction` interface
- Added `feedbackSaving` state + `submitFeedback()` handler
- History tab: 👍 / 👎 quick-feedback buttons shown on all cards without an `outcome` set
- Shows resolved outcome label once set: "✓ Marked as worked" / "✗ Marked as not worked"

---

## Step 3 — Briefing click-through tracking ✅

**`src/components/dashboard/AriaBriefingCard.tsx`**
- `BlockRenderer` now receives an `onChoice` handler
- When a "Do it ↗" button is clicked, fires `POST /api/aria/action-feedback` with `{ business_id, event: 'clicked', prompt }`
- Fire-and-forget (`.catch(() => {})`) — never blocks the UI

---

## Steps 4+5 — Agent learning context in council ✅

**`src/lib/aria/council.ts`**
- Added `getRecentLearningContext(businessId)`:
  - Queries last 5 `aria_ai_calls` rows where `learning_signal IS NOT NULL` for this business
  - Returns ≤200-char prefix: "RECENT OUTCOME SIGNALS (last N resolved): X positive, Y negative, Z uncertain. [tone note]"
  - Capped at 5 rows, non-fatal, never cross-business (business_id filter enforced)
- Fetched in parallel with quality/memories/summaries (no latency cost)
- Injected as first item in `userPrompt` so all 4 brains see it

---

## Step 6 — Briefing RECENT WINS ✅

**`src/app/api/cron/generate-briefings/route.ts`**
- `generateMorning`: fetches top 3 `aria_autopilot_actions` where `outcome='positive'` and `created_at` within last 30 days for this business
- Added `RECENT WINS: [title1] | [title2]` line to `structuredPrefix`
- Only present when positive outcomes exist — no noise when empty
- Upserted into `aria_daily_briefings.content` as part of `enrichedContent`

---

## Files changed

| File | Change |
|---|---|
| `supabase/migrations/20260611_lrn1_outcome_columns.sql` | New — 4 columns + 2 indexes |
| `src/lib/aria/hypothesis/outcome-learning.ts` | Add runAutopilotOutcomeChecks + update onActionApproved |
| `src/app/api/cron/outcome-check/route.ts` | Call runAutopilotOutcomeChecks in parallel |
| `src/app/api/aria/action-feedback/route.ts` | New — POST endpoint for feedback + click events |
| `src/app/dashboard/autopilot/page.tsx` | Add 👍/👎 feedback buttons to history tab |
| `src/components/dashboard/AriaBriefingCard.tsx` | Wire BlockRenderer onChoice for click tracking |
| `src/lib/aria/council.ts` | Add getRecentLearningContext + inject into brain prompt |
| `src/app/api/cron/generate-briefings/route.ts` | Add RECENT WINS to morning briefing prefix |

---

## Founder verify checklist (15 min max)

- [ ] Approve a recommendation in `/dashboard/autopilot` → check Supabase `aria_autopilot_actions` for new row with `outcome='pending'`, `action_id` set
- [ ] Run outcome-check cron (`GET /api/cron/outcome-check` with Bearer token) → response includes `autopilot_backfilled` + `autopilot_resolved`
- [ ] On an approved action in history tab → 👍/👎 buttons visible
- [ ] Click 👍 → outcome label changes to "✓ Marked as worked"; Supabase row shows `outcome='positive'`
- [ ] Open `/dashboard` → click a "Do it ↗" action button in briefing → check `aria_ai_calls` for `learning_signal='clicked'`
- [ ] No cross-business data in learning context (verify SQL has `business_id` filter — see `getRecentLearningContext`)
- [ ] Next morning briefing (after a positive outcome exists) → content includes "RECENT WINS:" line

---

## Push instruction
```
git push origin main
git log origin/main..HEAD   # must be empty
```
Then update `prompts/MANIFEST.md` and `prompts/LRN-1-outcome-tracking.md` STATUS to AWAITING-VERIFY.
