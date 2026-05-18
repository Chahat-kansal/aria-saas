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

async function _GET(req: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ narrative: null, reason: 'No business' })

  const result = await ariaInvoke('ops_narrative', bid, { includeWeather: true })
  return NextResponse.json({
    narrative: result.recommendation?.description ?? null,
    title: result.recommendation?.title ?? null,
    insight: result.recommendation?.description ?? null,
    reason: result.reason,
  })
}

export const GET = withErrorCapture('aria/live-intelligence', _GET)
export const POST = withErrorCapture('aria/live-intelligence', _POST)
