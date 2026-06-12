# Sprint GROUNDING-TEETH — Code-Level Fabrication Detection on Council Output
**Date:** 2026-06-13
**Status:** COMPLETE — build verified green
**Dependency:** PUSHBACK-FIX-1 (`3a31f7a8`) + WEEK-1-EXTEND (`38924808`) — both pushed.

---

## Files changed (2 + report)

| File | Parts |
|---|---|
| `src/lib/aria/response-validator.ts` | Part 1: Check 5 (fabrication scan) + `groundTruth?` arg + `fabrication_stripped` HealReason + `extractNumbers` helper |
| `src/app/api/aria/ask/route.ts` | Part 2: AVAILABLE_GROUND_TRUTH anchors in council context; Part 3: minimal-context suppression; groundTruth corpus wired into the council validateAndHeal call; date-au import |

---

## PRE-FLIGHT (verbatim)

### pwd
`C:\Users\kansa\aria-saas-audit` ✓

### Q2 — validateAndHeal signature (response-validator.ts:54, pre-edit)

```ts
export async function validateAndHeal(args: {
  userMessage: string
  blocks: AskBlock[] | null
  rawResponse: string
  pipelinePath: 'main' | 'deliverable' | 'council'
  businessId: string
  toolsUsed: number
}): Promise<{
  blocks: AskBlock[]
  healed: boolean
  healReason?: HealReason
  healLatencyMs?: number
  healedText?: string
}>
```
Check 4 (ungrounded_numeric, GROUND-1) sits last before the final `return { blocks, healed: false }` — **Check 5 inserted directly after it**, before that return. Post-edit signature adds one optional field: `groundTruth?: string`.

### Q3 — Council context assembly (council.ts:818-828, verbatim)

```ts
  // Strip aria_facts_packet from context passed to brains — it's already formatted in verifiedFiguresBlock
  let cleanContextStr = businessContext
  try {
    const cleanCtxObj = { ...(safeParseJSON(businessContext) ?? {}) } as Record<string, unknown>
    delete cleanCtxObj.aria_facts_packet
    cleanContextStr = JSON.stringify(cleanCtxObj)
  } catch { /* non-fatal — fall back to raw businessContext */ }

  const userPrompt = [verifiedFiguresBlock, learningContext, summaryBlock, memoryBlock, qualityCtx, 'Business data:\n' + cleanContextStr]
    .filter(Boolean)
    .join('\n\n')
```
Part 2 therefore attaches the anchors as a JSON field (`ctxParsed.available_ground_truth`) in **route.ts** before `runAriaCouncil` — it flows into `cleanContextStr` → both the 4 brains' userPrompt AND the synthesis BUSINESS DATA, with **zero changes to council.ts prompt text** (honouring the DO NOT).

### Q4 — Can queryBusinessData compute the four ground-truth values?

Partially. `queryBusinessData` is entity-based (sales/customers with since-filters) — fine for revenue, but it has NO payments entity and no consent filter. Verified instead: **`pos_sale_payments` EXISTS** (`types/database.types.ts:15887`; columns `sale_id, amount_cents, method, reference, created_at` — **no business_id**, so coverage requires the `pos_sales!inner` join) and `pos_customers.marketing_consent` is the canonical consent column (`schema-registry.ts:204`). The four values are computed with **direct supabaseAdmin queries in the council branch** (small inline helper, as the spec's flag-path anticipated):
- `revenue_today` — pos_sales ≥ `toAESTStart(todayAEST())`, voided-excluded (TZ-1 boundary)
- `revenue_this_week_calendar` — pos_sales ≥ Mon 00:00 AEST (WEEK-1 boundary)
- `payment_coverage_real_pct` — distinct paid sale_ids (pos_sale_payments ⋈ pos_sales, 7d) ÷ pos_sales count (7d), capped 100, null when no sales
- `customer_count_with_consent` — pos_customers count where marketing_consent=true

### Q5 — All validateAndHeal call sites (grep verbatim)

```
src/app/api/aria/ask/route.ts:35:   import { validateAndHeal } …
src/app/api/aria/ask/route.ts:570:  const delivValidated = await validateAndHeal({   ← deliverable path
src/app/api/aria/ask/route.ts:677:  const councilValidated = await validateAndHeal({ ← council path (extended)
src/app/api/aria/ask/route.ts:1738: const validated = await validateAndHeal({        ← main brain path
src/lib/aria/response-validator.ts:54: export async function validateAndHeal(args: {
```
`groundTruth` is OPTIONAL — the deliverable and main-brain callers compile and behave unchanged without it (Check 5 gates on `pipelinePath === 'council' && groundTruth`). Verified by tsc 0 errors.

---

## Part 1 — Check 5 mechanics (additive; Checks 1–4 byte-identical)

- Gate: `pipelinePath === 'council' && groundTruth && rawResponse.trim()` — never runs on main/deliverable (per DO NOT).
- **Pure code, zero LLM calls** (stronger than the Haiku-only constraint — nothing to rate-limit or pay for).
- Risky-token regex: `(\$\s?[\d,]+(\.\d+)?)|(\b\d{1,3}(\.\d+)?\s?%)|(\b\d+(\.\d+)?\s?[x×]\s?(higher|lower|more|less))` — dollars, percentages, multiplier claims. Plain years/counts without $/%/× are NOT risky tokens (avoids false strips).
- Grounding test per number: exact match OR within **2% relative tolerance** against every number parsed from the corpus (`extractNumbers` — comma-aware).
- Corpus = `augCtx` (full business context + facts packet + AVAILABLE_GROUND_TRUTH) + `JSON.stringify(council.raw_brain_outputs)` (all 4 advisor outputs) — exactly "the council inputs" per spec.
- Strip = sentence-level (split on `(?<=[.!?])\s+`), only sentences containing ≥1 ungrounded risky token; replacement sentence appended once; `kept.length > 0` guard means the response is never emptied.
- Fires → `healReason: 'fabrication_stripped'`, `healedText` returned (route already swaps `councilText` and saves the healed text to the conversation), aria_ai_calls row `agent_key='heal'`, `learning_signal='guard_fired:fabrication_stripped'`.

## Part 2 — additive confirmation
`ctxParsed.available_ground_truth` is a NEW JSON field appended inside the existing try-block before `augCtx = JSON.stringify(ctxParsed)`; wrapped in its own try/catch (anchor failure → council proceeds exactly as before). No existing context field touched; council.ts prompt text untouched.

## Part 3 — additive confirmation
New early-return ONLY when `!bizCtx || bizCtx.length < 50` (a healthy context JSON is thousands of chars — this fires only on genuine context-fetch failure/empty business). Response: the spec's clean message as `lead` block + saved to conversation. The council's own existing degradation (`succeeded.length === 0 → null → fall through to main brain`) is untouched and remains the second net.

## Detector test cases (manufactured inputs, traced through the Check 5 logic)

| # | Corpus contains | Synthesis sentence | Outcome |
|---|---|---|---|
| 1 | `"revenue_7d": 78.0` | "You made **$615** this week — a structural crisis." | `$615` → 615 not in corpus, no number within 2% → **sentence STRIPPED**, replacement appended, learning_signal fired |
| 2 | `"payment_coverage_real_pct": 85.7` | "POS payment reconciliation at **19%**." | 19 vs corpus {85.7, …}: no match ±2% → **STRIPPED** (the live fabrication case) |
| 3 | `"revenue_this_week_calendar": 7.0` | "This week you've made **$7.00** so far." | 7 ∈ corpus exact → PASS, sentence kept, no heal |
| 4 | `"current_week_revenue": 4419.9` | "That's **$4,442.90** vs same week last month." | 4442.9 vs 4419.9 → \|Δ\|/4419.9 = 0.52% ≤ 2% → PASS (tolerance prevents false strips on rounding) — and "**5× higher**" in the same response with no 5 in corpus → that sentence STRIPPED |

Edge behaviour: response consisting ENTIRELY of fabricated sentences → `kept.length === 0` → no strip (original returned unchanged — graceful, never produces an empty answer); corpus missing (groundTruth undefined) → Check 5 skipped entirely.

## DO NOT compliance
Checks 1–4 verbatim-untouched ✓ · council.ts synthesis prompt text untouched ✓ (Part 2 lives in route.ts context JSON) · Check 5 council-only ✓ · zero LLM calls in the new check (≤ Haiku-only) ✓ · no dependencies ✓ · strips sentences, never blocks ✓.

## Build gate
- `npx tsc --noEmit` → **0 errors** ✓
- `npm run build` → **PASS** ✓
- Commit: **STOP BEFORE PUSH** (awaiting founder push)

## Verify post-deploy
Ask: **"how am I doing this week?"** — grounded numbers only; zero "19%" / "5× higher" class figures. If the detector fired:
```sql
select created_at, agent_key, learning_signal, response_summary
from aria_ai_calls
where created_at > now() - interval '15 minutes'
  and (agent_key like 'council%' or agent_key='heal')
order by created_at desc;
```
Expect a `heal` row with `learning_signal='guard_fired:fabrication_stripped'` whenever a strip occurred. Bonus: the response should now proactively cite `payment_coverage_real_pct` (real ≈85.7%) from AVAILABLE_GROUND_TRUTH instead of inventing one.
