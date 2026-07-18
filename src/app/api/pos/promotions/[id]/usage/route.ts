export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { withErrorCapture, withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture'

type Params = { params: Promise<{ id: string }> }

async function _GET(req: Request, { params }: Params, { supabase, businessId: bid }: BusinessContext) {
  const { id } = await params
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

export const GET = withBusinessContext('pos/promotions/[id]/usage', _GET)