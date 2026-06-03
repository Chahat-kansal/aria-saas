export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _GET(req: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const business_id = req.nextUrl.searchParams.get('business_id')
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })
  const { data: biz } = await supabase.from('businesses').select('id')
    .eq('id', business_id).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const monthStart = new Date()
  monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0)

  const { data: logs } = await supabaseAdmin.from('reel_usage_log')
    .select('cost_aud, duration_seconds, reel_mode, created_at')
    .eq('business_id', business_id)
    .gte('created_at', monthStart.toISOString())
    .order('created_at', { ascending: false })

  const total = (logs ?? []).reduce((s, r) => s + (r.cost_aud ?? 0), 0)
  return NextResponse.json({
    month: monthStart.toISOString().slice(0, 7),
    total_cost_aud: Math.round(total * 100) / 100,
    reel_count: logs?.length ?? 0,
    logs: logs ?? [],
  })
}

export const GET = withErrorCapture('social/reel-billing', _GET)
