export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string) {
  const { data: active } = await supabaseAdmin.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No active business' }, { status: 400 })

  const url = new URL(req.url)
  const limit = Math.min(20, parseInt(url.searchParams.get('limit') ?? '7'))

  const { data: runs } = await supabaseAdmin
    .from('council_runs')
    .select('id, mode, created_at, brains_succeeded, brains_failed, synthesis_succeeded, fell_back_to_single_model, duration_ms, data_quality_score, synthesis_model, escalation_reason, honesty_flags')
    .eq('business_id', bid)
    .order('created_at', { ascending: false })
    .limit(limit)

  return NextResponse.json({ runs: runs ?? [] })
}

export const GET = withErrorCapture('aria/council-runs', _GET)
