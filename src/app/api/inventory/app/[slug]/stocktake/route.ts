export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { resolveBusinessId } from '@/lib/aria/resolve-business'
import { getActingStaff } from '@/lib/inventory/staff-session'
import { resolveOutletId } from '@/lib/inventory/outlet-stock'
import { openStocktake, getStocktake, countStocktakeLine, submitStocktake, generateCycleCountList, countPattern, type CountType } from '@/lib/inventory/stocktake'

// INV-4 — counting engine endpoint (staff-scoped). GET: cycle list / session detail / open sessions / pattern.
// POST: open|count|submit. A count NEVER moves stock — submit files variances to the owner review queue; the
// owner accepts there. Per-outlet throughout.

type Params = { params: Promise<{ slug: string }> }
const TYPES = new Set<CountType>(['full', 'cycle', 'perpetual'])

async function _GET(req: Request, { params }: Params) {
  const { slug } = await params
  const bid = await resolveBusinessId(supabaseAdmin, slug)
  if (!bid) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const acting = await getActingStaff(bid)
  if (!acting) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const sp = new URL(req.url).searchParams
  const outletId = await resolveOutletId(supabaseAdmin, bid, sp.get('outlet_id'))

  if (sp.get('cycle') === '1') {
    const limit = Math.min(50, Math.max(1, Number(sp.get('limit')) || 10))
    const cycle = await generateCycleCountList(supabaseAdmin, bid, outletId, limit)
    return NextResponse.json({ acting: { id: acting.staff_id, name: acting.staff_name }, outlet_id: outletId, cycle })
  }
  const patternFor = sp.get('pattern')
  if (patternFor) {
    const pattern = await countPattern(supabaseAdmin, bid, patternFor, outletId)
    return NextResponse.json({ pattern })
  }
  const sessionId = sp.get('session_id')
  if (sessionId) {
    const detail = await getStocktake(supabaseAdmin, bid, sessionId)
    return detail ? NextResponse.json(detail) : NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }
  // open sessions (resume list)
  let q = supabaseAdmin.from('pos_stock_takes')
    .select('id, outlet_id, count_type, status, started_by, started_at, items_counted, items_with_variance, total_variance_cents')
    .eq('business_id', bid).eq('status', 'in_progress').order('started_at', { ascending: false }).limit(50)
  if (outletId) q = q.eq('outlet_id', outletId)
  const { data: sessions } = await q
  return NextResponse.json({ acting: { id: acting.staff_id, name: acting.staff_name }, outlet_id: outletId, sessions: sessions ?? [] })
}

async function _POST(req: Request, { params }: Params) {
  const { slug } = await params
  const bid = await resolveBusinessId(supabaseAdmin, slug)
  if (!bid) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const acting = await getActingStaff(bid)
  if (!acting) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { action?: string; type?: string; outlet_id?: string | null; session_id?: string; product_id?: string; counted?: number }

  if (body.action === 'open') {
    const type = (TYPES.has(body.type as CountType) ? body.type : 'full') as CountType
    const session = await openStocktake(supabaseAdmin, bid, body.outlet_id ?? null, type, acting.staff_id)
    return session ? NextResponse.json({ ok: true, session }) : NextResponse.json({ error: 'Could not open a session (no outlet?)' }, { status: 400 })
  }
  if (body.action === 'count') {
    if (!body.session_id || !body.product_id) return NextResponse.json({ error: 'session_id and product_id required' }, { status: 400 })
    const line = await countStocktakeLine(supabaseAdmin, bid, body.session_id, body.product_id, Number(body.counted) || 0, acting.staff_id)
    return line ? NextResponse.json({ ok: true, line }) : NextResponse.json({ error: 'Session not open or product not found' }, { status: 400 })
  }
  if (body.action === 'submit') {
    if (!body.session_id) return NextResponse.json({ error: 'session_id required' }, { status: 400 })
    // INV-BASELINE-1 PHASE 2 — 'staff' stated explicitly rather than leaning on the default. Staff
    // counts ALWAYS route to owner review, however small; this is the staff-PIN app.
    const result = await submitStocktake(supabaseAdmin, bid, body.session_id, acting.staff_id, acting.staff_name, 'staff')
    return result ? NextResponse.json({ ok: true, result }) : NextResponse.json({ ok: true, idempotent: true, message: 'Session already submitted' })
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

export const GET = withErrorCapture('inventory/app/stocktake:get', _GET)
export const POST = withErrorCapture('inventory/app/stocktake:post', _POST)
