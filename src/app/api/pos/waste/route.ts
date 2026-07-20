export const dynamic = 'force-dynamic'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { withErrorCapture, withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ entries: [], total_cost_cents: 0 })

  const { searchParams } = new URL(req.url)
  const days = parseInt(searchParams.get('days') ?? '30')
  const since = new Date(Date.now() - days * 86400000).toISOString()

  const { data: entries, error } = await supabase
    .from('pos_waste_log')
    .select('*')
    .eq('business_id', bid)
    .gte('recorded_at', since)
    .order('recorded_at', { ascending: false })
    .limit(200)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const total_cost_cents = (entries ?? []).reduce((s, e) => s + (e.cost_cents ?? 0), 0)
  return NextResponse.json({ entries: entries ?? [], total_cost_cents })
}

export const GET = withErrorCapture('pos/waste', _GET)

async function _POST(req: Request, _ctx: unknown, { supabase, businessId: bid }: BusinessContext) {
  const { product_id, product_name, quantity, unit, reason, recorded_by, cost_cents } = await req.json()
  if (!product_name || !quantity) return NextResponse.json({ error: 'product_name and quantity required' }, { status: 400 })

  const { data, error } = await supabase.from('pos_waste_log').insert({
    business_id: bid,
    product_id: product_id ?? null,
    product_name, quantity, unit: unit ?? null,
    reason: reason ?? null, recorded_by: recorded_by ?? null,
    cost_cents: cost_cents ?? null,
    recorded_at: new Date().toISOString(),
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ entry: data })
}

export const POST = withBusinessContext('pos/waste', _POST)