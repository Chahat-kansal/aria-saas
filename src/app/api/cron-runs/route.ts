export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify user has a business (owner gate)
  const { data: biz } = await supabase
    .from('businesses')
    .select('id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const url = new URL(req.url)
  const limit = Math.min(Number(url.searchParams.get('limit') ?? '20'), 100)
  const cronName = url.searchParams.get('cron') ?? undefined

  let query = supabaseAdmin
    .from('cron_runs')
    .select('id,cron_name,started_at,completed_at,status,duration_ms,rows_affected,error')
    .order('started_at', { ascending: false })
    .limit(limit)

  if (cronName) query = query.eq('cron_name', cronName)

  const { data: runs, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ runs: runs ?? [] })
}

export const GET = withErrorCapture('cron-runs', _GET)
