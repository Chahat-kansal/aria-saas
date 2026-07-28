export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { verifyBusinessAccess } from '@/lib/auth/verify-business-access'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { DOMAINS, listOwnerDecisions, toOwnerDecision, isExpired, auditDecisionAction, verifyStepupToken } from '@/lib/owner-app/decisions'

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

  const decisions = await listOwnerDecisions(supabase, business_id, { status, domain })

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

  // EXECUTE HOOK: <kind> — approving here only flips status + audits. Actually paying/publishing/
  // dispatching per decision `kind` (supplier_bills, pay_run, roster_publish, leave_request,
  // reel_schedule, winback_campaign, purchase_order, food_safety_signoff, ...) is wired in later,
  // per-kind sprints (post PH-1). This is the seam those sprints hook into.

  return NextResponse.json({ decision: toOwnerDecision(updated) })
}

export const GET = withErrorCapture('owner/decisions', _GET)
export const POST = withErrorCapture('owner/decisions', _POST)
