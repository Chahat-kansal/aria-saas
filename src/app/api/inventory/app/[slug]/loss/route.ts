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
import { recallProduct, resolveHold, quarantineView, shrinkageReport, ageGateCheck, logAgeCheck } from '@/lib/inventory/loss'

// INV-8 — loss & compliance endpoint (staff-scoped). GET: quarantine / shrinkage / age-check. POST: recall (any
// staff — pulling unsafe stock is always allowed) | resolve (MONEY/STOCK GATE — manager, since dispose/return
// removes stock) | age_check (attributed 18+ confirmation). Recall never deletes stock; resolution uses canonical.

type Params = { params: Promise<{ slug: string }> }

async function _GET(req: Request, { params }: Params) {
  const { slug } = await params
  const bid = await resolveBusinessId(supabaseAdmin, slug)
  if (!bid) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const acting = await getActingStaff(bid)
  if (!acting) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const sp = new URL(req.url).searchParams
  const outletId = await resolveOutletId(supabaseAdmin, bid, sp.get('outlet_id'))

  const ageFor = sp.get('age')
  if (ageFor) return NextResponse.json(await ageGateCheck(supabaseAdmin, bid, ageFor))
  if (sp.get('shrinkage') === '1') return NextResponse.json(await shrinkageReport(supabaseAdmin, bid, outletId, Math.min(180, Math.max(7, Number(sp.get('days')) || 30))))
  if (sp.get('quarantine') === '1') return NextResponse.json(await quarantineView(supabaseAdmin, bid, outletId))

  const [quarantine, shrinkage] = await Promise.all([quarantineView(supabaseAdmin, bid, outletId), shrinkageReport(supabaseAdmin, bid, outletId, 30)])
  return NextResponse.json({ acting: { id: acting.staff_id, name: acting.staff_name }, quarantine, shrinkage })
}

async function _POST(req: Request, { params }: Params) {
  const { slug } = await params
  const bid = await resolveBusinessId(supabaseAdmin, slug)
  if (!bid) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const acting = await getActingStaff(bid)
  if (!acting) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { action?: string; product_id?: string; quantity?: number; reason?: string; hold_id?: string; resolution?: string; confirmed?: boolean; outlet_id?: string | null }
  const outletId = await resolveOutletId(supabaseAdmin, bid, body.outlet_id ?? null)

  if (body.action === 'recall') {
    if (!body.product_id) return NextResponse.json({ error: 'product_id required' }, { status: 400 })
    const res = await recallProduct(supabaseAdmin, bid, body.product_id, Number(body.quantity) || 0, body.reason ?? 'recall', acting.staff_name)
    return res.ok ? NextResponse.json({ ok: true, id: res.id }) : NextResponse.json({ error: 'Could not place the hold' }, { status: 400 })
  }
  if (body.action === 'resolve') {
    const resn = body.resolution
    if (!body.hold_id || !['released', 'disposed', 'returned_to_supplier'].includes(resn ?? '')) return NextResponse.json({ error: 'hold_id and a valid resolution required' }, { status: 400 })
    const perm = await staffCanAdjust(supabaseAdmin, bid, acting.staff_id)
    if (!perm.allowed) return NextResponse.json({ ok: false, error: 'permission', role: perm.role, message: 'Resolving a hold needs a manager.' }, { status: 403 })
    const res = await resolveHold(supabaseAdmin, bid, body.hold_id, resn as 'released' | 'disposed' | 'returned_to_supplier', outletId, acting.staff_name)
    return NextResponse.json(res)
  }
  if (body.action === 'age_check') {
    if (!body.product_id) return NextResponse.json({ error: 'product_id required' }, { status: 400 })
    const gate = await ageGateCheck(supabaseAdmin, bid, body.product_id)
    const res = await logAgeCheck(supabaseAdmin, bid, outletId, body.product_id, gate.name, acting.staff_id, acting.staff_name, body.confirmed !== false)
    return NextResponse.json({ ...res, restricted: gate.restricted })
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

export const GET = withErrorCapture('inventory/app/loss:get', _GET)
export const POST = withErrorCapture('inventory/app/loss:post', _POST)
