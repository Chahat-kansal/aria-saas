export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _GET(_req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString()

  const { data, error } = await supabaseAdmin
    .from('pos_sales')
    .select('created_at, total_amount')
    .eq('business_id', bid)
    .neq('status', 'voided')
    .gte('created_at', thirtyDaysAgo)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rev: number[] = Array(24).fill(0)
  const cnt: number[] = Array(24).fill(0)
  for (const s of (data ?? [])) {
    // Convert UTC to AEST (UTC+10)
    const h = (new Date(s.created_at as string).getUTCHours() + 10) % 24
    rev[h] += Number(s.total_amount ?? 0)
    cnt[h]++
  }
  const hourly = rev.map((r, i) => ({
    hour: i,
    avg: cnt[i] > 0 ? Math.round(r / cnt[i]) : 0,
    count: cnt[i],
  }))

  return NextResponse.json({ hourly })
}

export const GET = withErrorCapture('pos/hourly-heatmap', _GET)
