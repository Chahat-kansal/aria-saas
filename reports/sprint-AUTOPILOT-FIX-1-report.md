# Sprint AUTOPILOT-FIX-1 — Kill Fabricated "POS Failure" Alerts at the Source
**Date:** 2026-06-13
**Status:** COMPLETE — build verified green

> Root cause, code-confirmed: the payment-coverage denominator used `status != 'voided'` (which still
> counts draft/pending/cancelled sales) instead of `status = 'completed'`. For Sip that turned
> "6 completed, all 6 paid = 100%" into "6 of 32 = 19%". That wrong figure was (a) computed by the
> `wh_payments_coverage` RPC into wiring-health, and (b) recomputed by GROUNDING-TEETH's anchor and
> handed to the council labelled **"SAFE TO CITE"** — so Check 5 validated "19%" against its own bad
> anchor and kept it. Fixed at both sources + small-sample guard + action expiry + council framing.

---

## Files changed (5 + report)

| File | Part |
|---|---|
| `src/app/api/aria/ask/route.ts` | PART 1a + 2: GROUNDING-TEETH anchor → completed-only denominator + <10-sample guard |
| `supabase/migrations/20260613000001_fix_payments_coverage_completed_only.sql` | PART 1b: NEW — `wh_payments_coverage` RPC `!= 'voided'` → `= 'completed'` (CREATE OR REPLACE) |
| `src/app/api/cron/aria-health-monitor/route.ts` | PART 2: small-sample guard on the coverage check |
| `src/app/api/aria/autopilot/route.ts` | PART 3: `expires_at = now()+48h` on autopilot action inserts |
| `src/lib/aria/get-business-context.ts` | PART 4: council framing — pending actions are ALERTS, not FACTS |

---

## PRE-FLIGHT (verbatim)

### pwd
`C:\Users\kansa\aria-saas-audit` ✓

### Q2 — Every payment-coverage calculation site (grep + read)

**Site A — `wh_payments_coverage` RPC** (`supabase/migrations/20260611000001_wiring_health_checks.sql:63-74`, verbatim):
```sql
CREATE OR REPLACE FUNCTION wh_payments_coverage(p_business_id uuid, p_since timestamptz)
RETURNS TABLE(total_sales bigint, paid_sales bigint) … AS $$
  SELECT COUNT(ps.id) AS total_sales, COUNT(sp.sale_id) AS paid_sales
  FROM pos_sales ps
  LEFT JOIN (SELECT DISTINCT sale_id FROM pos_sale_payments) sp ON sp.sale_id = ps.id
  WHERE ps.business_id = p_business_id
    AND ps.status       != 'voided'        -- ← THE BUG: counts draft/pending/cancelled
    AND ps.created_at   >= p_since;
$$;
```
Consumer: `aria-health-monitor/route.ts:213-227` → writes `payments_coverage_pct` to `aria_wiring_health_checks`.

**Site B — GROUNDING-TEETH anchor** (`ask/route.ts:684-700`, verbatim pre-fix):
```ts
const [gtToday, gtWeek, gtConsent, gtSales7, gtPaid7] = await Promise.all([
  …,
  supabaseAdmin.from('pos_sales').select('id', { count: 'exact', head: true }).eq('business_id', bid).gte('created_at', gtWeekAgo).neq('status', 'voided'),   // ← THE BUG
  supabaseAdmin.from('pos_sale_payments').select('sale_id, pos_sales!inner(business_id, created_at)').eq('pos_sales.business_id', bid).gte('pos_sales.created_at', gtWeekAgo).limit(5000),
])
…
const totalSales7 = gtSales7.count ?? 0
payment_coverage_real_pct: totalSales7 > 0 ? +((Math.min(paidSaleIds.size, totalSales7) / totalSales7) * 100).toFixed(1) : null,
```
This anchor sits inside `available_ground_truth` with `note: '… SAFE TO CITE'` — so the council was handed the fabricated 19% as gospel. **This is the live propagation path** (GROUNDING-TEETH's report claimed ≈85.7% but the query never filtered to completed).

No other coverage calc exists: `business-data.ts` / `business-brain.ts` compute NO sales-vs-payment ratio (business-brain's prompt: "Never invent sales … numbers"). The "6 of 32" specificity in the historical `aria_actions` could only have originated from one of Sites A/B (or the now-closed memory/summary loop) — both fixed.

### Q3 — Autopilot aria_actions insert
The `/api/aria/autopilot` route writes to **`aria_autopilot_actions`** (route.ts:151), NOT `aria_actions`. Insert pre-fix had `status: "pending"` and **no `expires_at`** (PART 3 target). The poisoned "POS failure" records live in **`aria_actions`** — LLM-generated; the writers stamp `source` (Q4).

### Q4 — aria_actions.source values (writers, grep)
- `business_brain:${mode}` (`business-brain/route.ts:85`, mode ∈ daily/health/sales) ← **most likely source of the crisis narratives** (the "autopilot" of the founder's evidence = MorningCommandCentre's business-brain daily run)
- `aria_router:${agentKey}` (router.ts:85), `aria_intelligence:*` (alerts.ts:28,134), `ask_aria:plan` (ask/route.ts:190)
- **NEEDS-DB:** chat Claude should confirm the exact `source` on Sip's poisoned rows; the cleanup SQL below matches on TITLE pattern (reliable, source-agnostic) to be safe.

### Q5 — Council fetch of pending actions
`get-business-context.ts:346-366` builds `aria_recommendations` (pending `aria_actions`, top 5) into the context JSON the council reads. Pre-fix `grounding_note` only stated the count — no "these may be false alerts" framing (PART 4 target).

---

## Per-part diffs

**PART 1a (ask/route.ts):** denominator `neq('status','voided')` → `eq('status','completed')`; numerator join gains `.eq('pos_sales.status','completed')` so paid/total are both completed-only. Sip: 6/6 = 100%.

**PART 1b (new migration):** `ps.status != 'voided'` → `ps.status = 'completed'`. `CREATE OR REPLACE` — additive, no drop, no data mutation. **chat Claude applies via Supabase.**

**PART 2 (guard, two places):**
- ask/route.ts: `coveragePct = completedSales7 >= 10 ? …calc… : null` + `payment_coverage_note` explaining insufficient sample / healthy. The council can no longer receive a scary low % from a tiny cafe.
- aria-health-monitor: `covStatus = totalSales < 10 ? 'green' : wiringStatus(...)` — <10 completed sales never flags red.
Reasoning (in code comments): small cafes do ~5-15 sales/day; a "failure" conclusion needs ≥10 completed samples AND coverage <70-80%.

**PART 3 (autopilot expiry):** `expires_at: new Date(Date.now() + 48*60*60*1000).toISOString()` on every inserted row. (The GET already filters `expires_at.is.null OR > now` — the column exists; now it's populated so stale alerts self-clear.)

**PART 4 (council framing):** `aria_recommendations` gains `treat_as: 'ALERTS TO VERIFY, NOT FACTS'` + `framing_note` instructing the council to never echo a pending action's numeric claims ("19% reconciliation"/"data loss"/"POS failure") and to let ground truth win on conflict. Existing `grounding_note` untouched (additive).

## Cleanup SQL — for chat Claude (Sip only, expire-not-delete, RULE 0)
```sql
-- Expire the poisoned pending POS-failure / reconciliation actions (Sip ONLY). status pending → expired,
-- NO delete, NO history mutation beyond these stale pending rows. Matches on title (source-agnostic).
update aria_actions
set status = 'expired', updated_at = now()
where business_id = 'ff5055a0-c351-4ada-817a-1804961035f3'
  and status = 'pending'
  and (
    title ilike '%reconciliation%' or title ilike '%POS%failure%' or title ilike '%POS system%'
    or title ilike '%data integrity%' or title ilike '%data loss%' or title ilike '%payment coverage%'
    or title ilike '%payments coverage%' or title ilike '%revenue capture%'
  );

-- Optional: confirm the source value for the audit trail before/after
select source, count(*) from aria_actions
where business_id='ff5055a0-c351-4ada-817a-1804961035f3' and title ilike '%reconciliation%' group by source;

-- Same for aria_autopilot_actions if any leaked there:
update aria_autopilot_actions set status = 'expired'
where business_id = 'ff5055a0-c351-4ada-817a-1804961035f3' and status = 'pending'
  and (title ilike '%reconciliation%' or title ilike '%POS%failure%' or title ilike '%data integrity%');
```

## Confirmations
- **No history mutated:** only `status='pending' → 'expired'` on the matching stale rows; no DELETE, no edits to executed/approved/dismissed history. RULE 0 ✓.
- **Council change additive:** new fields added beside the untouched `grounding_note`; no existing rule removed; the council still fetches pending actions exactly as before — only framing context added ✓.
- **Real data-integrity flagging preserved:** coverage still flags red at ≥10 completed sales with <80% paid — genuine POS failures still surface; only the small-sample false positives are suppressed ✓.
- **Migration additive:** CREATE OR REPLACE, no schema/column change, no readers of `aria_hypotheses` or UI render paths touched ✓.
- vercel.json untouched (9 function configs; the migration is not a function).

## Build gate
- `npx tsc --noEmit` → **0 errors** ✓
- `npm run build` → **PASS** ✓
- Commit: **STOP BEFORE PUSH** (awaiting founder push) — chat Claude applies the migration + cleanup SQL after deploy.

## Verify post-deploy
1. Apply migration `20260613000001`; run cleanup SQL.
2. After next business-brain/autopilot run:
```sql
select created_at, title, status from aria_actions
where business_id='ff5055a0-c351-4ada-817a-1804961035f3' and created_at > now() - interval '2 hours'
order by created_at desc;
```
Pass: ZERO new actions with "19%"/"reconciliation"/"POS failure" in title.
3. Fresh chat "how am I doing this week?" → NO "19% reconciliation"/"POS system failure"; if coverage is mentioned it cites ~100% (or "insufficient sample"), and `available_ground_truth.payment_coverage_real_pct` is now correct.
