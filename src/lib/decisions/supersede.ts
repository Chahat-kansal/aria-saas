import { supabaseAdmin } from '@/lib/supabase-admin'
import { recordEvent } from '@/lib/moat/recordEvent'

/**
 * TS-1 PHASE 5 — SUPERSEDE: stale advice is REPLACED OUT LOUD, never silently dropped.
 *
 * When Aria proposes something newer that makes an older proposal wrong, the old row must not sit
 * in the queue looking valid, and it must not vanish either — "we said X on Tuesday and replaced
 * it on Thursday" is exactly the delta the moat is built on.
 *
 * ── ONE STATEMENT, BOTH COLUMNS ────────────────────────────────────────────────────────────────
 * `superseded_by` and `status='superseded'` are set together in a single UPDATE. The column's own
 * comment requires it ("Set it together with status='superseded'. Never set on a row that is
 * still pending"), and doing it in two statements would leave a window where a row carries a
 * superseded_by while still reading as pending — which is precisely the "looks valid" state this
 * exists to abolish.
 *
 * The `.eq('status','pending')` is the same atomic claim phase 2 and phase 4 use: only a row that
 * is still waiting can be superseded, and two racing supersedes cannot both win.
 */

export type SupersedeResult =
  | { ok: true; superseded: string; by: string }
  /** The old row was already resolved — approved, declined, expired or superseded by someone else. */
  | { ok: false; reason: 'not_pending' }
  | { ok: false; reason: 'same_row' }
  | { ok: false; reason: 'error'; message: string }

/** Named columns only. */
const SUPERSEDE_COLUMNS = 'id, business_id, domain, amount_cents, kind, status, superseded_by'

/**
 * Mark `oldId` superseded by `newId`.
 *
 * `newId` must already exist — this does not create the replacement. The caller proposes the new
 * decision through `createDecision` first (so it gets its own 'proposed' event), then links.
 */
export async function supersedeDecision(oldId: string, newId: string): Promise<SupersedeResult> {
  // A row cannot replace itself. Cheap, but the FK would happily allow it and the result would be
  // a decision that is its own successor — unreadable in any UI that follows the link.
  if (oldId === newId) return { ok: false, reason: 'same_row' }

  const { data, error } = await supabaseAdmin
    .from('aria_autopilot_actions')
    .update({
      status: 'superseded',
      superseded_by: newId,
      resolved_at: new Date().toISOString(),
      outcome_note: 'Superseded by a newer proposal.',
    })
    .eq('id', oldId)
    .eq('status', 'pending')     // atomic: only a waiting decision can be superseded
    .select(SUPERSEDE_COLUMNS)
    .maybeSingle()

  if (error) {
    console.error('[supersede] failed:', error.message)
    return { ok: false, reason: 'error', message: error.message }
  }
  // No row came back: it was already resolved, or another supersede won the race. Either way this
  // is an expected answer, not a failure — and NOT retried, because the row is no longer waiting.
  if (!data) return { ok: false, reason: 'not_pending' }

  const row = data as { business_id: string; domain: string | null; amount_cents: number | null; kind: string | null }

  // 'declined' is the closest true event on the spine's CHECK (proposed|approved|declined|expired|
  // job_*): the old proposal will not be acted on. The CHECK is NOT extended — standing ruling —
  // and the payload carries the fact that this was a supersede rather than an owner declining, so
  // the two can be told apart downstream.
  await recordEvent({
    business_id: row.business_id,
    entity_type: 'decision',
    entity_id: oldId,
    event_type: 'declined',
    domain: row.domain,
    amount_cents: row.amount_cents,
    actor: 'aria',
    payload_summary: { kind: row.kind ?? undefined, domain: row.domain, decided_vs_proposed: false },
  })

  return { ok: true, superseded: oldId, by: newId }
}
