import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { ariaInvoke } from '@/lib/aria/invoke'

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 45;

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string) {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  return data?.id ?? null
}

// Sprint Intel v2: route through full 4-layer architecture (judge + rate limit + observability)
async function _POST(req: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ narrative: null, reason: 'No business' })

  const result = await ariaInvoke('ops_narrative', bid, { includeWeather: true })
  return NextResponse.json({
    narrative: result.recommendation?.description ?? null,
    title: result.recommendation?.title ?? null,
    action: (result.recommendation?.payload as Record<string, unknown> | undefined)?.action ?? null,
    insight: result.recommendation?.description ?? null,
    reason: result.reason,
    cost_usd_cents: result.total_cost_cents,
  })
}

async function _GET(_req: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ live_summary: null, data_status: { freshness: 'empty' } })

  const { supabaseAdmin } = await import('@/lib/supabase-admin')

  // Get today's sales
  const todayStart = new Date(); todayStart.setHours(0,0,0,0)
  const { data: todaySales } = await supabaseAdmin
    .from('pos_sales').select('total_amount, created_at')
    .eq('business_id', bid).neq('status', 'voided')
    .gte('created_at', todayStart.toISOString())

  const todayRevenue = (todaySales ?? []).reduce((s, r) => s + (Number(r.total_amount) || 0), 0)
  const lastSale = todaySales?.length ? todaySales[todaySales.length - 1].created_at : null

  // Get fresh signals from cache
  const { data: signals } = await supabaseAdmin
    .from('aria_signal_cache')
    .select('signal_type, payload')
    .eq('business_id', bid)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(5)

  // Get latest aria action as narrative
  const { data: latestAction } = await supabaseAdmin
    .from('aria_actions')
    .select('title, recommendation')
    .eq('business_id', bid).eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1).maybeSingle()

  const freshness = todaySales?.length ? 'live' : 'stale'

  return NextResponse.json({
    live_summary: {
      today_revenue_cents: Math.round(todayRevenue * 100),
      sale_count: todaySales?.length ?? 0,
    },
    data_status: {
      freshness,
      last_sale_at: lastSale,
    },
    narrative: (latestAction as Record<string,unknown> | null)?.recommendation ?? null,
    title: (latestAction as Record<string,unknown> | null)?.title ?? null,
    signals: signals ?? [],
  })
}

export const GET = withErrorCapture('aria/live-intelligence', _GET)
export const POST = withErrorCapture('aria/live-intelligence', _POST)
