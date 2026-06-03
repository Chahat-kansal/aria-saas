export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: biz } = await supabaseAdmin
    .from('businesses').select('id').eq('user_id', user.id).eq('is_active', true).limit(1).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Business not found' }, { status: 404 })

  const since = new Date(Date.now() - 30 * 86400000).toISOString()
  const { data: actions, error } = await supabaseAdmin
    .from('labour_optimisation_actions')
    .select('id,action_type,target_date,target_hour_start,target_hour_end,message_sent,reasoning,staff_response,responded_at,labour_cost_saving,executed_at,staff_members(first_name,last_name)')
    .eq('business_id', biz.id)
    .gte('executed_at', since)
    .order('executed_at', { ascending: false })
    .limit(100)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const list = actions ?? []
  const pending = list.filter(a => a.staff_response === 'pending')
  const accepted = list.filter(a => a.staff_response === 'accepted')
  const declined = list.filter(a => a.staff_response === 'declined')
  const totalSavings = accepted.reduce((s, a) => s + Number(a.labour_cost_saving ?? 0), 0)

  return NextResponse.json({
    actions: list,
    pending_responses: pending.length,
    accepted_count: accepted.length,
    declined_count: declined.length,
    total_savings_realised: Math.round(totalSavings * 100) / 100,
  })
}

async function _PATCH(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const body = await req.json().catch(() => null) as { staff_response?: string } | null
  if (!body?.staff_response) return NextResponse.json({ error: 'staff_response required' }, { status: 400 })
  if (!['accepted', 'declined', 'no_response'].includes(body.staff_response)) {
    return NextResponse.json({ error: 'Invalid staff_response' }, { status: 400 })
  }

  const { data: biz } = await supabaseAdmin
    .from('businesses').select('id').eq('user_id', user.id).eq('is_active', true).limit(1).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const { error } = await supabaseAdmin
    .from('labour_optimisation_actions')
    .update({ staff_response: body.staff_response, responded_at: new Date().toISOString() })
    .eq('id', id)
    .eq('business_id', biz.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export const GET = withErrorCapture('agents/labour/actions', _GET)
export const PATCH = withErrorCapture('agents/labour/actions', _PATCH)
