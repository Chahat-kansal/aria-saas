export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { verifyBusinessAccess } from '@/lib/auth/verify-business-access'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { DOMAINS, listOwnerDecisions, toOwnerDecision, isExpired, auditDecisionAction, verifyStepupToken } from '@/lib/owner-app/decisions'
import { recordEvent } from '@/lib/moat/recordEvent'
import { resolveMembership, requireDecisionAction } from '@/lib/access/membership'
import { maskDecisionsForMember, maskDecisionForMember } from '@/lib/access/mask'
import { PATCH as hypothesisPatch } from '@/app/api/aria/hypotheses/[id]/route'

// OWNER-APP PH-1 — the one read+act route the phone app calls. Method-switched (GET list, POST
// act) per the brief's fn-budget instruction, rather than two separate route files.
//
// Server is authoritative throughout: every read goes through the request-scoped client so RLS's
// existing own_autopilot policy (business_id IN (SELECT id FROM businesses WHERE user_id =
// auth.uid())) enforces tenant scoping on its own, and verifyBusinessAccess (the same helper
// pos/warehouse/replenish and friends already use) is an explicit second check on the write path —
// never trust a client-supplied business_id alone.

// GET /api/owner/decisions?business_id=X&status=waiting&domain=all
async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const business_id = searchParams.get('business_id')
  const status = searchParams.get('status') ?? 'waiting'
  const domain = searchParams.get('domain') ?? 'all'
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  const denied = await verifyBusinessAccess(user.id, business_id)
  if (denied) return denied

  // ACCESS-MODEL-1 — RLS already admitted this caller to the rows (owner or linked member).
  // Masking is the SECOND layer: a member sees the row but not the fields their flags forbid.
  const membership = await resolveMembership(user.id, business_id)
  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const decisions = maskDecisionsForMember(
    await listOwnerDecisions(supabase, business_id, { status, domain }),
    membership,
  )

  // Live counts per domain (for the Decisions tab's filter-chip badges) — always counts
  // status='pending' (the brief's 'waiting') regardless of the requested status filter, since the
  // chips show how much is currently awaiting the owner, not how much matches the current view.
  const counts: Record<string, number> = { all: 0, money: 0, people: 0, growth: 0, supply: 0, compliance: 0 }
  const { data: countRows } = await supabase
    .from('aria_autopilot_actions')
    .select('domain')
    .eq('business_id', business_id)
    .eq('status', 'pending')
  for (const r of (countRows ?? []) as Array<{ domain: string | null }>) {
    counts.all++
    if (r.domain && DOMAINS.includes(r.domain as (typeof DOMAINS)[number])) counts[r.domain]++
  }

  return NextResponse.json({ decisions, counts })
}

// POST /api/owner/decisions { business_id, id, action:'approve'|'decline', stepup_token? }
async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as {
    business_id?: string; id?: string; action?: 'approve' | 'decline'; stepup_token?: string
  }
  const { business_id, id, action, stepup_token } = body
  if (!business_id || !id || (action !== 'approve' && action !== 'decline')) {
    return NextResponse.json({ error: 'business_id, id, and a valid action are required' }, { status: 400 })
  }

  const denied = await verifyBusinessAccess(user.id, business_id)
  if (denied) return denied

  const { data: row } = await supabase
    .from('aria_autopilot_actions')
    .select('*')
    .eq('id', id).eq('business_id', business_id)
    .maybeSingle()
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (row.status !== 'pending' || isExpired({ expires_at: row.expires_at as string | null, status: row.status as string })) {
    return NextResponse.json({ error: 'not_waiting', status: row.status }, { status: 409 })
  }

  // ACCESS-MODEL-1 — THE CAPABILITY GATE, server-side. A manager may act on people/growth/supply/
  // compliance decisions; a MONEY decision is visible to them read-only and any action is rejected
  // here regardless of what the UI showed. Runs BEFORE the status flip, so an out-of-role POST
  // changes nothing. The owner's money step-up below is untouched and still owner-bound.
  const actingMembership = await resolveMembership(user.id, business_id)
  const outOfRole = requireDecisionAction(actingMembership, {
    domain: row.domain as string | null,
    requires_stepup: row.requires_stepup as boolean | null,
  })
  if (outOfRole) return outOfRole

  if (row.requires_stepup && action === 'approve') {
    if (!stepup_token || !verifyStepupToken(stepup_token, user.id)) {
      return NextResponse.json({ error: 'step_up_required' }, { status: 428 })
    }
  }

  const before_status = row.status as string
  const after_status = action === 'approve' ? 'approved' : 'rejected'
  const now = new Date().toISOString()

  const { data: updated, error: updateErr } = await supabaseAdmin
    .from('aria_autopilot_actions')
    .update({
      status: after_status,
      resolved_by: user.id,
      resolved_at: now,
      ...(action === 'approve' ? { approved_at: now } : {}),
    })
    .eq('id', id).eq('business_id', business_id).eq('status', 'pending') // re-check status atomically against a double-submit
    .select('*')
    .maybeSingle()

  if (updateErr || !updated) return NextResponse.json({ error: 'not_waiting', status: row.status }, { status: 409 })

  await auditDecisionAction({
    business_id, actor_user_id: user.id, decision_id: id,
    verb: action, before_status, after_status,
  })

  // OWNER-APP PH-2, Part B — the outcome/event spine. latency_seconds is a real, computed figure
  // (resolved_at - created_at on the same row, both already-real timestamps), never invented.
  // decided_vs_proposed is always false this sprint — there's no mechanism yet letting the owner
  // edit amount/kind before approving (a straight accept/decline), so recording anything else
  // would be a fabricated signal, not a real one.
  const latencySeconds = Math.round((new Date(now).getTime() - new Date(row.created_at as string).getTime()) / 1000)
  await recordEvent({
    business_id,
    entity_type: 'decision',
    entity_id: id,
    event_type: action === 'approve' ? 'approved' : 'declined',
    domain: (row.domain as string) ?? null,
    amount_cents: (row.amount_cents as number) ?? null,
    actor: 'owner',
    payload_summary: {
      kind: (row.kind as string) ?? (row.action_type as string) ?? undefined,
      domain: (row.domain as string) ?? null,
      amount_cents: (row.amount_cents as number) ?? null,
      decided_vs_proposed: false,
      latency_seconds: latencySeconds,
    },
  })

  // BRAIN-LOOP-1 — if this decision was a surfaced HYPOTHESIS, resolve it through the EXISTING
  // acceptance path (PATCH /api/aria/hypotheses/[id]) rather than a second handler. That route
  // creates the aria_actions row and fires onActionApproved() for the baseline snapshot — the step
  // that finally gives runOutcomeChecks() something to measure. Calling the route in-process is the
  // same pattern owner/ask uses for the Aria brain; cookies are forwarded so it authenticates the
  // same owner and applies its own checks. Fire-and-forget: the owner's decision is already
  // recorded above and must not fail if the hypothesis bridge does.
  const hypothesisId = (row.action_data as Record<string, unknown> | null)?.hypothesis_id as string | undefined
  if (hypothesisId) {
    void (async () => {
      try {
        const patchReq = new Request(new URL('/api/aria/hypotheses/' + hypothesisId, req.url).toString(), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', cookie: req.headers.get('cookie') ?? '' },
          body: JSON.stringify(
            action === 'approve'
              ? { status: 'accepted' }
              : { status: 'rejected', rejection_reason: 'Declined by owner from the Decisions queue' },
          ),
        })
        await hypothesisPatch(patchReq, { params: { id: hypothesisId } })
      } catch (e) { console.error('[decisions] hypothesis bridge failed (non-fatal):', (e as Error).message) }
    })()
  }

  // EXECUTE HOOK: <kind> — approving here only flips status + audits. Actually paying/publishing/
  // dispatching per decision `kind` (supplier_bills, pay_run, roster_publish, leave_request,
  // reel_schedule, winback_campaign, purchase_order, food_safety_signoff, ...) is wired in later,
  // per-kind sprints (post PH-1). This is the seam those sprints hook into.

  return NextResponse.json({
    decision: actingMembership ? maskDecisionForMember(toOwnerDecision(updated), actingMembership) : toOwnerDecision(updated),
  })
}

export const GET = withErrorCapture('owner/decisions', _GET)
export const POST = withErrorCapture('owner/decisions', _POST)
