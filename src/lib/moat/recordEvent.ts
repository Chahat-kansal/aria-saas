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
    await supabaseAdmin.from('business_events').insert({
      business_id: params.business_id,
      entity_type: params.entity_type,
      entity_id: params.entity_id,
      event_type: params.event_type,
      domain: params.domain ?? null,
      amount_cents: params.amount_cents ?? null,
      actor: params.actor,
      payload_summary: params.payload_summary ?? {},
    })
  } catch (e) {
    // Non-fatal by design — the spine must never block a real decision/job flow from completing.
    console.error('[recordEvent] failed', params.entity_type, params.event_type, e)
  }
}
