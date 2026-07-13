export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { generateRosterDraft } from '@/lib/aria/agents/rostering-agent'
import { hydrateShiftCosts } from '@/lib/staff/roster'
import { getBid } from '@/lib/auth/get-bid'

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const body = await req.json() as { week_start?: string; outlet_id?: string }
  const weekStart = String(body.week_start ?? '')
  if (!weekStart) return NextResponse.json({ error: 'week_start required' }, { status: 400 })

  const draft = await generateRosterDraft(bid, weekStart, body.outlet_id ? String(body.outlet_id) : null)
  const shifts = await hydrateShiftCosts(draft.shifts, bid)
  return NextResponse.json({ shifts, reasoning: draft.reasoning, cost_cents: draft.cost_cents, conflicts: draft.conflicts })
}

export const POST = withErrorCapture('staff/roster/ai-draft', _POST)
