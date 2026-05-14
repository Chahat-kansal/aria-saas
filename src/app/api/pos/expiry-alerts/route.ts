export const dynamic = 'force-dynamic'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string) {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const bid = searchParams.get('business_id') ?? await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ alerts: [] })

  const { data: alerts } = await supabase
    .from('pos_expiry_alerts')
    .select('*, pos_products(name)')
    .eq('business_id', bid)
    .eq('acknowledged', false)
    .order('days_until_expiry', { ascending: true })
    .limit(20)

  return NextResponse.json({
    alerts: (alerts ?? []).map((a: any) => ({
      ...a,
      product_name: a.pos_products?.name ?? 'Unknown product',
    })),
  })
}

async function _PATCH(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, acknowledged } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { error } = await supabase.from('pos_expiry_alerts')
    .update({ acknowledged: acknowledged ?? true }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export const GET   = withErrorCapture('pos/expiry-alerts', _GET)
export const PATCH = withErrorCapture('pos/expiry-alerts', _PATCH)