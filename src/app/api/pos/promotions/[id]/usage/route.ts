export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string) {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  return data?.id ?? null
}

type Params = { params: Promise<{ id: string }> }

async function _GET(req: Request, { params }: Params) {
  const { id } = await params
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const { data: promo } = await supabase.from('pos_promotions')
    .select('id, name, current_uses, max_total_uses')
    .eq('id', id).eq('business_id', bid).maybeSingle()
  if (!promo) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: redemptions } = await supabase.from('pos_promotion_redemptions')
    .select('amount_off, created_at, customer_id, pos_customers(name)')
    .eq('business_id', bid).eq('promotion_id', id)
    .order('created_at', { ascending: false })
    .limit(100)

  const total_amount_off = (redemptions ?? []).reduce((s, r) => s + (Number(r.amount_off) || 0), 0)

  return NextResponse.json({
    promotion: promo,
    redemptions: redemptions ?? [],
    total_redemptions: (redemptions ?? []).length,
    total_amount_off: +total_amount_off.toFixed(2),
  })
}

export const GET = withErrorCapture('pos/promotions/[id]/usage', _GET)