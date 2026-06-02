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
    .select('id, business_id, customer_id')
    .eq('id', orderId)
    .in('business_id', bizIds)
    .maybeSingle()
  return order
}

function calcWholesalePrice(product: Record<string, unknown>, customer: Record<string, unknown> | null): number {
  // 1. Use cost_price if present
  if (product.cost_price != null && Number(product.cost_price) > 0) {
    return Number(product.cost_price)
  }
  // 2. Apply wholesale tier discount on retail price
  const retail = Number(product.price) || 0
  const tier = Number(customer?.wholesale_tier) || 0
  if (tier === 1) return Math.round(retail * 0.85 * 100) / 100
  if (tier === 2) return Math.round(retail * 0.78 * 100) / 100
  if (tier === 3) return Math.round(retail * 0.70 * 100) / 100
  return retail
}

const AddItemSchema = z.object({
  product_id: z.string().uuid().optional().nullable(),
  sku: z.string().optional().nullable(),
  name: z.string().min(1).max(500),
  description: z.string().optional().nullable(),
  quantity: z.number().positive().int(),
  unit_price_override: z.number().min(0).optional().nullable(),
})

async function _POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const order = await verifyOrderOwnership(params.id, user.id)
  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const parsed = await validateBody(req, AddItemSchema)
  if ('error' in parsed) return parsed.error
  const { product_id, sku, name, description, quantity, unit_price_override } = parsed.data

  // Fetch product for auto-pricing
  let product: Record<string, unknown> | null = null
  if (product_id) {
    const { data: p } = await supabaseAdmin.from('pos_products').select('id, name, sku, price, cost_price').eq('id', product_id).maybeSingle()
    product = p
  }

  // Fetch customer for tier pricing
  let customer: Record<string, unknown> | null = null
  if (order.customer_id) {
    const { data: c } = await supabaseAdmin.from('customers').select('wholesale_tier, wholesale_discount_pct').eq('id', order.customer_id).maybeSingle()
    customer = c
  }

  const unit_price = unit_price_override != null
    ? unit_price_override
    : (product ? calcWholesalePrice(product, customer) : 0)

  const retail_price = product ? (Number(product.price) || 0) : unit_price
  const line_total = Math.round(unit_price * quantity * 100) / 100
  const gst_amount = Math.round(line_total * 0.10 * 100) / 100

  // Get position
  const { count } = await supabaseAdmin
    .from('wholesale_order_items')
    .select('id', { count: 'exact', head: true })
    .eq('order_id', params.id)

  const { data: item, error } = await supabaseAdmin.from('wholesale_order_items').insert({
    order_id: params.id,
    product_id: product_id ?? null,
    sku: sku ?? (product?.sku as string | null) ?? null,
    name,
    description: description ?? null,
    quantity,
    unit_price,
    retail_price,
    discount_pct: 0,
    discount_amount: 0,
    line_total,
    gst_amount,
    position: (count ?? 0),
  }).select('*').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ item }, { status: 201 })
}

const RemoveItemSchema = z.object({
  item_id: z.string().uuid(),
})

async function _DELETE(req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const order = await verifyOrderOwnership(params.id, user.id)
  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const parsed = await validateBody(req, RemoveItemSchema)
  if ('error' in parsed) return parsed.error
  const { item_id } = parsed.data

  const { error } = await supabaseAdmin
    .from('wholesale_order_items')
    .delete()
    .eq('id', item_id)
    .eq('order_id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

export const POST   = withErrorCapture('wholesale/orders/[id]/items', _POST)
export const DELETE = withErrorCapture('wholesale/orders/[id]/items', _DELETE)
