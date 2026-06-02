export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { z } from 'zod'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { validateBody } from '@/lib/api/validate'

const Schema = z.object({
  business_id: z.string().uuid(),
  customer_id: z.string().uuid(),
})

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = await validateBody(req, Schema)
  if ('error' in parsed) return parsed.error
  const { business_id, customer_id } = parsed.data

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).single()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Find customer's last confirmed/invoiced/sent/paid order
  const { data: lastOrder } = await supabaseAdmin
    .from('wholesale_orders')
    .select('id, payment_terms, freight, delivery_address')
    .eq('business_id', business_id)
    .eq('customer_id', customer_id)
    .in('status', ['confirmed', 'invoiced', 'sent', 'paid'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!lastOrder) {
    return NextResponse.json({ error: 'No previous completed order found for this customer' }, { status: 404 })
  }

  // Fetch items from last order
  const { data: lastItems } = await supabaseAdmin
    .from('wholesale_order_items')
    .select('*')
    .eq('order_id', lastOrder.id)
    .order('position')

  // Generate new order number
  const { data: numData, error: numErr } = await supabaseAdmin.rpc('generate_wholesale_order_number')
  if (numErr) return NextResponse.json({ error: numErr.message }, { status: 500 })

  // Fetch customer payment terms
  let payment_terms = lastOrder.payment_terms ?? 'Net 14'
  const { data: cust } = await supabaseAdmin.from('customers').select('payment_terms_default').eq('id', customer_id).maybeSingle()
  if (cust?.payment_terms_default) payment_terms = cust.payment_terms_default

  // Create new draft order
  const { data: newOrder, error: orderErr } = await supabaseAdmin.from('wholesale_orders').insert({
    business_id,
    customer_id,
    order_number: numData as string,
    status: 'draft',
    source: 'reorder',
    payment_terms,
    delivery_address: lastOrder.delivery_address ?? null,
    freight: lastOrder.freight ?? 0,
    subtotal: 0,
    discount_total: 0,
    gst_total: 0,
    total: 0,
    created_by: user.id,
  }).select('*').single()

  if (orderErr) return NextResponse.json({ error: orderErr.message }, { status: 500 })

  // Duplicate items
  if (lastItems && lastItems.length > 0) {
    const newItems = lastItems.map((item: Record<string, unknown>, idx: number) => ({
      order_id: (newOrder as { id: string }).id,
      product_id: item.product_id ?? null,
      sku: item.sku ?? null,
      name: item.name,
      description: item.description ?? null,
      quantity: item.quantity,
      unit_price: item.unit_price,
      retail_price: item.retail_price ?? item.unit_price,
      discount_pct: item.discount_pct ?? 0,
      discount_amount: item.discount_amount ?? 0,
      line_total: item.line_total,
      gst_amount: item.gst_amount ?? 0,
      position: idx,
    }))
    await supabaseAdmin.from('wholesale_order_items').insert(newItems)
  }

  // Recalculate totals
  const subtotal = (lastItems ?? []).reduce((s: number, i: Record<string, unknown>) => s + (Number(i.line_total) || 0), 0)
  const freight = Number(lastOrder.freight) || 0

  // Get customer discount
  const { data: custFull } = await supabaseAdmin.from('customers').select('wholesale_discount_pct').eq('id', customer_id).maybeSingle()
  const discountPct = Number(custFull?.wholesale_discount_pct) || 0
  const discount_total = Math.round(subtotal * (discountPct / 100) * 100) / 100
  const taxable = subtotal - discount_total + freight
  const gst_total = Math.round(taxable * 0.10 * 100) / 100
  const total = Math.round((taxable + gst_total) * 100) / 100

  await supabaseAdmin.from('wholesale_orders').update({ subtotal, discount_total, freight, gst_total, total }).eq('id', (newOrder as { id: string }).id)

  // Log to aria_ai_calls
  try {
    await supabaseAdmin.from('aria_ai_calls').insert({
      business_id,
      agent_key: 'wholesale_reorder',
      model_id: 'none',
      role: 'other',
      input_tokens: 0,
      output_tokens: 0,
      success: true,
      request_summary: 'Reorder from last order for customer ' + customer_id,
      response_summary: 'Created new draft order ' + (newOrder as { order_number: string }).order_number,
    })
  } catch { /* non-fatal */ }

  const { data: finalOrder } = await supabaseAdmin.from('wholesale_orders').select('*').eq('id', (newOrder as { id: string }).id).single()
  return NextResponse.json({ order: finalOrder }, { status: 201 })
}

export const POST = withErrorCapture('wholesale/orders/from-last', _POST)
