export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { resolveBusinessId } from '@/lib/aria/resolve-business'
import { getActingStaff } from '@/lib/inventory/staff-session'
import { resolveOutletId } from '@/lib/inventory/outlet-stock'
import { resolveTicketPrice } from '@/lib/tickets/ticket-price'

// TICKETS-REBUILD+BATCH-1 — staff save a scanned set of products as a print batch. Price + any REAL active
// promo are SNAPSHOTTED now, so a later price change can't alter a queued batch. Attributed to acting staff.

type Params = { params: Promise<{ slug: string }> }

async function _POST(req: Request, { params }: Params) {
  const { slug } = await params
  const bid = await resolveBusinessId(supabaseAdmin, slug)
  if (!bid) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const acting = await getActingStaff(bid)
  if (!acting) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { name?: string; outlet_id?: string; items?: Array<{ product_id: string; qty?: number }> }
  const name = (body.name ?? '').trim()
  const items = (body.items ?? []).filter(i => i.product_id)
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })
  if (items.length === 0) return NextResponse.json({ error: 'add at least one item' }, { status: 400 })

  const outletId = await resolveOutletId(supabaseAdmin, bid, body.outlet_id ?? null)

  // Load the products (scoped to this business) to snapshot real prices.
  const ids = Array.from(new Set(items.map(i => i.product_id)))
  const { data: prods } = await supabaseAdmin.from('pos_products').select('id, name, price').in('id', ids).eq('business_id', bid)
  const prodMap = new Map((prods ?? []).map(p => [p.id as string, p]))

  const { data: batch, error: bErr } = await supabaseAdmin.from('ticket_print_batches').insert({
    business_id: bid, outlet_id: outletId, name, status: 'queued',
    created_by_staff_id: acting.staff_id, item_count: items.length,
  }).select('id').single()
  if (bErr || !batch) return NextResponse.json({ error: bErr?.message ?? 'Could not create batch' }, { status: 500 })

  const rows = []
  for (const it of items) {
    const p = prodMap.get(it.product_id)
    if (!p) continue
    const snap = await resolveTicketPrice(supabaseAdmin, bid, { id: p.id as string, price: p.price as number | null })
    rows.push({
      batch_id: batch.id, business_id: bid, product_id: it.product_id,
      qty: Math.max(1, Math.round(Number(it.qty) || 1)),
      price_snapshot: snap.price_snapshot, was_price_snapshot: snap.was_price_snapshot, promo_label: snap.promo_label,
    })
  }
  if (rows.length) await supabaseAdmin.from('ticket_print_batch_items').insert(rows)
  // Keep item_count honest if some ids didn't resolve.
  if (rows.length !== items.length) await supabaseAdmin.from('ticket_print_batches').update({ item_count: rows.length }).eq('id', batch.id)

  return NextResponse.json({ ok: true, batch_id: batch.id, item_count: rows.length, by: acting.staff_name })
}

export const POST = withErrorCapture('inventory/app/ticket-batch', _POST)
