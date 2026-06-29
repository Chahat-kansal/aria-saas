export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { resolveBusinessId } from '@/lib/aria/resolve-business'
import { getActingStaff } from '@/lib/inventory/staff-session'
import { resolveOutletId } from '@/lib/inventory/outlet-stock'
import { staffCanAdjust } from '@/lib/inventory/adjust'
import { reorderSuggestions, createDraftPO, approveAndSendPO, supplierPriceList, type DraftLineIn } from '@/lib/inventory/buying'

// INV-5 — buying endpoint (staff-scoped). GET: reorder suggestions / suppliers / price list / PO detail / PO list.
// POST: draft (any staff) | approve (MONEY GATE — manager/owner/admin only, via staffCanAdjust). A PO never sends
// without owner approval; drafting changes nothing; stock only moves later at Receive (INV-2).

type Params = { params: Promise<{ slug: string }> }

async function _GET(req: Request, { params }: Params) {
  const { slug } = await params
  const bid = await resolveBusinessId(supabaseAdmin, slug)
  if (!bid) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const acting = await getActingStaff(bid)
  if (!acting) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const sp = new URL(req.url).searchParams
  const outletId = await resolveOutletId(supabaseAdmin, bid, sp.get('outlet_id'))

  // INV-ROLE-GATE-1 LEAK 4 — PO cost figures gated to manager+ (server gate)
  const perm = await staffCanAdjust(supabaseAdmin, bid, acting.staff_id)

  if (sp.get('reorder') === '1') {
    const data = await reorderSuggestions(supabaseAdmin, bid, outletId)
    if (!perm.allowed) {
      const rawData = data as unknown as { groups?: Array<{ items?: Array<Record<string, unknown>>; [key: string]: unknown }> }
      const groups = (rawData.groups ?? []).map(g => ({
        ...g,
        total: null,
        items: (g.items ?? []).map(it => ({ ...it, unit_cost: null, line_total: null })),
      }))
      return NextResponse.json({ acting: { id: acting.staff_id, name: acting.staff_name }, ...data, groups })
    }
    return NextResponse.json({ acting: { id: acting.staff_id, name: acting.staff_name }, ...data })
  }
  if (sp.get('suppliers') === '1') {
    const { data } = await supabaseAdmin.from('pos_suppliers').select('id, name, email, order_email, short_code').eq('business_id', bid).order('name')
    return NextResponse.json({ suppliers: data ?? [] })
  }
  const priceList = sp.get('pricelist')
  if (priceList) {
    const items = await supplierPriceList(supabaseAdmin, bid, priceList)
    return NextResponse.json({ supplier_id: priceList, items })
  }
  const poId = sp.get('po')
  if (poId) {
    const { data: po } = await supabaseAdmin.from('pos_purchase_orders').select('id, order_number, status, supplier_id, subtotal, total, created_by, created_at, expected_date, notes').eq('business_id', bid).eq('id', poId).maybeSingle()
    if (!po) return NextResponse.json({ error: 'PO not found' }, { status: 404 })
    const { data: lines } = await supabaseAdmin.from('pos_purchase_order_items').select('id, product_id, product_name, quantity_ordered, unit_cost, line_total, receive_status').eq('order_id', poId)
    const safePo = perm.allowed ? po : { ...po, subtotal: null, total: null }
    const safeLines = perm.allowed ? (lines ?? []) : (lines ?? []).map(l => ({ ...l, unit_cost: null, line_total: null }))
    return NextResponse.json({ po: safePo, lines: safeLines })
  }
  // default: draft + sent POs (the buying overview), newest first
  const { data: pos } = await supabaseAdmin.from('pos_purchase_orders')
    .select('id, order_number, status, supplier_id, total, created_by, created_at').eq('business_id', bid)
    .in('status', ['draft', 'sent']).order('created_at', { ascending: false }).limit(50)
  const { data: suppliers } = await supabaseAdmin.from('pos_suppliers').select('id, name').eq('business_id', bid)
  const supMap = new Map((suppliers ?? []).map(s => [s.id as string, s.name as string]))
  return NextResponse.json({ acting: { id: acting.staff_id, name: acting.staff_name }, pos: (pos ?? []).map(p => ({ ...p, total: perm.allowed ? p.total : null, supplier_name: supMap.get(p.supplier_id as string) ?? '—' })) })
}

async function _POST(req: Request, { params }: Params) {
  const { slug } = await params
  const bid = await resolveBusinessId(supabaseAdmin, slug)
  if (!bid) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const acting = await getActingStaff(bid)
  if (!acting) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { action?: string; supplier_id?: string; lines?: DraftLineIn[]; po_id?: string }

  if (body.action === 'draft') {
    if (!body.supplier_id || !Array.isArray(body.lines) || !body.lines.length) return NextResponse.json({ error: 'supplier_id and lines required' }, { status: 400 })
    const po = await createDraftPO(supabaseAdmin, bid, body.supplier_id, body.lines, acting.staff_name)
    return po ? NextResponse.json({ ok: true, po }) : NextResponse.json({ error: 'Could not create the draft' }, { status: 400 })
  }

  if (body.action === 'approve') {
    if (!body.po_id) return NextResponse.json({ error: 'po_id required' }, { status: 400 })
    // MONEY GATE — only a manager/owner/admin can approve & send a PO.
    const perm = await staffCanAdjust(supabaseAdmin, bid, acting.staff_id)
    if (!perm.allowed) return NextResponse.json({ ok: false, error: 'permission', role: perm.role, message: 'Approving a purchase order needs a manager. Ask a manager to sign in.' }, { status: 403 })
    const result = await approveAndSendPO(supabaseAdmin, bid, body.po_id, acting.staff_name)
    return NextResponse.json(result)
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

export const GET = withErrorCapture('inventory/app/buying:get', _GET)
export const POST = withErrorCapture('inventory/app/buying:post', _POST)
