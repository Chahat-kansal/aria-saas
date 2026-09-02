export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { buildWorkPlan, renderPlan } from '@/lib/aria/works/plan'

/**
 * M11 PHASE 3 — ASK FOR A PLAN.
 *
 * The owner describes an outcome; this returns ordered steps, each saying what it will do and
 * whether it needs them. **It executes nothing and it writes nothing** — not a row, not a draft,
 * not an audit entry. The only side effect in the whole request is the planning model call, which
 * `runAriaModel` logs to `aria_ai_calls` like every other call.
 *
 * `dynamic = 'force-dynamic'` because this reads the session: without it a build-time render of an
 * authenticated route is the `Dynamic server usage` error that wrote 2,272 false failure rows for
 * nightly-sync over three months (S9 finding #11). 72 of 73 cron routes already carry it; every
 * route that reads `headers()` needs it too.
 *
 * ⚠️ NO SURFACE CALLS THIS YET, AND THAT IS DELIBERATE — see RUN-M11.md. Approve, execute, report
 * and history are parked on the DDL proposed in phase 2, and putting a plan in front of an owner
 * who then cannot approve or run it would be a worse experience than not offering it. Wiring it
 * into the composer is a decision about when a message is a delegation rather than a question,
 * which silently changes every turn, and is not something to do unattended.
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

  const plan = await buildWorkPlan(request, { businessId })

  // Both outcomes are 200. "I cannot plan that" is an ANSWER, not a failure — a 4xx would make the
  // client render an error where Aria has said something true and useful.
  return NextResponse.json({
    plan,
    rendered: renderPlan(plan),
    // Said in the payload as well as in the prose, so no client can render this as though
    // something happened.
    executed: false,
  })
}

export const POST = withErrorCapture('aria/works/plan', _POST)
