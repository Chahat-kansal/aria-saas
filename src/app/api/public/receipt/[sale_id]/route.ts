export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

export async function GET(_req: Request, { params }: { params: { sale_id: string } }) {
  const { sale_id } = params
  if (!sale_id) return NextResponse.json({ error: 'sale_id required' }, { status: 400 })

  const sb = adminClient()

  const { data: sale } = await sb.from('pos_sales')
    .select('id, sale_number, total_amount, tax_amount, discount_amount, payment_method, status, created_at, business_id, pos_customers(name, email, phone)')
    .eq('id', sale_id)
    .neq('status', 'voided')
    .maybeSingle()

  if (!sale) return NextResponse.json({ error: 'Receipt not found' }, { status: 404 })

  const [itemsRes, paymentsRes, bizRes] = await Promise.all([
    sb.from('pos_sale_items')
      .select('product_name, quantity, unit_price, discount_percent, line_total, modifiers')
      .eq('sale_id', sale_id),
    sb.from('pos_sale_payments')
      .select('method, amount_cents, reference')
      .eq('sale_id', sale_id),
    sb.from('businesses')
      .select('name, abn, phone, email, address')
      .eq('id', sale.business_id)
      .maybeSingle(),
  ])

  return NextResponse.json({
    sale: {
      id: sale.id,
      sale_number: sale.sale_number,
      total_amount: sale.total_amount,
      tax_amount: sale.tax_amount,
      discount_amount: sale.discount_amount,
      payment_method: sale.payment_method,
      created_at: sale.created_at,
      customer: sale.pos_customers,
    },
    items: itemsRes.data ?? [],
    payments: (paymentsRes.data ?? []).map((p: any) => ({ payment_method: p.method, amount: (p.amount_cents ?? 0) / 100, reference: p.reference })),
    business: bizRes.data,
  })
}
