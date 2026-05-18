export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { ariaInvoke } from '@/lib/aria/invoke'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string) {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  return data?.id ?? null
}

// Sprint Intel v2: route through full 4-layer architecture (judge + rate limit + observability)
async function _POST(_req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ leaks: [], total_monthly_impact_cents: 0, reason: 'No business' })

  const result = await ariaInvoke('ops_narrative', bid, { includeWeather: false })
  return NextResponse.json({
    leaks: [],
    total_monthly_impact_cents: 0,
    narrative: result.recommendation?.description ?? null,
    title: result.recommendation?.title ?? null,
    insight: result.recommendation?.description ?? null,
    reason: result.reason,
    cost_usd_cents: result.total_cost_cents,
  })
}

export const POST = withErrorCapture('aria/profit-analysis', _POST)
