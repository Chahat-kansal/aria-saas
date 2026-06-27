export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { resolveBusinessId } from '@/lib/aria/resolve-business'
import { getActingStaff } from '@/lib/inventory/staff-session'
import { resolveOutletId, adjustOutletStock } from '@/lib/inventory/outlet-stock'

// INV-STAFF-APP-3 — the owner review queue. Surfaces open inventory_review_queue rows (count_variance etc.)
// and resolves them. THE LOCKED PRINCIPLE: a count never moves stock; the ONLY path that moves items_on_hand
// from a count is the owner ACCEPTING here — an attributed pos_stock_adjustments row + adjustOutletStock.
// Investigate/dismiss never touch stock. All resolutions are attributed (resolved_by / adjusted_by) and
// idempotent (atomic status claim → a re-accept can't double-adjust).

type Params = { params: Promise<{ slug: string }> }

function aestStartIso(): string {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(new Date())
  return new Date(`${day}T00:00:00+10:00`).toISOString()
}

interface ReviewRow {
  id: string; flag_type: string; product_id: string | null
  expected_value: number | null; actual_value: number | null; variance: number | null
  evidence: Record<string, unknown> | null; raised_by_staff_id: string | null
  status: string; created_at: string
}

async function _GET(req: Request, { params }: Params) {
  const { slug } = await params
  const bid = await resolveBusinessId(supabaseAdmin, slug)
  if (!bid) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const acting = await getActingStaff(bid)
  if (!acting) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const outletId = await resolveOutletId(supabaseAdmin, bid, new URL(req.url).searchParams.get('outlet_id'))

  let q = supabaseAdmin.from('inventory_review_queue')
    .select('id, flag_type, product_id, expected_value, actual_value, variance, evidence, raised_by_staff_id, status, created_at')
    .eq('business_id', bid).in('status', ['open', 'investigating'])
    .order('created_at', { ascending: false }).limit(100)
  if (outletId) q = q.or(`outlet_id.eq.${outletId},outlet_id.is.null`)
  const { data: rowsRaw } = await q
  const rows = (rowsRaw ?? []) as ReviewRow[]

  // Enrich: product name/sku + staffer name (evidence carries the name; pos_staff is the fallback).
  const productIds = Array.from(new Set(rows.map(r => r.product_id).filter(Boolean) as string[]))
  const staffIds = Array.from(new Set(rows.map(r => r.raised_by_staff_id).filter(Boolean) as string[]))
  const [prodRes, staffRes] = await Promise.all([
    productIds.length ? supabaseAdmin.from('pos_products').select('id, name, sku').in('id', productIds) : Promise.resolve({ data: [] }),
    staffIds.length ? supabaseAdmin.from('pos_staff').select('id, name').in('id', staffIds) : Promise.resolve({ data: [] }),
  ])
  const prodMap = new Map((prodRes.data ?? []).map((p: { id: string; name: string; sku: string | null }) => [p.id, p]))
  const staffMap = new Map((staffRes.data ?? []).map((s: { id: string; name: string }) => [s.id, s.name]))

  const reviews = rows.map(r => {
    const ev = r.evidence ?? {}
    return {
      id: r.id,
      flag_type: r.flag_type,
      status: r.status,
      product_id: r.product_id,
      product_name: (r.product_id && prodMap.get(r.product_id)?.name) ?? (ev.product_name as string) ?? 'Item',
      product_sku: (r.product_id && prodMap.get(r.product_id)?.sku) ?? null,
      expected_value: r.expected_value != null ? Number(r.expected_value) : null,
      actual_value: r.actual_value != null ? Number(r.actual_value) : null,
      variance: r.variance != null ? Number(r.variance) : null,
      staff_name: (r.raised_by_staff_id && staffMap.get(r.raised_by_staff_id)) ?? (ev.staff_name as string) ?? 'Staff',
      created_at: r.created_at,
      evidence: ev,
    }
  })

  const startIso = aestStartIso()
  const [{ count: openCount }, { count: resolvedToday }] = await Promise.all([
    supabaseAdmin.from('inventory_review_queue').select('id', { count: 'exact', head: true }).eq('business_id', bid).eq('status', 'open'),
    supabaseAdmin.from('inventory_review_queue').select('id', { count: 'exact', head: true }).eq('business_id', bid).eq('status', 'resolved').gte('resolved_at', startIso),
  ])

  return NextResponse.json({
    acting: { id: acting.staff_id, name: acting.staff_name },
    reviews,
    counts: { open: openCount ?? 0, resolved_today: resolvedToday ?? 0 },
  })
}

// INV-DEPTH-COUNTING D — valid reason codes for variance acceptance.
const REASON_CODES = new Set(['receiving_error', 'mis_count', 'spoilage', 'theft_suspected', 'supplier_short', 'other'])

async function _POST(req: Request, { params }: Params) {
  const { slug } = await params
  const bid = await resolveBusinessId(supabaseAdmin, slug)
  if (!bid) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const acting = await getActingStaff(bid)
  if (!acting) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { review_id?: string; action?: string; reason_code?: string; notes?: string }
  if (!body.review_id || !['accept', 'investigate', 'dismiss'].includes(body.action ?? '')) {
    return NextResponse.json({ error: 'review_id and a valid action required' }, { status: 400 })
  }
  const nowIso = new Date().toISOString()

  // INVESTIGATE — flag only, never touches stock. open → investigating (idempotent).
  if (body.action === 'investigate') {
    const { data } = await supabaseAdmin.from('inventory_review_queue')
      .update({ status: 'investigating' })
      .eq('id', body.review_id).eq('business_id', bid).eq('status', 'open').select('id').maybeSingle()
    return NextResponse.json({ ok: true, action: 'investigate', idempotent: !data?.id, stock_changed: false })
  }

  // DISMISS — resolve without correcting stock. Attributed.
  if (body.action === 'dismiss') {
    const { data } = await supabaseAdmin.from('inventory_review_queue')
      .update({ status: 'resolved', resolution: 'dismissed', resolved_by: acting.staff_id, resolved_at: nowIso })
      .eq('id', body.review_id).eq('business_id', bid).in('status', ['open', 'investigating']).select('id').maybeSingle()
    return NextResponse.json({ ok: true, action: 'dismiss', idempotent: !data?.id, stock_changed: false })
  }

  // ACCEPT — the ONLY path that moves stock from a count. Atomic claim first (idempotent: a second accept of
  // an already-resolved row claims nothing → no double-adjust), then the attributed adjustment + stock move.

  // INV-DEPTH-COUNTING B: pre-read to check blind recount gate BEFORE claiming (non-destructive check).
  const { data: preRead } = await supabaseAdmin.from('inventory_review_queue')
    .select('id, status, evidence, product_id')
    .eq('id', body.review_id).eq('business_id', bid).in('status', ['open', 'investigating']).maybeSingle()
  if (!preRead?.id) {
    return NextResponse.json({ ok: true, action: 'accept', idempotent: true, stock_changed: false })
  }
  const preEv = (preRead.evidence as Record<string, unknown>) ?? {}
  if (preEv.recount_required && preEv.session_id) {
    const { data: lineItem } = await supabaseAdmin.from('pos_stock_take_items')
      .select('recount_count')
      .eq('stock_take_id', preEv.session_id as string).eq('product_id', preRead.product_id as string)
      .maybeSingle()
    if ((Number(lineItem?.recount_count) || 0) < 1) {
      return NextResponse.json({ ok: false, error: 'recount_required', message: 'A second count is required before approving this variance — ask staff to recount this item.' }, { status: 422 })
    }
  }

  const { data: claimed } = await supabaseAdmin.from('inventory_review_queue')
    .update({ status: 'resolved', resolution: 'accepted', resolved_by: acting.staff_id, resolved_at: nowIso })
    .eq('id', body.review_id).eq('business_id', bid).in('status', ['open', 'investigating'])
    .select('id, product_id, outlet_id, variance, evidence').maybeSingle()
  if (!claimed?.id) {
    return NextResponse.json({ ok: true, action: 'accept', idempotent: true, stock_changed: false })
  }

  const variance = Number(claimed.variance) || 0
  const productId = claimed.product_id as string | null
  let outletId = (claimed.outlet_id as string | null) ?? null
  if (!outletId) outletId = await resolveOutletId(supabaseAdmin, bid, null)

  // INV-DEPTH-COUNTING D: reason_code stored in pos_stock_adjustments + evidence (defaults to review_accepted).
  const reasonCode = (body.reason_code && REASON_CODES.has(body.reason_code)) ? body.reason_code : 'review_accepted'
  let newOnHand: number | null = null
  if (productId && outletId && variance !== 0) {
    await supabaseAdmin.from('pos_stock_adjustments').insert({
      business_id: bid, product_id: productId, outlet_id: outletId,
      adjustment_qty: variance, reason: reasonCode, adjusted_by: acting.staff_name,
    })
    newOnHand = await adjustOutletStock(supabaseAdmin, { businessId: bid, outletId, productId, delta: variance })
  }

  // Merge reason_code (+ optional notes) into evidence for the permanent audit trail.
  const existingEvidence = (claimed.evidence as Record<string, unknown>) ?? {}
  await supabaseAdmin.from('inventory_review_queue')
    .update({ evidence: { ...existingEvidence, reason_code: reasonCode, ...(body.notes?.trim() ? { reason_notes: body.notes.trim() } : {}) } })
    .eq('id', body.review_id)

  return NextResponse.json({ ok: true, action: 'accept', idempotent: false, stock_changed: variance !== 0, adjustment_qty: variance, new_on_hand: newOnHand, by: acting.staff_name, reason_code: reasonCode })
}

export const GET = withErrorCapture('inventory/app/review:get', _GET)
export const POST = withErrorCapture('inventory/app/review:post', _POST)
