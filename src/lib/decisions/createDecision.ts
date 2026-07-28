import { supabaseAdmin } from '@/lib/supabase-admin'
import { recordEvent } from '@/lib/moat/recordEvent'
import { notifyOwner } from '@/lib/push/notifyOwner'
import type { Domain } from '@/lib/owner-app/decisions'

// SPINE-1 — the ONE choke point through which a GENUINE decision is created.
//
// WHY THIS EXISTS: decisions live in aria_autopilot_actions, which ~34 sites write to directly.
// With no single creation path, three gaps opened independently: (a) most sites never emitted a
// 'proposed' business_events row, losing the proposed→resolved delta that underwrites future
// lending — and un-emitted proposals are NOT backfillable; (b) PH-4 push couldn't fire at creation,
// so decision_waiting fell back to a ~24h daily sweep; (c) event/notify completeness depended on
// remembering to call two helpers at 30+ sites. One function fixes all three at the root.
//
// ★ SCOPE — THIS IS FOR GENUINE DECISIONS ONLY. DO NOT USE FOR AUDIT/TELEMETRY ROWS. ★
// aria_autopilot_actions is DUAL-USE: it is both the owner's decision queue (status 'pending' —
// the owner must act) AND an agent audit log (status 'executed'/'completed'/'approved' — already
// happened, recorded for history). Of the 34 insert sites, 16 are decisions and 18 are audit.
// Routing an audit row through here would:
//   (a) PUSH the owner about telemetry ("your SEO scan finished") — the exact spurious-buzz failure
//       PH-4's whole dedupe design exists to prevent; and worse,
//   (b) emit a FALSE 'proposed' event for something that was never proposed — POISONING the
//       proposed→resolved delta. Missing data is recoverable by starting clean; poisoned data is
//       not. A smaller true dataset beats a larger corrupted one.
// If you are recording something that ALREADY HAPPENED, insert directly as those 18 sites do.
//
// The dual-use of aria_autopilot_actions is a KNOWN, DISCLOSED structural item. Splitting audit
// rows into their own table is deliberately DEFERRED to its own sprint — not done here.

export interface CreateDecisionParams {
  business_id: string
  /** money | people | growth | supply | compliance — the owner-app domain filter. */
  domain: Domain
  /** Stable machine key for this decision type, e.g. 'bas_reminder', 'purchase_order'. */
  kind: string
  /** Owner-facing headline. Required — a decision the owner can't read isn't a decision. */
  title: string
  subtitle?: string | null
  amount_cents?: number | null
  payload?: Record<string, unknown>
  /** Grounded reason. GROUNDING-TEETH: real or omitted, never invented. */
  aria_reason?: string | null
  requires_stepup?: boolean
  outlet_id?: string | null
  expires_at?: string | null
  priority?: string | null

  // ── Legacy columns the EXISTING readers still rely on. Passed straight through so a migrated
  // row stays byte-equivalent to what the site wrote before (behaviour-preserving refactor).
  category?: string | null
  action_type?: string | null
  agent_type?: string | null
  customer_id?: string | null
  estimated_impact?: string | null
  confidence?: number | null
  /** Distinct legacy column from `description` — a few sites write `summary` instead. Both are
   * passed through as-is so a migrated row keeps writing the exact column it wrote before. */
  summary?: string | null
  /** Legacy provenance column some agents set (e.g. 'parallel_orchestrator'). */
  triggered_by?: string | null
  /** Only for the rare caller that genuinely needs a non-'pending' status. Defaults to 'pending'. */
  status?: string

  actor?: 'aria' | 'cron' | 'owner'
  /** Emit the 'proposed' business_events row. Default true — opt out explicitly, never silently. */
  emit?: boolean
  /** Fire the decision_waiting push. Default true — opt out explicitly, never silently. */
  notify?: boolean
}

/**
 * Create a genuine decision: insert the row, emit the moat event, buzz the owner. Returns the id
 * (or null if the insert failed — callers today treat decision creation as non-fatal, so this
 * never throws, matching the try/catch-and-continue pattern every migrated site already used).
 *
 * IDEMPOTENCY: safe to call once per real creation. It is NOT internally deduped — each call
 * inserts a new decision row (there is no natural business key to dedupe on, and two genuinely
 * separate proposals of the same kind are legitimate). What IS protected: the push, via
 * owner_notifications' UNIQUE(subject_type, subject_id, reason) — a given decision id can only
 * ever buzz once, so this is safe alongside the PH-4 daily sweep. business_events is append-only
 * by design, so a retry that re-inserts a NEW decision row correctly produces a NEW proposal.
 * Callers that must not double-create should guard before calling (as bas-monitor's own
 * already-exists check does).
 */
export async function createDecision(params: CreateDecisionParams): Promise<string | null> {
  const {
    business_id, domain, kind, title,
    subtitle = null, amount_cents = null, payload, aria_reason = null,
    requires_stepup = false, outlet_id = null, expires_at = null, priority = null,
    category = null, action_type = null, agent_type = null,
    customer_id = null, estimated_impact = null, confidence = null, summary = null,
    triggered_by = null,
    status = 'pending',
    actor = 'aria', emit = true, notify = true,
  } = params

  // ── 1. The decision row ──────────────────────────────────────────────────────────────────────
  const row: Record<string, unknown> = {
    business_id,
    domain,
    kind,
    title,
    status,
    requires_stepup,
    created_by: actor,
  }
  // Only set optional/legacy columns when the caller actually provided them, so a migrated row
  // matches its original insert exactly rather than gaining a wall of explicit nulls.
  if (subtitle !== null) row.description = subtitle
  if (amount_cents !== null) row.amount_cents = amount_cents
  if (payload !== undefined) row.action_data = payload
  if (aria_reason !== null) row.reasoning = aria_reason
  if (outlet_id !== null) row.outlet_id = outlet_id
  if (expires_at !== null) row.expires_at = expires_at
  if (priority !== null) row.priority = priority
  if (category !== null) row.category = category
  if (action_type !== null) row.action_type = action_type
  if (agent_type !== null) row.agent_type = agent_type
  if (customer_id !== null) row.customer_id = customer_id
  if (estimated_impact !== null) row.estimated_impact = estimated_impact
  if (confidence !== null) row.confidence = confidence
  if (summary !== null) row.summary = summary
  if (triggered_by !== null) row.triggered_by = triggered_by

  const { data: created, error } = await supabaseAdmin
    .from('aria_autopilot_actions')
    .insert(row)
    .select('id')
    .maybeSingle()

  if (error || !created) {
    console.error('[createDecision] insert failed', kind, error?.message)
    return null
  }
  const decisionId = created.id as string

  // ── 2. The moat event — a SEPARATE, VISIBLE step (never buried inside the insert) ────────────
  // This is the 'proposed' half of the proposed→resolved delta. The 'resolved' half is already
  // emitted by PH-1's approve/decline path (api/owner/decisions), untouched by this sprint.
  if (emit) {
    await recordEvent({
      business_id,
      entity_type: 'decision',
      entity_id: decisionId,
      event_type: 'proposed',
      domain,
      amount_cents,
      actor,
      payload_summary: { kind, domain, amount_cents },
    })
  }

  // ── 3. The buzz — also a SEPARATE, VISIBLE step ──────────────────────────────────────────────
  // Real-time now that creation has a choke point. Idempotent at the DB (owner_notifications
  // UNIQUE), so the PH-4 daily sweep remains a harmless backstop for anything that bypasses this.
  // Fire-and-forget: a push must never block or fail a decision from being created.
  if (notify) {
    const { data: biz } = await supabaseAdmin.from('businesses').select('slug').eq('id', business_id).maybeSingle()
    const slug = (biz?.slug as string) ?? ''
    void notifyOwner({
      business_id,
      subject_type: 'decision',
      subject_id: decisionId,
      reason: 'decision_waiting',
      title,
      body: subtitle ?? 'Tap to review it in Decisions.',
      url: '/owner/' + slug + '/decisions?open=' + decisionId,
    }).catch(() => {})
  }

  return decisionId
}
