export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { z } from 'zod'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { validateBody } from '@/lib/api/validate'

async function verifyOwnership(orderId: string, userId: string) {
  const supabase = createServerSupabaseClient()
  const { data: biz } = await supabase.from('businesses').select('id').eq('user_id', userId)
  if (!biz || biz.length === 0) return null
  const bizIds = biz.map((b: { id: string }) => b.id)

  const { data: order } = await supabaseAdmin
    .from('wholesale_orders')
    .select('*')
    .eq('id', orderId)
    .in('business_id', bizIds)
    .maybeSingle()
  return order
}

async function _GET(req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const order = await verifyOwnership(params.id, user.id)
  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Fetch items
  const { data: items } = await supabaseAdmin
    .from('wholesale_order_items')
    .select('*')
    .eq('order_id', params.id)
    .order('position')

  // Fetch customer
  let customer = null
  if (order.customer_id) {
    const { data: cust } = await supabaseAdmin
      .from('customers')
      .select('id, name, email, business_name, abn, wholesale_tier, wholesale_discount_pct, shipping_address, billing_address, payment_terms_default')
      .eq('id', order.customer_id)
      .maybeSingle()
    customer = cust
  }

  return NextResponse.json({ order: { ...order, items: items ?? [], customer } })
}

const UpdateOrderSchema = z.object({
  po_ref: z.string().optional().nullable(),
  delivery_date: z.string().optional().nullable(),
  delivery_address: z.string().optional().nullable(),
  delivery_notes: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  status: z.enum(['draft', 'confirmed', 'invoiced', 'sent', 'partial', 'paid', 'cancelled']).optional(),
  payment_terms: z.string().optional().nullable(),
  freight: z.number().min(0).optional(),
})

async function _PATCH(req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const order = await verifyOwnership(params.id, user.id)
  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const parsed = await validateBody(req, UpdateOrderSchema)
  if ('error' in parsed) return parsed.error
  const updates: Record<string, unknown> = { ...parsed.data }

  if (updates.status === 'confirmed' && !order.confirmed_at) {
    updates.confirmed_at = new Date().toISOString()
  }

  const { data: updated, error } = await supabaseAdmin
    .from('wholesale_orders')
    .update(updates)
    .eq('id', params.id)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ order: updated })
}

const CancelSchema = z.object({
  cancelled_reason: z.string().optional(),
})

async function _DELETE(req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const order = await verifyOwnership(params.id, user.id)
  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const parsed = await validateBody(req, CancelSchema)
  if ('error' in parsed) return parsed.error
  const { cancelled_reason } = parsed.data

  const { data: updated, error } = await supabaseAdmin
    .from('wholesale_orders')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancelled_reason: cancelled_reason ?? null,
    })
    .eq('id', params.id)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ order: updated })
}

export const GET    = withErrorCapture('wholesale/orders/[id]', _GET)
export const PATCH  = withErrorCapture('wholesale/orders/[id]', _PATCH)
export const DELETE = withErrorCapture('wholesale/orders/[id]', _DELETE)
