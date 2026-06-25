export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { resolveBusinessId } from '@/lib/aria/resolve-business'
import { getActingStaff } from '@/lib/inventory/staff-session'
import { adjustOutletStock } from '@/lib/inventory/outlet-stock'

// INV-SUPPLY-TILES — stock transfer between outlets. Multi-outlet only (capability-gated client-side; the GET
// also reports outlet_count). Each lifecycle transition is an ATOMIC status claim (UPDATE … WHERE status=prev,
// the RACES-5 pattern) so a repeated tap can't double-move stock. Send decrements the FROM outlet's canonical
// items_on_hand; receive increments the TO outlet's — both via adjustOutletStock. No new primitive.
//
// Attribution: the transfer's actor columns (approved_by/shipped_by/received_by) are uuid FKs to auth.users,
// but the staff PWA authenticates via pos_staff (PIN) — there is no auth.users id to write — so we stamp only
// the timestamp columns here and carry WHO on the attributed pos_stock_adjustments.adjusted_by (text name).

type Params = { params: Promise<{ slug: string }> }

async function _GET(req: Request, { params }: Params) {
  const { slug } = await params
  const bid = await resolveBusinessId(supabaseAdmin, slug)
  if (!bid) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const acting = await getActingStaff(bid)
  if (!acting) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const { data: outlets } = await supabaseAdmin.from('pos_outlets').select('id, name').eq('business_id', bid).eq('is_active', true)
  const outletName = new Map((outlets ?? []).map(o => [o.id as string, o.name as string]))
  const { data: transfers } = await supabaseAdmin.from('pos_inventory_transfers')
    .select('id, status, from_outlet_id, to_outlet_id, total_cost, approved_at, shipped_at, received_at')
    .eq('business_id', bid).not('status', 'in', '(reconciled,cancelled)').order('created_at', { ascending: false }).limit(50)
  const tIds = (transfers ?? []).map(t => t.id as string)
  const { data: items } = tIds.length
    ? await supabaseAdmin.from('pos_inventory_transfer_items').select('id, transfer_id, product_id, product_name, quantity_approved, quantity_sent, quantity_received, variance_units').in('transfer_id', tIds)
    : { data: [] }
  const byT = new Map<string, Array<Record<string, unknown>>>()
  for (const it of items ?? []) { const k = it.transfer_id as string; if (!byT.has(k)) byT.set(k, []); byT.get(k)!.push(it) }

  return NextResponse.json({
    acting: { id: acting.staff_id, name: acting.staff_name },
    outlet_count: (outlets ?? []).length,
    transfers: (transfers ?? []).map(t => ({ ...t, from_name: outletName.get(t.from_outlet_id as string) ?? '—', to_name: outletName.get(t.to_outlet_id as string) ?? '—', items: byT.get(t.id as string) ?? [] })),
  })
}

async function _POST(req: Request, { params }: Params) {
  const { slug } = await params
  const bid = await resolveBusinessId(supabaseAdmin, slug)
  if (!bid) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const acting = await getActingStaff(bid)
  if (!acting) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { transfer_id?: string; action?: 'approve' | 'send' | 'receive' }
  if (!body.transfer_id || !['approve', 'send', 'receive'].includes(body.action ?? '')) return NextResponse.json({ error: 'transfer_id + valid action required' }, { status: 400 })
  const nowIso = new Date().toISOString()
  const id = body.transfer_id

  // ── APPROVE (draft/requested → approved): no stock move ──
  if (body.action === 'approve') {
    const { data } = await supabaseAdmin.from('pos_inventory_transfers')
      .update({ status: 'approved', approved_at: nowIso })
      .eq('id', id).eq('business_id', bid).in('status', ['draft', 'requested']).select('id').maybeSingle()
    return NextResponse.json({ ok: !!data, action: 'approve', idempotent: !data, stock_changed: false })
  }

  // ── SEND (approved → in_transit): decrement FROM outlet ──
  if (body.action === 'send') {
    const { data: claimed } = await supabaseAdmin.from('pos_inventory_transfers')
      .update({ status: 'in_transit', shipped_at: nowIso })
      .eq('id', id).eq('business_id', bid).eq('status', 'approved').select('id, from_outlet_id').maybeSingle()
    if (!claimed) return NextResponse.json({ ok: true, action: 'send', idempotent: true, stock_changed: false })
    const { data: lines } = await supabaseAdmin.from('pos_inventory_transfer_items').select('id, product_id, quantity_approved').eq('transfer_id', id)
    for (const l of lines ?? []) {
      const qty = Math.round(Number(l.quantity_approved) || 0)
      if (!l.product_id || qty <= 0) continue
      await supabaseAdmin.from('pos_inventory_transfer_items').update({ quantity_sent: qty }).eq('id', l.id)
      await adjustOutletStock(supabaseAdmin, { businessId: bid, outletId: claimed.from_outlet_id as string, productId: l.product_id as string, delta: -qty })
      await supabaseAdmin.from('pos_stock_adjustments').insert({ business_id: bid, product_id: l.product_id, outlet_id: claimed.from_outlet_id, adjustment_qty: -qty, reason: 'transfer_out', adjusted_by: acting.staff_name })
    }
    return NextResponse.json({ ok: true, action: 'send', idempotent: false, stock_changed: true })
  }

  // ── RECEIVE (in_transit → received): increment TO outlet ──
  const { data: claimed } = await supabaseAdmin.from('pos_inventory_transfers')
    .update({ status: 'received', received_at: nowIso })
    .eq('id', id).eq('business_id', bid).eq('status', 'in_transit').select('id, to_outlet_id').maybeSingle()
  if (!claimed) return NextResponse.json({ ok: true, action: 'receive', idempotent: true, stock_changed: false })
  const { data: lines } = await supabaseAdmin.from('pos_inventory_transfer_items').select('id, product_id, quantity_sent').eq('transfer_id', id)
  for (const l of lines ?? []) {
    const qty = Math.round(Number(l.quantity_sent) || 0)
    if (!l.product_id || qty <= 0) continue
    await supabaseAdmin.from('pos_inventory_transfer_items').update({ quantity_received: qty, variance_units: 0 }).eq('id', l.id)
    await adjustOutletStock(supabaseAdmin, { businessId: bid, outletId: claimed.to_outlet_id as string, productId: l.product_id as string, delta: qty })
    await supabaseAdmin.from('pos_stock_adjustments').insert({ business_id: bid, product_id: l.product_id, outlet_id: claimed.to_outlet_id, adjustment_qty: qty, reason: 'transfer_in', adjusted_by: acting.staff_name })
  }
  return NextResponse.json({ ok: true, action: 'receive', idempotent: false, stock_changed: true })
}

export const GET = withErrorCapture('inventory/app/transfer:get', _GET)
export const POST = withErrorCapture('inventory/app/transfer:post', _POST)
