export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { listPlans, STEP_COLUMNS } from '@/lib/aria/works/persist'
import { toNullableUuid } from '@/lib/utils/uuid-helpers'

/**
 * M11B PHASE 5 — HISTORY. THE JOBS THAT BELONG TO A CONVERSATION.
 *
 * ── NO PARALLEL STORE ──────────────────────────────────────────────────────────────────────────
 * A job is reachable from its conversation and back through `aria_plans.conversation_id` and the
 * `?c=` thread URL M11 phase 1 put in the address bar. Nothing new is stored to make history work;
 * this route reads the rows the plan already wrote.
 *
 * ── COST RENDERS UNKNOWN ───────────────────────────────────────────────────────────────────────
 * `cost_usd_cents: null` below is deliberate and is the honest answer, not a gap left unfilled.
 * `aria_ai_calls` has NO linking column — no conversation_id, no request_id, no trace_id — so a
 * job's cost cannot be attributed to it by anything except a time window, which would be a
 * fabricated number. 11,029 rows carry a cost and not one can be tied to a plan. GROUNDING-TEETH:
 * an honest unknown beats a plausible figure, and the ledger is already known to undercount.
 * The one nullable column that would fix it is named in M11-MIGRATION-PROPOSAL.sql.
 */
async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ plans: [] }, { status: 401 })

  const url = new URL(req.url)
  const businessId = url.searchParams.get('business_id') ?? ''
  const conversationId = toNullableUuid(url.searchParams.get('conversation_id'))
  if (!businessId) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  const { data: biz, error: bizErr } = await supabase
    .from('businesses').select('id').eq('id', businessId).eq('user_id', user.id).maybeSingle()
  if (bizErr) {
    console.error('[works/plans] business lookup failed:', bizErr.message)
    return NextResponse.json({ error: 'Could not verify the business' }, { status: 500 })
  }
  if (!biz) return NextResponse.json({ error: 'Business not found' }, { status: 404 })

  const plans = await listPlans(businessId, { conversation_id: conversationId, limit: 20 })
  if (plans.length === 0) return NextResponse.json({ plans: [], cost_usd_cents: null })

  // One query for every step, not one per plan.
  const { data: steps, error: stepErr } = await supabaseAdmin
    .from('aria_autopilot_actions').select(STEP_COLUMNS)
    .eq('business_id', businessId)
    .in('plan_id', plans.map(p => p.id))
    .order('step_index', { ascending: true })

  // RULE 7 — an error is not an empty step list. A plan rendered with no steps reads as "Aria
  // planned nothing", when the truth is that the steps could not be read.
  if (stepErr) {
    console.error('[works/plans] step read failed:', stepErr.message)
    return NextResponse.json({ error: 'Could not read the plan steps' }, { status: 500 })
  }

  const byPlan = new Map<string, unknown[]>()
  for (const s of steps ?? []) {
    const key = String((s as { plan_id: string }).plan_id)
    const list = byPlan.get(key) ?? []
    list.push(s)
    byPlan.set(key, list)
  }

  return NextResponse.json({
    plans: plans.map(p => ({ plan: p, steps: byPlan.get(p.id) ?? [] })),
    // See the header. Never 0, never an estimate.
    cost_usd_cents: null,
    cost_note: 'Aria cannot yet say what a job cost — nothing links a model call to a plan.',
  })
}

export const GET = withErrorCapture('aria/works/plans', _GET)
