export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { limit } from '@/lib/rate-limit'

export async function GET(req: Request, { params }: { params: { sale_id: string } }) {
  const ip = (req.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0].trim()
  const rl = await limit('receipt:ip:' + ip, { requests: 20, window: '1 m' })
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    )
  }

  const { sale_id } = params
  if (!sale_id) return NextResponse.json({ error: 'sale_id required' }, { status: 400 })

  // PII policy: name only (no email/phone). Voided sales are excluded.
  const { data: sale } = await supabaseAdmin
    .from('pos_sales')
    .select('id, sale_number, total_amount, tax_amount, discount_amount, payment_method, status, created_at, business_id, pos_customers(name)')
    .eq('id', sale_id)
    .neq('status', 'voided')
    .maybeSingle()

  if (!sale) return NextResponse.json({ error: 'Receipt not found' }, { status: 404 })

  const bid = sale.business_id as string

  const [itemsRes, paymentsRes, bizRes] = await Promise.all([
    supabaseAdmin
      .from('pos_sale_items')
      .select('product_name, quantity, unit_price, discount_percent, line_total, modifiers')
      .eq('sale_id', sale_id),
    supabaseAdmin
      .from('pos_sale_payments')
      .select('method, amount_cents, reference')
      .eq('sale_id', sale_id),
    // Business contact info for the receipt header — scoped by the sale's own business_id.
    supabaseAdmin
      .from('businesses')
      .select('name, abn, phone, email, address')
      .eq('id', bid)
      .maybeSingle(),
  ])

  // Strip PII to first name only — email and phone are never returned.
  const rawName = (sale.pos_customers as { name?: string | null } | null)?.name ?? null
  const firstName = rawName ? rawName.split(' ')[0] : null

  return NextResponse.json({
    sale: {
      id: sale.id,
      sale_number: sale.sale_number,
      total_amount: sale.total_amount,
      tax_amount: sale.tax_amount,
      discount_amount: sale.discount_amount,
      payment_method: sale.payment_method,
      created_at: sale.created_at,
      customer: firstName ? { name: firstName } : null,
    },
    items: itemsRes.data ?? [],
    payments: (paymentsRes.data ?? []).map((p: { method?: string | null; amount_cents?: number | null; reference?: string | null }) => ({
      payment_method: p.method,
      amount: (p.amount_cents ?? 0) / 100,
      reference: p.reference,
    })),
    business: bizRes.data,
  })
}