import { supabaseAdmin } from '@/lib/supabase-admin'

// OWNER-APP PH-2, Part B — the ONE place every business_events row gets written. business_events
// is the append-only, cohort-ready analytics spine (see migration 20260729020000's header for the
// full WHY) — every emitter goes through this helper so the shape stays small and consistent,
// never a per-caller ad-hoc insert. Server-only (supabaseAdmin; RLS also enforces insert is
// service_role-only as a second layer).
export type BusinessEventEntityType = 'decision' | 'job'
export type BusinessEventType =
  | 'proposed' | 'approved' | 'declined' | 'expired'
  | 'job_created' | 'job_completed' | 'job_failed'
// TS-1 PHASE 3 — 'staff' added at FIRST USE. business_events.actor has accepted it since
// migration 20260901103017 (teamspace_extend_existing dropped and re-added the CHECK); the
// TypeScript union simply had not caught up, so a team-originated event could not be typed.
// WIDENING ONLY: no existing call site changes, and every other declaration of this union was
// swept for (there is exactly one other, in createDecision.ts, widened in the same commit).
export type BusinessEventActor = 'aria' | 'owner' | 'cron' | 'staff'

export interface RecordEventParams {
  business_id: string
  entity_type: BusinessEventEntityType
  entity_id: string
  event_type: BusinessEventType
  domain?: string | null
  amount_cents?: number | null
  actor: BusinessEventActor
  // Kept deliberately small (brief's own instruction) — only what a future benchmarking/
  // underwriting job will need. Never the whole source row.
  payload_summary?: {
    kind?: string
    domain?: string | null
    amount_cents?: number | null
    decided_vs_proposed?: boolean
    latency_seconds?: number
  }
}

export async function recordEvent(params: RecordEventParams): Promise<void> {
  try {
    const { error } = await supabaseAdmin.from('business_events').insert({
      business_id: params.business_id,
      entity_type: params.entity_type,
      entity_id: params.entity_id,
      event_type: params.event_type,
      domain: params.domain ?? null,
      amount_cents: params.amount_cents ?? null,
      actor: params.actor,
      payload_summary: params.payload_summary ?? {},
    })
    // M11B — THE ERROR IS NOW READ. It was not: `await supabase.insert()` RESOLVES with { error }
    // rather than throwing, so a CHECK violation on entity_type/event_type/actor landed in a
    // variable nobody looked at and the catch below never ran. The spine has exactly one writer, so
    // a rejected insert here is a hole in the moat with no symptom.
    //
    // This is the shape that gave council-executor.ts ZERO audit inserts against 819 rows. It is
    // fixed here rather than merely avoided, because M11B writes job_created/job_completed/
    // job_failed through this function and "do not repeat their shape" cannot be satisfied by
    // calling a helper that has it.
    //
    // STILL NON-FATAL, deliberately and unchanged: the spine must never block a real decision or
    // job flow from completing. What changed is only that a failure is now visible.
    if (error) {
      console.error('[recordEvent] REJECTED', params.entity_type, params.event_type, error.message)
    }
  } catch (e) {
    // A thrown failure (network, client) — the original arm, kept.
    console.error('[recordEvent] failed', params.entity_type, params.event_type, e)
  }
}
