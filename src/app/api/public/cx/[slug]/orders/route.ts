export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { resolveBusinessId } from '@/lib/aria/resolve-business'
import { getCxSession } from '@/lib/cx/get-cx-session'

// GET /api/public/cx/[slug]/orders — session-gated order history.
// ?phone= is accepted as a dead param for backward compat but IGNORED for identity.
export async function GET(req: Request, { params }: { params: { slug: string } }) {
  const bid = await resolveBusinessId(supabaseAdmin, params.slug)
  if (!bid) return NextResponse.json({ orders: [] }, { status: 404 })

  const session = await getCxSession(req, bid)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: cust } = await supabaseAdmin
    .from('pos_customers')
    .select('id')
    .eq('business_id', bid)
    .eq('loyalty_identity_id', session.identity_id)
    .is('deleted_at', null)
    .maybeSingle()

  if (!cust) return NextResponse.json({ orders: [], customer_id: null })

  const customerId = (cust as { id: string }).id

  const { data, error } = await supabaseAdmin
    .from('pos_online_orders')
    .select('id, order_number, status, total, items, created_at, fulfillment_type, pickup_time')
    .eq('business_id', bid)
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
    .limit(30)

  if (error) return NextResponse.json({ orders: [] })
  return NextResponse.json({ orders: data ?? [], customer_id: customerId })
}