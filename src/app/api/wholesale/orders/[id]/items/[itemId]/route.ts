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
    .select('id, business_id')
    .eq('id', orderId)
    .in('business_id', bizIds)
    .maybeSingle()
  return order
}

const UpdateItemSchema = z.object({
  quantity: z.number().positive().int().optional(),
  unit_price: z.number().min(0).optional(),
  discount_pct: z.number().min(0).max(100).optional(),
})

async function _PATCH(
  req: Request,
  { params }: { params: { id: string; itemId: string } }
) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const order = await verifyOrderOwnership(params.id, user.id)
  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const parsed = await validateBody(req, UpdateItemSchema)
  if ('error' in parsed) return parsed.error
  const updates = parsed.data

  // Fetch current item to calculate new totals
  const { data: current } = await supabaseAdmin
    .from('wholesale_order_items')
    .select('*')
    .eq('id', params.itemId)
    .eq('order_id', params.id)
    .maybeSingle()

  if (!current) return NextResponse.json({ error: 'Item not found' }, { status: 404 })

  const quantity = updates.quantity ?? current.quantity
  const unit_price = updates.unit_price ?? current.unit_price
  const discount_pct = updates.discount_pct ?? current.discount_pct ?? 0

  const gross_line = Math.round(unit_price * quantity * 100) / 100
  const discount_amount = Math.round(gross_line * (discount_pct / 100) * 100) / 100
  const line_total = Math.round((gross_line - discount_amount) * 100) / 100
  const gst_amount = Math.round(line_total * 0.10 * 100) / 100

  const { data: item, error } = await supabaseAdmin
    .from('wholesale_order_items')
    .update({
      quantity,
      unit_price,
      discount_pct,
      discount_amount,
      line_total,
      gst_amount,
    })
    .eq('id', params.itemId)
    .eq('order_id', params.id)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ item })
}

export const PATCH = withErrorCapture('wholesale/orders/[id]/items/[itemId]', _PATCH)
