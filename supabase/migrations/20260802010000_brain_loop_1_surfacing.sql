-- BRAIN-LOOP-1 — give the learning loop a real entry condition.
--
-- WHY: the loop is already built, scheduled (cron/outcome-check via the h17 dispatcher) and
-- consumed (aria_advice_weights is read by ask/route.ts, action-planner, business-context and
-- hypothesis/generate). It produces nothing because it never STARTS: acceptance is owner-gated,
-- no owner has ever accepted, so action_id and baseline_metric_cents are never set and
-- runOutcomeChecks() has nothing to measure. 240 hypotheses: 45 active, 195 expired, 0 accepted.
-- This migration adds the columns needed to route hypotheses into the PH-1 Decisions queue (the
-- surface owners actually use daily) and to make non-decisions honestly learnable.
--
-- ── PRE-MIGRATION DUMP of aria_hypotheses (standing rule) ──────────────────────────────────────
-- COLUMNS (25): id, business_id, title, description, category, predicted_impact_cents,
--   predicted_impact_label, risk_level, confidence, evidence_summary, evidence_payload(jsonb),
--   status, generated_at, expires_at, accepted_at, rejected_at, rejection_reason, action_id,
--   baseline_metric_cents, outcome_7d_cents, outcome_30d_cents, outcome_checked_at, outcome_verdict
-- CHECK: status IN (active, accepted, rejected, expired, superseded)
--        outcome_verdict IN (worked, partial, neutral, backfired, unknown)
--        risk_level IN (low, medium, high)
-- FK:     business_id -> businesses(id) ON DELETE CASCADE
--         action_id   -> aria_actions(id) ON DELETE SET NULL
-- UNIQUE: none (PK on id only)
-- INDEXES: pkey; (business_id, status); (business_id, generated_at DESC);
--          (expires_at) WHERE status='active'
-- Confirmed ABSENT before this migration: surfaced_at, surfaced_status, decision_id.
--
-- ADDITIVE ONLY (RULE 0): three nullable columns and one index. Nothing dropped, altered or
-- renamed; every existing row keeps its current meaning.

-- ── surfaced_at — SET-ONCE, first render to an owner ───────────────────────────────────────────
-- Stamped by whichever surface displays the hypothesis FIRST (the Decisions queue, the hypotheses
-- board, or the intelligence page — all three are instrumented, or we would rebuild the same blind
-- spot with a nicer column name). Never overwritten on re-view: the question it answers is "was
-- this ever put in front of a human", not "when was it last looked at".
alter table aria_hypotheses add column if not exists surfaced_at timestamptz;

-- ── surfaced_status — THREE MEANINGFUL STATES, deliberately not collapsed ──────────────────────
--   NULL               = not yet surfaced. A NEW row that simply hasn't been shown yet. Still
--                        fully learnable later — this is a "not yet", not a verdict.
--   'unknown_surfaced' = the 195 legacy expiries. Two UI surfaces existed (the hypotheses board and
--                        the intelligence page), so we CANNOT claim they were never displayed — but
--                        nothing recorded whether an owner ever opened those pages, so we equally
--                        cannot claim they were seen and ignored. Their meaning is genuinely
--                        unknowable. EXCLUDED FROM WEIGHT ADJUSTMENT FOREVER. Inferring "ignored"
--                        from them would be inventing a fact (GROUNDING-TEETH).
--   'surfaced'         = confirmed shown to an owner, with surfaced_at recording when.
-- Collapsing NULL and 'unknown_surfaced' into one state is exactly what this column exists to
-- prevent: "never shown yet" and "shown-ness unknowable" have opposite learning consequences.
alter table aria_hypotheses add column if not exists surfaced_status text
  check (surfaced_status in ('unknown_surfaced', 'surfaced'));

-- ── decision_id — SET-ONCE dedupe marker. DELIBERATELY NO FOREIGN KEY. ─────────────────────────
-- The guarantee this column carries is "a hypothesis enters the Decisions queue at most ONCE,
-- EVER". That guarantee must survive the deletion of the decision row it points at.
--
-- Evidence this matters: aria_autopilot_actions has NO delete-protection trigger (protect_critical_data()
-- guards only businesses, customers, invoices, pos_products, pos_sale_items, pos_sales,
-- pos_shift_reports, staff_members — not this table), and decision rows HAVE been hard-deleted in
-- practice (SPINE-1's proof cleanup). So:
--   · ON DELETE SET NULL (mirroring action_id) would silently re-open the hypothesis for re-entry
--     the moment a decision row was deleted — a dedupe guarantee a DELETE can undo is not a guarantee.
--   · ON DELETE RESTRICT would hold, but would block legitimate admin/proof cleanup of decisions.
--   · NO FK: nothing can ever null this column. A dangling uuid is harmless here because this is a
--     DEDUPE MARKER, not a navigation path — read-through runs the other way
--     (aria_autopilot_actions.action_data->>'hypothesis_id' -> aria_hypotheses), so correctness
--     never depends on decision_id resolving.
-- Trade-off stated plainly: referential integrity on this column is given up, deliberately, to buy
-- a set-once guarantee that no DELETE can reverse.
alter table aria_hypotheses add column if not exists decision_id uuid;

-- The candidate-selection path: "active hypotheses for this business that have never been queued".
-- Partial index so it stays small (only ever indexes rows still eligible) — verified against
-- EXPLAIN before commit, not assumed.
create index if not exists idx_aria_hypotheses_queue_candidates
  on aria_hypotheses (business_id) where decision_id is null and status = 'active';

-- ── BACKFILL: the 195 legacy expiries, scoped precisely ────────────────────────────────────────
-- ONLY rows already expired AND never surfaced-marked. The 45 active rows are deliberately NOT
-- touched — they are still live candidates and must keep surfaced_status NULL so they remain
-- learnable once actually shown.
update aria_hypotheses
   set surfaced_status = 'unknown_surfaced'
 where status = 'expired'
   and surfaced_status is null;
