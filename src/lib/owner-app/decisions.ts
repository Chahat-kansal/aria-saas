import type { SupabaseClient } from '@supabase/supabase-js'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { signManagerToken, verifyManagerToken } from '@/lib/pos/manager-token'

// OWNER-APP PH-1 — the five domains a phone decision can belong to. Matches
// aria_autopilot_actions.domain's CHECK constraint exactly (migration
// 20260728020000_owner_decisions_registry.sql).
export const DOMAINS = ['money', 'people', 'growth', 'supply', 'compliance'] as const
export type Domain = (typeof DOMAINS)[number]

// The registry's own status vocabulary (aria_autopilot_actions' existing CHECK, reused as-is —
// see the migration header for why 'pending'/'rejected' serve the design's 'waiting'/'declined'
// rather than adding synonyms). 'waiting' here is a display-only alias for querying, never stored.
export type DecisionStatus = 'pending' | 'approved' | 'rejected' | 'executed' | 'dismissed' | 'expired' | 'superseded'

export interface OwnerDecision {
  id: string
  business_id: string
  outlet_id: string | null
  domain: Domain | null
  kind: string | null
  title: string | null
  subtitle: string | null
  amount_cents: number | null
  payload: Record<string, unknown>
  aria_reason: string | null
  requires_stepup: boolean
  status: DecisionStatus
  expires_at: string | null
  created_by: string
  resolved_by: string | null
  resolved_at: string | null
  created_at: string
}

// Maps a raw aria_autopilot_actions row (which carries a lot of columns other agents use that the
// owner-app doesn't care about) onto the shape the phone UI actually renders. Single choke point —
// every reader of this table for the owner-app goes through this, so a column rename/addition is
// one edit here, not N call sites.
export function toOwnerDecision(row: Record<string, unknown>): OwnerDecision {
  return {
    id: row.id as string,
    business_id: row.business_id as string,
    outlet_id: (row.outlet_id as string) ?? null,
    domain: (row.domain as Domain) ?? null,
    kind: (row.kind as string) ?? (row.action_type as string) ?? null,
    title: (row.title as string) ?? null,
    subtitle: (row.description as string) ?? null,
    amount_cents: (row.amount_cents as number) ?? null,
    payload: (row.action_data as Record<string, unknown>) ?? {},
    aria_reason: (row.reasoning as string) ?? null,
    requires_stepup: Boolean(row.requires_stepup),
    status: (row.status as DecisionStatus) ?? 'pending',
    expires_at: (row.expires_at as string) ?? null,
    created_by: (row.created_by as string) ?? 'aria',
    resolved_by: (row.resolved_by as string) ?? null,
    resolved_at: (row.resolved_at as string) ?? null,
    created_at: row.created_at as string,
  }
}

/** True when a decision's expires_at has passed and it hasn't been marked expired yet. */
export function isExpired(row: { expires_at: string | null; status: string }): boolean {
  if (row.status !== 'pending' || !row.expires_at) return false
  return new Date(row.expires_at).getTime() < Date.now()
}

// SS-RECONCILE / SECURITY-P5 pattern reused here too: write every act to the existing, already-
// live activity_log (business_id, action_type, description, metadata jsonb, created_at) — no
// parallel audit log invented. metadata carries the fields the brief asks for (actor, decision id,
// verb, before/after status, source).
export async function auditDecisionAction(params: {
  business_id: string
  actor_user_id: string
  decision_id: string
  verb: 'approve' | 'decline'
  before_status: string
  after_status: string
}): Promise<void> {
  await supabaseAdmin.from('activity_log').insert({
    business_id: params.business_id,
    action_type: 'owner_decision_' + params.verb,
    description: 'Owner ' + params.verb + 'd decision ' + params.decision_id,
    metadata: {
      actor_user_id: params.actor_user_id,
      decision_id: params.decision_id,
      verb: params.verb,
      before_status: params.before_status,
      after_status: params.after_status,
      source: 'owner_app',
    },
    created_at: new Date().toISOString(),
  })
}

// Step-up token — reuses the EXISTING HMAC sign/verify pair from src/lib/pos/manager-token.ts
// (built for POS manager-PIN overrides) rather than writing new crypto. The functions are already
// generic (sign/verify an opaque id + 60s expiry); this just applies them to the owner's own
// user.id instead of a POS staff id. Issuance (src/app/api/owner/decisions/stepup/route.ts)
// re-verifies the owner's real password via Supabase Auth's own signInWithPassword before ever
// calling signManagerToken — the step-up is a genuine re-auth, not a rubber stamp.
export function issueStepupToken(userId: string): string {
  return signManagerToken(userId)
}

export function verifyStepupToken(token: string, expectedUserId: string): boolean {
  const verifiedUserId = verifyManagerToken(token)
  return verifiedUserId !== null && verifiedUserId === expectedUserId
}

// Translates the phone UI's own display vocabulary onto aria_autopilot_actions' real, existing
// status CHECK values — the same reuse-not-duplicate decision documented in the migration header.
// Every caller passes 'waiting'/'declined'; the DB only ever sees 'pending'/'rejected'.
const STATUS_ALIASES: Record<string, string> = { waiting: 'pending', declined: 'rejected' }
function toDbStatus(status: string): string {
  return STATUS_ALIASES[status] ?? status
}

/** Owner-scoped read via the request-scoped client (RLS-enforced, same own_autopilot policy every
 * other aria_autopilot_actions reader already relies on). */
export async function listOwnerDecisions(
  supabase: SupabaseClient,
  business_id: string,
  opts: { status?: string; domain?: string },
): Promise<OwnerDecision[]> {
  let q = supabase.from('aria_autopilot_actions').select('*').eq('business_id', business_id)
  q = q.eq('status', toDbStatus(opts.status && opts.status !== 'all' ? opts.status : 'waiting'))
  if (opts.domain && opts.domain !== 'all') q = q.eq('domain', opts.domain)
  q = q.order('created_at', { ascending: false })
  const { data } = await q
  return ((data ?? []) as Array<Record<string, unknown>>).map(toOwnerDecision)
}
