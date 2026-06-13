# Sprint GROUNDING-TEETH-V2 — Strict Ground-Truth Validation (kills model-invented numbers)
**Date:** 2026-06-14
**Status:** COMPLETE — build verified green

> V1's hole: Check 5 validates synthesis $/% against a corpus that INCLUDES the advisor outputs
> (`groundTruth: augCtx + JSON.stringify(raw_brain_outputs)`). When an advisor invents "$480/month"
> and the synthesis repeats it, "$480" appears in both → Check 5 calls it grounded → kept. V2 adds
> Check 6 (and a per-advisor cleaner) that validate against the CLEAN anchor values ONLY — the
> verified live-queried numbers, never advisor text.

---

## Files changed (3 + report)

| File | Parts |
|---|---|
| `src/lib/aria/response-validator.ts` | Part 1: `stripUngroundedNumbers` helper (citation bypass) + Check 6 + `groundTruthAnchors` arg |
| `src/app/api/aria/ask/route.ts` | Part 3: 8 new anchors + `_anchor_values`; wire `groundTruthAnchors` into the council validateAndHeal call |
| `src/lib/aria/council.ts` | Part 2: per-advisor cleaning before synthesis + `advisor_guard` logging |

---

## PRE-FLIGHT (verbatim)

### pwd
`C:\Users\kansa\aria-saas-audit` ✓

### Q2 — Check 4 / Check 5 signatures + validateAndHeal call (verbatim)

Check 4 gate (`response-validator.ts:218-222`):
```ts
if ( toolsUsed === 0 && NUMERIC_RE.test(userMessage) &&
     (CURRENCY_OUT.test(rawResponse) || PERCENT_OUT.test(rawResponse)) ) {
```
Check 5 core (`response-validator.ts:267-293`, the flawed corpus):
```ts
if (pipelinePath === 'council' && groundTruth && rawResponse.trim()) {
  const corpusNumbers = extractNumbers(groundTruth)   // ← groundTruth = augCtx + raw_brain_outputs
  const sentences = rawResponse.split(/(?<=[.!?])\s+/)
  … for each sentence: keep if every $/% number is within 2% of a corpusNumber, else strip …
}
```
validateAndHeal council call (`ask/route.ts:779-788`, pre-V2):
```ts
const councilValidated = await validateAndHeal({
  userMessage: message, blocks: councilBlocks, rawResponse: councilText,
  pipelinePath: 'council', businessId: bid, toolsUsed: councilToolCallCount,
  groundTruth: augCtx + '\n' + JSON.stringify(council.raw_brain_outputs ?? []),   // ← the V1 corpus
})
```

### Q3 — Council advisor collection (verbatim, council.ts:919-920 + 942-956)
```ts
const brains = [growth, risk, strategy, context]
const succeeded = brains.filter(b => b.succeeded)
…
GROWTH BRAIN (confidence: ${growth.confidence}):
Observations: ${growth.observations.join(' | ')}
Recommendations: ${growth.recommendations.join(' | ')}
… (risk / strategy / context same shape)
```
Each `BrainOutput` (council.ts:264-270): `{ role, observations: string[], recommendations: string[], confidence, raw, succeeded }`.

### Q4 — groundTruth construction (ask/route.ts:704-713, pre-V2 shape)
```ts
ctxParsed.available_ground_truth = {
  note: 'VERIFIED LIVE QUERIES THIS TURN — these numbers are SAFE TO CITE…',
  revenue_today, revenue_this_week_calendar, payment_coverage_real_pct, payment_coverage_note,
  customer_count_with_consent,
}
```
(4 numeric anchors. V2 adds 8 more + `_anchor_values`.)

### Q5 — Real tuesday_avg_revenue — NEEDS-DB
The spec's SQL must be run by chat Claude (no DB access here):
```sql
SELECT round(avg(daily_total), 2) FROM (
  SELECT date_trunc('day', created_at at time zone 'Australia/Sydney') as day, sum(total_amount) as daily_total
  FROM pos_sales WHERE business_id='ff5055a0-…' AND status='completed'
    AND extract(dow from created_at at time zone 'Australia/Sydney') = 2
    AND created_at >= now() - interval '56 days' GROUP BY 1) t;
```
V2 computes the SAME value at runtime (`tuesday_avg_revenue` anchor) plus `tuesday_vs_average_gap_dollars` (= tuesday_avg − overall daily avg). A "$480/month leak" survives Check 6 ONLY if 480 is within 2% of an anchor (e.g. the real gap); otherwise stripped. **Document the SQL result in the live verify.**

---

## Part-by-part (file:line)

### Part 1 — Check 6 + shared helper (`response-validator.ts`)
- `stripUngroundedNumbers(text, anchorNumbers): { healedText, stripped }` (after `extractNumbers`, ~:34): per-sentence; keeps if every $/% token (via the V1 `RISKY_NUMERIC_RE`) is within 2% of an anchor; **Part 4 bypass** — `OWNER_CITATION_RE = /you (mentioned|stated|said|told me|asked|committed|wanted|set)/i` sentences are never stripped; safety — never empties (`stripped===0 || kept===0` → no-op).
- `groundTruthAnchors?: string` added to `validateAndHeal` args (CLEAN anchors only).
- **Check 6** (after Check 5, before final return, ~:295): `if (pipelinePath==='council' && groundTruthAnchors && rawResponse.trim())` → `stripUngroundedNumbers(rawResponse, extractNumbers(groundTruthAnchors))`; on strip → append "(Some figures couldn't be verified — focus on confirmed numbers above.)", log `guard_fired:strict_groundtruth_stripped`, return healed.

### Part 2 — per-advisor cleaning (`council.ts`, after :920)
For each of the 4 brains, `stripUngroundedNumbers` over its observations + recommendations against `available_ground_truth._anchor_values` (parsed from `businessContext`; fallback = numbers from `verifiedFiguresBlock`). On strip: replace the brain's arrays with cleaned lines + `logAICallSafe({ agent_key:'advisor_guard', role:'other', provider:'other', learning_signal:'guard_fired:advisor_fabrication_stripped:<role>', … })`. Cleaned advisor text then flows into the synthesis input (so Check 5's corpus is already clean too). Wrapped in try/catch — never blocks the council.

### Part 3 — expanded anchors (`ask/route.ts:684-765`)
8 new fields + 7 new parallel queries: `revenue_last_week_calendar`, `same_week_last_month` (calendar Mon-aligned, consistent with WEEK-1/SWLM-1), `total_customer_count`, `top_customer_lifetime_values[]`, `tuesday_avg_revenue` + `tuesday_vs_average_gap_dollars` (56-day completed sales bucketed to AEST days, Tuesday avg minus overall daily avg), `target_weekly_revenue` (businesses.weekly_revenue_target), `recent_promotion_actions` (completed promo aria_actions, 30d). New `_anchor_values: number[]` = the flat clean numeric set both validators use.

### Part 4 — owner-citation bypass
Implemented inside `stripUngroundedNumbers` (`OWNER_CITATION_RE`) — a sentence citing the owner ("you mentioned/stated/said/…") is kept even if it contains a number, because that number is grounded in aria_business_memory, not invented.

## Additive-only confirmation
Check 4 and Check 5 are **byte-identical** (Check 6 is a new block after them; the `groundTruth` corpus still feeds Check 5 unchanged). `groundTruthAnchors` is a NEW optional arg (deliverable/main callers unaffected). The 4 original anchors are unchanged — 8 added. Advisor cleaning is a new try/catch block; the brains' synthesis-input formatting is unchanged. No anchor TYPES changed (only added). No advisor prompts touched. No dependencies. RULE 0 ✓.

## Test cases through Check 6 (anchors e.g. {7, 4446.90, 615.50, 95.0, 11, 37, 320.00=tueAvg, 180.00=tueGap, [890.50, 540.00 LTVs]})

| # | Synthesis/advisor sentence | Decision |
|---|---|---|
| 1 | "Tuesday afternoons are costing you **$480**/month." | 480 ∉ anchors (gap is 180) → **STRIP** (the live V1 escape, now caught) |
| 2 | "POS reconciliation sits at **19%**." | 19 ∉ anchors → **STRIP** |
| 3 | "You're **5×** below your usual midweek take." | 5 ∉ anchors → **STRIP** |
| 4 | "This week you've made **$615.50** vs **$4,446.90** same week last month." | 615.50 ✓ + 4446.90 within 2% of 4446.90 ✓ → **KEEP** |
| 5 | "You **mentioned** wanting to hit **$890** weekly." | OWNER_CITATION_RE matches → **KEEP** (Part 4 bypass, even though 890 might not be an anchor) |

Bonus: "Your top customer has spent **$890.50** lifetime." → 890.50 ∈ top_customer_lifetime_values → KEEP.

## Build gate
- `npx tsc --noEmit` → **0 errors** ✓
- `npm run build` → **PASS** ✓
- Commit: **STOP BEFORE PUSH**

## Verify post-deploy
Fresh chat "how am I doing this week?" → no "$480/month leak", no invented %, real numbers ($7, $4,446.90, LTVs, 11/37) preserved, qualitative framing preserved.
```sql
select created_at, agent_key, learning_signal, left(response_summary,80) as resp
from aria_ai_calls
where business_id='ff5055a0-c351-4ada-817a-1804961035f3'
  and created_at > now() - interval '10 minutes'
  and agent_key in ('advisor_guard','heal','council_synthesis','council_cache')
order by created_at desc;
```
Pass: `advisor_guard` rows (learning_signal `guard_fired:advisor_fabrication_stripped:<role>`) when Check 6 stripped at the advisor stage; a `heal` row with `guard_fired:strict_groundtruth_stripped` if it stripped at synthesis. (Both now actually LAND post-LOGGING-AUDIT-3 — role/provider='other' are valid.)
