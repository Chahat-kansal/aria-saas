export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { resolveBusinessId } from '@/lib/aria/resolve-business'
import { normalisePhone } from '@/lib/clicksend'

// GET /api/public/cx/[slug]/orders?phone=...
export async function GET(req: Request, { params }: { params: { slug: string } }) {
  const bid = await resolveBusinessId(supabaseAdmin, params.slug)
  if (!bid) return NextResponse.json({ orders: [] }, { status: 404 })

  const url = new URL(req.url)
  const raw = url.searchParams.get('phone') ?? ''
  if (!raw) return NextResponse.json({ orders: [] })

  let phone = raw
  try { phone = normalisePhone(raw) } catch { /* keep raw */ }

  // Look up customer by phone
  const { data: cust } = await supabaseAdmin
    .from('pos_customers')
    .select('id')
    .eq('business_id', bid)
    .eq('phone', phone)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle()

  if (!cust) return NextResponse.json({ orders: [] })

  const { data, error } = await supabaseAdmin
    .from('pos_online_orders')
    .select('id, order_number, status, total, items, created_at, fulfillment_type, pickup_time')
    .eq('business_id', bid)
    .eq('customer_id', cust.id)
    .order('created_at', { ascending: false })
    .limit(30)

  if (error) return NextResponse.json({ orders: [] })
  return NextResponse.json({ orders: data ?? [], customer_id: cust.id })
}