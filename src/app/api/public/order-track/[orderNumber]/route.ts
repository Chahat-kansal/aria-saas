export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { resolveBusinessId } from '@/lib/aria/resolve-business'

type Params = { params: Promise<{ orderNumber: string }> | { orderNumber: string } }

export async function GET(req: Request, { params }: Params) {
  const { orderNumber } = 'then' in params ? await params : params
  const { searchParams } = new URL(req.url)
  const slug = searchParams.get('slug')

  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 })

  const bid = await resolveBusinessId(supabaseAdmin, slug)
  if (!bid) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const { data: order } = await supabaseAdmin
    .from('pos_online_orders')
    .select('status, estimated_ready_at, updated_at, order_number, total, fulfillment_type')
    .eq('order_number', orderNumber)
    .eq('business_id', bid)
    .maybeSingle()

  if (!order) return NextResponse.json({ error: 'not found' }, { status: 404 })

  return NextResponse.json({
    status: order.status,
    estimated_ready_at: order.estimated_ready_at,
    updated_at: order.updated_at,
    order_number: order.order_number,
    total: order.total,
    fulfillment_type: order.fulfillment_type,
  })
}