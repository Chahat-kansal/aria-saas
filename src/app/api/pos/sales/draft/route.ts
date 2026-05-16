export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 10

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const body = await req.json().catch(() => ({}))
  const { cart_items = [], total_amount = 0, tax_amount = 0, outlet_id, served_by, customer_id } = body

  if (!Array.isArray(cart_items) || cart_items.length === 0) {
    return NextResponse.json({ error: 'cart_items required' }, { status: 400 })
  }

  const { data: sale, error: saleErr } = await supabase
    .from('pos_sales')
    .insert({
      business_id: bid,
      outlet_id: outlet_id ?? null,
      status: 'draft',
      payment_method: 'split',
      total_amount,
      subtotal: total_amount - tax_amount,
      tax_amount,
      discount_amount: 0,
      served_by: served_by ?? user.email ?? 'unknown',
      customer_id: customer_id ?? null,
    })
    .select('id')
    .single()

  if (saleErr || !sale) {
    return NextResponse.json({ error: saleErr?.message ?? 'Failed to create draft sale' }, { status: 500 })
  }

  const itemRows = cart_items.map((it: any) => ({
    sale_id: sale.id,
    business_id: bid,
    product_id: it.product_id ?? it.id ?? null,
    product_name: it.product_name ?? it.name ?? 'Unknown',
    quantity: it.quantity ?? it.qty ?? 1,
    unit_price: it.unit_price ?? it.price ?? 0,
    line_total: it.line_total ?? ((it.quantity ?? it.qty ?? 1) * (it.unit_price ?? it.price ?? 0)),
    tax_rate: 10,
    discount_percent: 0,
  }))

  const { error: itemsErr } = await supabase.from('pos_sale_items').insert(itemRows)
  if (itemsErr) {
    await supabase.from('pos_sales').delete().eq('id', sale.id)
    return NextResponse.json({ error: itemsErr.message }, { status: 500 })
  }

  return NextResponse.json({ sale_id: sale.id, status: 'draft' })
}

export const POST = withErrorCapture('pos/sales/draft', _POST)