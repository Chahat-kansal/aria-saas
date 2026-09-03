export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { buildWorkPlan, renderPlan } from '@/lib/aria/works/plan'
import { savePlan, loadPlan } from '@/lib/aria/works/persist'

/**
 * M11 PHASE 3 — ASK FOR A PLAN.
 *
 * The owner describes an outcome; this returns ordered steps, each saying what it will do and
 * whether it needs them. **It executes nothing.**
 *
 * M11B PHASE 1 — IT NOW WRITES. The plan lands as an `aria_plans` row and its steps as
 * `aria_autopilot_actions` rows with `plan_id` / `step_index`, so the owner can come back to it,
 * approve it and see what happened. Writing is not executing: every step is `pending` and nothing
 * has run. An unplannable request is written too, as `abandoned` with `unplannable_reason`, so the
 * owner sees the sentence instead of the request vanishing.
 *
 * `dynamic = 'force-dynamic'` because this reads the session: without it a build-time render of an
 * authenticated route is the `Dynamic server usage` error that wrote 2,272 false failure rows for
 * nightly-sync over three months (S9 finding #11). 72 of 73 cron routes already carry it; every
 * route that reads `headers()` needs it too.
 *
 * The composer calls this behind an EXPLICIT owner gesture (the Delegate control), never by
 * guessing that a message is a delegation rather than a question — that guess would silently change
 * every turn.
 */

const MAX_REQUEST_CHARS = 2000

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const request = typeof body.request === 'string' ? body.request.trim() : ''
  const businessId = typeof body.business_id === 'string' ? body.business_id : ''

  if (!request) return NextResponse.json({ error: 'request required' }, { status: 400 })
  if (!businessId) return NextResponse.json({ error: 'business_id required' }, { status: 400 })
  if (request.length > MAX_REQUEST_CHARS) {
    return NextResponse.json({ error: 'request too long' }, { status: 400 })
  }

  // RULE 7 — every business-data route verifies the caller owns the business_id. This route reads
  // nothing of the business's yet, but it will bill an AI call against it and it names its
  // capabilities, so the check belongs here rather than being added later when it matters more.
  const { data: biz, error: bizErr } = await supabase
    .from('businesses').select('id').eq('id', businessId).eq('user_id', user.id).maybeSingle()
  if (bizErr) {
    console.error('[works/plan] business lookup failed:', bizErr.message)
    return NextResponse.json({ error: 'Could not verify the business' }, { status: 500 })
  }
  if (!biz) return NextResponse.json({ error: 'Business not found' }, { status: 404 })

  const conversationId = typeof body.conversation_id === 'string' ? body.conversation_id : null

  const plan = await buildWorkPlan(request, { businessId })

  // A provider outage must not write an 'abandoned' plan blaming the owner's request. buildWorkPlan
  // returns that case with this exact sentence; it is the one unplannable result NOT persisted.
  const providerDown = !plan.ok && plan.reason.startsWith('Aria could not reach the model')

  const saved = providerDown ? null : await savePlan(plan, { business_id: businessId, conversation_id: conversationId })

  if (saved && !saved.ok) {
    // The write failed and the plan was marked abandoned. Say so — never return a plan the owner
    // can see but not act on, and never a plan_id for a plan missing steps.
    return NextResponse.json({ error: saved.reason, plan: null, executed: false }, { status: 500 })
  }

  const stored = saved?.ok ? await loadPlan(saved.plan_id, businessId) : null

  // Both outcomes are 200. "I cannot plan that" is an ANSWER, not a failure — a 4xx would make the
  // client render an error where Aria has said something true and useful.
  return NextResponse.json({
    plan_id: saved?.ok ? saved.plan_id : null,
    plan,
    stored,
    rendered: renderPlan(plan),
    // Said in the payload as well as in the prose, so no client can render this as though
    // something happened.
    executed: false,
  })
}

export const POST = withErrorCapture('aria/works/plan', _POST)
