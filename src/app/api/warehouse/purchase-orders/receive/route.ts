export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function verifyBiz(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string, bid: string) {
  const { data } = await supabase.from('businesses').select('id').eq('id', bid).eq('user_id', userId).single()
  return data?.id ?? null
}

interface ReceiveLine {
  item_id: string
  received_qty: number
  to_backroom?: boolean
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as { business_id: string; po_id: string; lines: ReceiveLine[] }
  const { business_id, po_id, lines } = body

  if (!business_id || !po_id || !lines?.length) {
    return NextResponse.json({ error: 'business_id, po_id, and lines required' }, { status: 400 })
  }

  if (!await verifyBiz(supabase, user.id, business_id)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Fetch the PO
  const { data: po } = await supabaseAdmin
    .from('warehouse_purchase_orders')
    .select('id, status, line_items, received_items, business_id')
    .eq('id', po_id)
    .eq('business_id', business_id)
    .single()

  if (!po) return NextResponse.json({ error: 'PO not found' }, { status: 404 })
  if (po.status === 'received' || po.status === 'cancelled') {
    return NextResponse.json({ error: 'PO already ' + po.status }, { status: 400 })
  }

  const lineItems: { item_id: string; item_name: string; suggested_qty: number; estimated_cost_aud?: number }[] = po.line_items ?? []
  const existingReceived: ReceiveLine[] = po.received_items ?? []

  // Merge received lines
  const receivedMap = new Map(existingReceived.map(r => [r.item_id, r.received_qty]))
  for (const line of lines) {
    receivedMap.set(line.item_id, (receivedMap.get(line.item_id) ?? 0) + line.received_qty)
  }
  const receivedItems = Array.from(receivedMap.entries()).map(([item_id, received_qty]) => ({ item_id, received_qty }))

  // Update stock for each received line
  for (const line of lines) {
    if (!line.item_id || line.received_qty <= 0) continue
    const isBackroom = line.to_backroom ?? false

    if (isBackroom) {
      // Pull current backroom qty and add to it
      const { data: prod } = await supabaseAdmin
        .from('pos_products')
        .select('qty_backroom')
        .eq('id', line.item_id)
        .eq('business_id', business_id)
        .single()
      const newBackroom = Number(prod?.qty_backroom ?? 0) + line.received_qty
      await supabaseAdmin
        .from('pos_products')
        .update({ qty_backroom: newBackroom, updated_at: new Date().toISOString() })
        .eq('id', line.item_id)
        .eq('business_id', business_id)
    } else {
      // Add to floor (stock_quantity)
      const { data: prod } = await supabaseAdmin
        .from('pos_products')
        .select('stock_quantity')
        .eq('id', line.item_id)
        .eq('business_id', business_id)
        .single()
      const newQty = Number(prod?.stock_quantity ?? 0) + line.received_qty
      await supabaseAdmin
        .from('pos_products')
        .update({ stock_quantity: newQty, updated_at: new Date().toISOString() })
        .eq('id', line.item_id)
        .eq('business_id', business_id)
    }
  }

  // Determine new status: all items received = 'received', else 'partial'
  const allReceived = lineItems.every(li => {
    const rcvd = receivedMap.get(li.item_id) ?? 0
    return rcvd >= li.suggested_qty
  })
  const newStatus = allReceived ? 'received' : 'partial'

  await supabaseAdmin
    .from('warehouse_purchase_orders')
    .update({
      status: newStatus,
      received_items: receivedItems,
      received_at: allReceived ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', po_id)
    .eq('business_id', business_id)

  return NextResponse.json({ ok: true, status: newStatus, received_items: receivedItems })
}

export const POST = withErrorCapture('warehouse/purchase-orders/receive', _POST)
