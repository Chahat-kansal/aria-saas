export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _GET() {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const since = new Date(Date.now() - 7 * 86400000).toISOString()
  const { data } = await supabaseAdmin.from('customer_hub_clicks')
    .select('target').eq('business_id', bid).gte('created_at', since).limit(5000)

  const rows = data ?? []
  const visits = rows.filter(r => r.target === 'hub_view').length
  const byCard = new Map<string, number>()
  for (const r of rows) if (r.target && r.target !== 'hub_view') byCard.set(r.target, (byCard.get(r.target) ?? 0) + 1)
  const top = [...byCard.entries()].sort((a, b) => b[1] - a[1])[0]

  return NextResponse.json({
    visits_7d: visits,
    total_clicks_7d: rows.length - visits,
    top_card: top ? { target: top[0], count: top[1] } : null,
  })
}

export const GET = withErrorCapture('dashboard/hub-analytics', _GET)
