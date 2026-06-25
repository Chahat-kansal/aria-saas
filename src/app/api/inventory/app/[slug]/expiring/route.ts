export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { resolveBusinessId } from '@/lib/aria/resolve-business'
import { getActingStaff } from '@/lib/inventory/staff-session'
import { logWaste } from '@/lib/inventory/waste'

// INV-SUPPLY-TILES — Expiring stock. Reads pos_product_batches (expiry_tracked, qty remaining) and buckets by
// days-to-expiry. Two attributed actions: WASTE (atomically zero the batch then run the canonical waste path —
// decrement items_on_hand + pos_waste_log + attributed adjustment) or MARKDOWN (file a pos_expiry_alerts flag;
// NO price/stock change — markdown pricing is an owner decision, this just surfaces it). No new stock primitive.

type Params = { params: Promise<{ slug: string }> }

function aestToday(): Date {
  const d = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(new Date())
  return new Date(`${d}T00:00:00+10:00`)
}
function daysLeft(expiry: string): number {
  const e = new Date(`${expiry}T00:00:00+10:00`).getTime()
  return Math.round((e - aestToday().getTime()) / 86400_000)
}
function bucketOf(d: number): 'expired' | 'urgent' | 'soon' | 'ok' {
  if (d < 0) return 'expired'
  if (d <= 3) return 'urgent'
  if (d <= 14) return 'soon'
  return 'ok'
}

async function _GET(req: Request, { params }: Params) {
  const { slug } = await params
  const bid = await resolveBusinessId(supabaseAdmin, slug)
  if (!bid) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const acting = await getActingStaff(bid)
  if (!acting) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const { data: batches } = await supabaseAdmin.from('pos_product_batches')
    .select('id, product_id, outlet_id, batch_ref, quantity_remaining, expiry_date, expiry_tracked')
    .eq('business_id', bid).eq('expiry_tracked', true).gt('quantity_remaining', 0)
    .order('expiry_date', { ascending: true }).limit(200)

  const pIds = [...new Set((batches ?? []).map(b => b.product_id as string).filter(Boolean))]
  const oIds = [...new Set((batches ?? []).map(b => b.outlet_id as string).filter(Boolean))]
  const [{ data: prods }, { data: outlets }] = await Promise.all([
    pIds.length ? supabaseAdmin.from('pos_products').select('id, name').in('id', pIds) : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
    oIds.length ? supabaseAdmin.from('pos_outlets').select('id, name').in('id', oIds) : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
  ])
  const pName = new Map((prods ?? []).map(p => [p.id as string, p.name as string]))
  const oName = new Map((outlets ?? []).map(o => [o.id as string, o.name as string]))

  const counts = { expired: 0, urgent: 0, soon: 0, ok: 0 }
  const rows = (batches ?? []).map(b => {
    const d = daysLeft(b.expiry_date as string)
    const bucket = bucketOf(d)
    counts[bucket]++
    return {
      id: b.id, product_id: b.product_id, product_name: pName.get(b.product_id as string) ?? 'Item',
      outlet_id: b.outlet_id, outlet_name: oName.get(b.outlet_id as string) ?? '—',
      batch_ref: b.batch_ref, quantity_remaining: Number(b.quantity_remaining) || 0,
      expiry_date: b.expiry_date, days_left: d, bucket,
    }
  })

  return NextResponse.json({ acting: { id: acting.staff_id, name: acting.staff_name }, counts, batches: rows })
}

async function _POST(req: Request, { params }: Params) {
  const { slug } = await params
  const bid = await resolveBusinessId(supabaseAdmin, slug)
  if (!bid) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const acting = await getActingStaff(bid)
  if (!acting) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { batch_id?: string; action?: 'waste' | 'markdown' }
  if (!body.batch_id || !['waste', 'markdown'].includes(body.action ?? '')) return NextResponse.json({ error: 'batch_id + valid action required' }, { status: 400 })

  const { data: batch } = await supabaseAdmin.from('pos_product_batches')
    .select('id, product_id, outlet_id, batch_ref, quantity_remaining, expiry_date').eq('id', body.batch_id).eq('business_id', bid).maybeSingle()
  if (!batch) return NextResponse.json({ error: 'Batch not found' }, { status: 404 })
  const prodId = batch.product_id as string
  const { data: prod } = await supabaseAdmin.from('pos_products').select('name').eq('id', prodId).maybeSingle()
  const productName = (prod?.name as string) ?? 'Item'

  // ── MARKDOWN: file an expiry alert only — no stock move, no price change ──
  if (body.action === 'markdown') {
    const d = daysLeft(batch.expiry_date as string)
    const { data: alert } = await supabaseAdmin.from('pos_expiry_alerts').insert({
      business_id: bid, batch_id: batch.id, product_id: prodId, alert_type: 'markdown',
      days_until_expiry: d, quantity_at_risk: Number(batch.quantity_remaining) || 0,
      message: `Markdown flagged by ${acting.staff_name}: ${productName} (${batch.batch_ref}), ${Number(batch.quantity_remaining) || 0} left, ${d < 0 ? 'expired' : `${d}d left`}.`,
      acknowledged: false,
    }).select('id').maybeSingle()
    return NextResponse.json({ ok: true, action: 'markdown', alert_id: alert?.id ?? null, stock_changed: false })
  }

  // ── WASTE: atomically claim the batch (zero remaining) then run the canonical waste path ──
  const claimQty = Number(batch.quantity_remaining) || 0
  const { data: claimed } = await supabaseAdmin.from('pos_product_batches')
    .update({ quantity_remaining: 0 }).eq('id', batch.id).eq('business_id', bid).gt('quantity_remaining', 0)
    .select('id').maybeSingle()
  if (!claimed) return NextResponse.json({ ok: true, action: 'waste', idempotent: true, stock_changed: false })

  const res = await logWaste(supabaseAdmin, {
    businessId: bid, outletIdIn: batch.outlet_id as string | null, productId: prodId, productName,
    quantity: claimQty, reason: 'expiry', staffId: acting.staff_id, staffName: acting.staff_name,
  })
  return NextResponse.json({ ok: true, action: 'waste', wasted: claimQty, new_on_hand: res.new_on_hand, waste_id: res.waste_id, stock_changed: true })
}

export const GET = withErrorCapture('inventory/app/expiring:get', _GET)
export const POST = withErrorCapture('inventory/app/expiring:post', _POST)
