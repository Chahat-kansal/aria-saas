export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { z } from 'zod'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { validateBody } from '@/lib/api/validate'

async function verifyOrderOwnership(orderId: string, userId: string) {
  const supabase = createServerSupabaseClient()
  const { data: biz } = await supabase.from('businesses').select('id').eq('user_id', userId)
  if (!biz || biz.length === 0) return null
  const bizIds = biz.map((b: { id: string }) => b.id)

  const { data: order } = await supabaseAdmin
    .from('wholesale_orders')
    .select('id, business_id, customer_id, freight')
    .eq('id', orderId)
    .in('business_id', bizIds)
    .maybeSingle()
  return order
}

const RecalcSchema = z.object({
  freight: z.number().min(0).optional(),
})

async function _POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const order = await verifyOrderOwnership(params.id, user.id)
  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const parsed = await validateBody(req, RecalcSchema)
  if ('error' in parsed) return parsed.error
  const { freight: freightOverride } = parsed.data

  // Fetch all items
  const { data: items } = await supabaseAdmin
    .from('wholesale_order_items')
    .select('line_total')
    .eq('order_id', params.id)

  const subtotal = (items ?? []).reduce((s: number, i: { line_total: number }) => s + (Number(i.line_total) || 0), 0)

  // Fetch customer discount
  let customerDiscountPct = 0
  if (order.customer_id) {
    const { data: cust } = await supabaseAdmin
      .from('customers')
      .select('wholesale_discount_pct')
      .eq('id', order.customer_id)
      .maybeSingle()
    customerDiscountPct = Number(cust?.wholesale_discount_pct) || 0
  }

  const discount_total = Math.round(subtotal * (customerDiscountPct / 100) * 100) / 100
  const freight = freightOverride != null ? freightOverride : (Number(order.freight) || 0)
  const taxable = subtotal - discount_total + freight
  const gst_total = Math.round(taxable * 0.10 * 100) / 100
  const total = Math.round((taxable + gst_total) * 100) / 100

  const { data: updated, error } = await supabaseAdmin
    .from('wholesale_orders')
    .update({ subtotal, discount_total, freight, gst_total, total })
    .eq('id', params.id)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ order: updated })
}

export const POST = withErrorCapture('wholesale/orders/[id]/totals', _POST)
