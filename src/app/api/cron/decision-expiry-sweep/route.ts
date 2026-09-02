export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { NextResponse } from 'next/server'
import { verifyCronAuth } from '@/lib/auth/cron'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { recordEvent } from '@/lib/moat/recordEvent'

// TS-1 PHASE 2 — THE CLOCK. A decision with an expires_at in the past is not "still waiting"; it
// is stale advice sitting in the owner's queue looking valid. This marks it expired, records WHY,
// and emits the event so the spine can tell "the owner declined" apart from "nobody ever looked".
//
// ── FOLDED INTO h06. NO NEW CRON ENTRY. ────────────────────────────────────────────────────────
// Registered in src/app/api/cron/dispatch/h06/route.ts, BEFORE decision-notify-sweep — the same
// discipline MONITOR-1 and OWNER-APP PH-2/PH-4 used. Ordering is deliberate and not cosmetic: if
// the notify sweep ran first it would buzz the owner about a decision this sweep is about to
// expire, which is the exact "stale advice looking valid" failure the phase exists to remove.
// vercel.json is untouched — its `functions` entries are GLOBS, and src/app/api/cron/**/*.ts
// already matches this file, so the tracked function count stays 9/22.
//
// ── WHAT IT WILL NOT TOUCH, AND WHY THAT MATTERS ───────────────────────────────────────────────
// aria_autopilot_actions is DUAL-USE (createDecision.ts:16 says so): the owner's decision queue
// AND an agent audit log. ~11 writers insert audit rows with status 'executed' — a record of
// something that already happened. Filtering on status='pending' is what keeps this sweep off
// them. An audit row can never be "expired"; it is not waiting for anyone.
//
// Measured against production before writing this: 789 pending rows, of which 776 have NO
// expires_at and are therefore untouchable by this sweep by construction. 5 rows match today.
//
// ── ATOMIC CLAIM, NOT SELECT-THEN-UPDATE ───────────────────────────────────────────────────────
// The UPDATE carries `.eq('status','pending')` and RETURNS the rows it actually transitioned —
// the same pattern /api/owner/decisions uses against a double-submit. Two dispatchers running
// concurrently cannot both claim the same row, so events cannot double-emit. That is what makes
// the re-run proof (0 new rows) a property rather than a coincidence.
//
// ── OUTCOME COLUMN CHOICE, DELIBERATE ──────────────────────────────────────────────────────────
// The reason goes in `outcome_note` (free text, 0 rows populated, no reader). `outcome` is NOT
// touched: hypothesis/outcome-learning writes a verdict there, and overwriting it would corrupt
// an audit path — precisely the collision this sprint was told to avoid.
//
// `resolved_at` is set because expiry IS a terminal state and "when did it go stale" should be
// queryable. `resolved_by` stays NULL: no human resolved it, and writing a placeholder there
// would be a fabricated actor.

/** Rows this sweep transitioned. Columns are named explicitly — never `select *`. */
const CLAIM_COLUMNS = 'id, business_id, domain, amount_cents, kind, created_at, expires_at'

interface ClaimedRow {
  id: string
  business_id: string
  domain: string | null
  amount_cents: number | null
  kind: string | null
  created_at: string
  expires_at: string
}

export const GET = withErrorCapture('cron/decision-expiry-sweep', async (req: Request) => {
  const denied = verifyCronAuth(req)
  if (denied) return denied

  const now = new Date()
  const nowIso = now.toISOString()

  // The claim. Only rows that were STILL pending at this instant come back.
  const { data, error } = await supabaseAdmin
    .from('aria_autopilot_actions')
    .update({
      status: 'expired',
      outcome_note: 'Expired automatically: the decision window closed on '
        + nowIso.slice(0, 10) + ' with no owner action.',
      resolved_at: nowIso,
    })
    .eq('status', 'pending')
    .not('expires_at', 'is', null)
    .lt('expires_at', nowIso)
    .select(CLAIM_COLUMNS)

  // RULE 7 — the error is checked, never discarded into an empty result. A failed sweep that
  // reported "0 expired" would look identical to a clean run with nothing to do.
  if (error) {
    console.error('[decision-expiry-sweep] claim failed:', error.message)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  const claimed = (data ?? []) as ClaimedRow[]

  // One event per claimed row. recordEvent is the ONE writer of business_events (PH-2, Part B) —
  // never an ad-hoc insert here. entity_type is 'decision' because a decision is what expired;
  // business_events.entity_type only accepts 'decision' | 'job' and that is not widened.
  let emitted = 0
  for (const row of claimed) {
    // Real elapsed time between proposal and expiry, from two timestamps that already exist.
    // Never estimated — if created_at were unreadable this would be omitted, not guessed.
    const latencySeconds = Math.round(
      (new Date(row.expires_at).getTime() - new Date(row.created_at).getTime()) / 1000,
    )
    await recordEvent({
      business_id: row.business_id,
      entity_type: 'decision',
      entity_id: row.id,
      event_type: 'expired',
      domain: row.domain,
      amount_cents: row.amount_cents,
      actor: 'cron',
      payload_summary: {
        kind: row.kind ?? undefined,
        domain: row.domain,
        amount_cents: row.amount_cents,
        decided_vs_proposed: false,
        latency_seconds: latencySeconds,
      },
    })
    emitted++
  }

  // No silent truncation: this claims every matching row in one statement, so the count IS the
  // whole set. If it is ever large the log says so rather than quietly capping.
  console.log('[decision-expiry-sweep] ' + JSON.stringify({
    at: nowIso, expired: claimed.length, events: emitted,
  }))

  return NextResponse.json({ ok: true, expired: claimed.length, events: emitted })
})
