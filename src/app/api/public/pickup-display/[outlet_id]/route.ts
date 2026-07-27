export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

type Params = { params: Promise<{ outlet_id: string }> | { outlet_id: string } }

// SECURITY-P5 Tier 4 — pickup-display/[outlet_id]/page.tsx used to query pos_online_orders
// directly from the browser via the anon key, relying on a `tracker_public_read` RLS policy whose
// USING clause was unconditionally `true` — any anon caller could select ANY columns (including
// customer_email/customer_phone/delivery_address/payment_intent_id) for ANY business's orders with
// no filter at all, not just the 5 narrow non-PII columns this kiosk screen actually renders.
// Moving the read behind a server route (matching the pattern order-track/[orderNumber]/route.ts
// and menu/[slug]/order/[orderNumber]/page.tsx already use) lets the anon RLS policy be removed
// entirely while keeping this screen's exact same behavior.
export async function GET(req: Request, { params }: Params) {
  const { outlet_id } = 'then' in params ? await params : params
  if (!outlet_id) return NextResponse.json({ error: 'outlet_id required' }, { status: 400 })

  const { data: outlet } = await supabaseAdmin.from('pos_outlets').select('business_id').eq('id', outlet_id).maybeSingle()
  let bizName = 'Cafe'
  if (outlet?.business_id) {
    const { data: biz } = await supabaseAdmin.from('businesses').select('name').eq('id', outlet.business_id as string).maybeSingle()
    if (biz?.name) bizName = biz.name as string
  }

  const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString() // hide collected >5min ago
  const { data: orders } = await supabaseAdmin
    .from('pos_online_orders')
    .select('id, order_number, customer_name, status, updated_at')
    .eq('outlet_id', outlet_id)
    .in('status', ['confirmed', 'preparing', 'ready', 'collected'])
    .or(`status.neq.collected,updated_at.gte.${cutoff}`)
    .order('updated_at', { ascending: true })
    .limit(30)

  return NextResponse.json({ bizName, orders: orders ?? [] })
}
