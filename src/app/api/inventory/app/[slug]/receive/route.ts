export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { resolveBusinessId } from '@/lib/aria/resolve-business'
import { getActingStaff } from '@/lib/inventory/staff-session'
import { resolveOutletId, adjustOutletStock } from '@/lib/inventory/outlet-stock'
import { captureReceiptCost } from '@/lib/inventory/resolve-cost'

// INV-SUPPLY-TILES — Receive a delivery against a sent PO. Reuses adjustOutletStock (canonical items_on_hand),
// captureReceiptCost (real cost → item_cost/last_item_cost), and the attributed pos_stock_adjustments rail.
// Atomic PO claim (status 'sent' → 'received') prevents double-receive. All attributed via getActingStaff.

type Params = { params: Promise<{ slug: string }> }

async function _GET(req: Request, { params }: Params) {
  const { slug } = await params
  const bid = await resolveBusinessId(supabaseAdmin, slug)
  if (!bid) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const acting = await getActingStaff(bid)
  if (!acting) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const [{ data: sent }, { data: recent }] = await Promise.all([
    supabaseAdmin.from('pos_purchase_orders').select('id, order_number, status, total, expected_date, supplier_id').eq('business_id', bid).eq('status', 'sent').order('created_at', { ascending: false }).limit(50),
    supabaseAdmin.from('pos_purchase_orders').select('id, order_number, total, received_at, received_by').eq('business_id', bid).eq('status', 'received').order('received_at', { ascending: false }).limit(8),
  ])
  const poIds = (sent ?? []).map(p => p.id as string)
  const { data: items } = poIds.length
    ? await supabaseAdmin.from('pos_purchase_order_items').select('id, order_id, product_id, product_name, quantity_ordered, quantity_received, unit_cost, receive_status').in('order_id', poIds)
    : { data: [] }
  const byPo = new Map<string, Array<Record<string, unknown>>>()
  for (const it of items ?? []) { const k = it.order_id as string; if (!byPo.has(k)) byPo.set(k, []); byPo.get(k)!.push(it) }

  return NextResponse.json({
    acting: { id: acting.staff_id, name: acting.staff_name },
    receivable: (sent ?? []).map(p => ({ ...p, items: byPo.get(p.id as string) ?? [] })),
    recent: recent ?? [],
  })
}

async function _POST(req: Request, { params }: Params) {
  const { slug } = await params
  const bid = await resolveBusinessId(supabaseAdmin, slug)
  if (!bid) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const acting = await getActingStaff(bid)
  if (!acting) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { po_id?: string; outlet_id?: string; note?: string; lines?: Array<{ line_id: string; product_id: string; received_qty: number; expiry_date?: string }> }
  if (!body.po_id || !Array.isArray(body.lines) || body.lines.length === 0) return NextResponse.json({ error: 'po_id and lines required' }, { status: 400 })

  // Atomic claim — only the first receive of a 'sent' PO succeeds (no double-receive).
  const { data: claimed } = await supabaseAdmin.from('pos_purchase_orders')
    .update({ status: 'received', received_at: new Date().toISOString(), received_by: acting.staff_name, receive_notes: body.note ?? null })
    .eq('id', body.po_id).eq('business_id', bid).eq('status', 'sent')
    .select('id, order_number').maybeSingle()
  if (!claimed) return NextResponse.json({ error: 'This PO is not receivable (already received or not sent)' }, { status: 409 })

  const outletId = await resolveOutletId(supabaseAdmin, bid, body.outlet_id ?? null)
  const nowIso = new Date().toISOString()
  const results: Array<Record<string, unknown>> = []

  for (const line of body.lines) {
    const qty = Math.max(0, Math.round(Number(line.received_qty) || 0))
    if (!line.product_id || qty <= 0) continue
    // line cost (real)
    const { data: poLine } = await supabaseAdmin.from('pos_purchase_order_items').select('unit_cost, quantity_ordered').eq('id', line.line_id).maybeSingle()
    const unitCost = poLine?.unit_cost != null ? Number(poLine.unit_cost) : null
    const partial = poLine?.quantity_ordered != null && qty !== Number(poLine.quantity_ordered)

    // 1) per-line receive record (attributed)
    await supabaseAdmin.from('pos_purchase_order_items').update({
      quantity_received: qty, receive_status: partial ? 'partial' : 'received', quantity_partial: partial ? qty : null, received_at: nowIso, received_by: acting.staff_name,
    }).eq('id', line.line_id)

    // 2) canonical stock increment + attributed adjustment row. This runs BEFORE captureReceiptCost because
    //    adjustOutletStock ensures the outlet-inventory row exists — captureReceiptCost no-ops without it, so
    //    a first-ever receive of an uncosted product would otherwise never capture its cost.
    const newOnHand = outletId ? await adjustOutletStock(supabaseAdmin, { businessId: bid, outletId, productId: line.product_id, delta: qty }) : null
    if (outletId) {
      await supabaseAdmin.from('pos_stock_adjustments').insert({ business_id: bid, product_id: line.product_id, outlet_id: outletId, adjustment_qty: qty, reason: 'receive', adjusted_by: acting.staff_name })
    }

    // 3) capture the real cost (this is how an uncosted product first GETS a cost)
    await captureReceiptCost(supabaseAdmin, { businessId: bid, outletId, productId: line.product_id, unitCost })

    // 4) batch row so Expiring can see it (expiry only if entered)
    const { data: batch } = await supabaseAdmin.from('pos_product_batches').insert({
      business_id: bid, outlet_id: outletId, product_id: line.product_id, purchase_order_id: body.po_id,
      batch_ref: `${claimed.order_number}-${line.product_id.slice(0, 4)}`,
      quantity_received: qty, quantity_remaining: qty,
      expiry_date: line.expiry_date || null, expiry_tracked: !!line.expiry_date, source: 'receive',
    }).select('id').maybeSingle()

    results.push({ product_id: line.product_id, received: qty, new_on_hand: newOnHand, cost_captured: unitCost, batch_id: batch?.id ?? null })
  }

  return NextResponse.json({ ok: true, po: claimed.order_number, by: acting.staff_name, lines: results })
}

export const GET = withErrorCapture('inventory/app/receive:get', _GET)
export const POST = withErrorCapture('inventory/app/receive:post', _POST)
