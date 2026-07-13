export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { runWorkforceInsights } from '@/lib/staff/workforce-brain'
import { getBid } from '@/lib/auth/get-bid'

async function _GET(_req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ insights: [] })

  const { data } = await supabase.from('aria_actions')
    .select('id, title, recommendation, expected_impact, confidence, priority, status, created_at, payload')
    .eq('business_id', bid).eq('category', 'staff').eq('source', 'workforce_brain')
    .order('created_at', { ascending: false }).limit(10)

  return NextResponse.json({ insights: data ?? [] })
}

async function _POST(_req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  await runWorkforceInsights(bid)
  return NextResponse.json({ ok: true })
}

export const GET = withErrorCapture('staff/workforce-insights', _GET)
export const POST = withErrorCapture('staff/workforce-insights', _POST)
