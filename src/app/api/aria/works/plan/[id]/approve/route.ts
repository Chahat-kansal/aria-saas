export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { approvePlan } from '@/lib/aria/works/approve'
import { loadPlan } from '@/lib/aria/works/persist'
import { toNullableUuid } from '@/lib/utils/uuid-helpers'

/**
 * M11B PHASE 2 — THE OWNER APPROVES A PLAN.
 *
 * Approving does not execute. It records that the owner said yes, and phase 3's runner asks
 * `canRun` before it does anything. Keeping the two apart means an approval can be recorded, read
 * back and audited without anything having happened yet — and it means a re-approve is a no-op
 * rather than a second run.
 *
 * The business is resolved from the caller's own row, never from the request body: a plan id in a
 * URL must not be a way to approve somebody else's work.
 */
async function _POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  const planId = toNullableUuid(id)
  if (!planId) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const claimed = typeof body.business_id === 'string' ? body.business_id : ''
  if (!claimed) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  // RULE 7 — the caller must own the business. Verified against `businesses`, using the request
  // client (which carries the session), before anything is written.
  const { data: biz, error: bizErr } = await supabase
    .from('businesses').select('id').eq('id', claimed).eq('user_id', user.id).maybeSingle()
  if (bizErr) {
    console.error('[works/approve] business lookup failed:', bizErr.message)
    return NextResponse.json({ error: 'Could not verify the business' }, { status: 500 })
  }
  if (!biz) return NextResponse.json({ error: 'Business not found' }, { status: 404 })

  const result = await approvePlan(planId, claimed, user.id)

  if (!result.ok) {
    if (result.reason === 'not_found') return NextResponse.json({ error: 'Plan not found' }, { status: 404 })
    if (result.reason === 'error') return NextResponse.json({ error: result.message }, { status: 500 })
    // ALREADY APPROVED IS NOT AN ERROR. A second click, a second tab or a retry lands here, and the
    // honest answer is the plan's current state — not a 409 the owner has to interpret.
    const stored = await loadPlan(planId, claimed)
    return NextResponse.json({
      approved: false,
      already: true,
      note: 'This plan was already past the approval step — nothing changed.',
      stored,
    })
  }

  const stored = await loadPlan(planId, claimed)
  return NextResponse.json({ approved: true, plan: result.plan, stored, executed: false })
}

export const POST = withErrorCapture('aria/works/plan/approve', _POST)
