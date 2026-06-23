export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { resolveBusinessId } from '@/lib/aria/resolve-business'
import { getActingStaff } from '@/lib/inventory/staff-session'
import { resolveOutletId } from '@/lib/inventory/outlet-stock'
import { logWaste, wasteTodaySummary, WASTE_REASONS } from '@/lib/inventory/waste'

// INV-WASTE-1 — staff waste flow. GET = today's waste list + $ total. POST = log waste (decrements
// items_on_hand, attributed; abnormal loss also files a waste_spike review). All attributed to acting staff.

type Params = { params: Promise<{ slug: string }> }

async function _GET(req: Request, { params }: Params) {
  const { slug } = await params
  const bid = await resolveBusinessId(supabaseAdmin, slug)
  if (!bid) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const acting = await getActingStaff(bid)
  if (!acting) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const outletId = await resolveOutletId(supabaseAdmin, bid, new URL(req.url).searchParams.get('outlet_id'))
  const today = await wasteTodaySummary(supabaseAdmin, bid, outletId)
  return NextResponse.json({ acting: { id: acting.staff_id, name: acting.staff_name }, reasons: WASTE_REASONS, ...today })
}

async function _POST(req: Request, { params }: Params) {
  const { slug } = await params
  const bid = await resolveBusinessId(supabaseAdmin, slug)
  if (!bid) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const acting = await getActingStaff(bid)
  if (!acting) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { product_id?: string; product_name?: string; quantity?: number; reason?: string; unit?: string; outlet_id?: string }
  if (!body.product_id || !body.quantity || Number(body.quantity) <= 0) {
    return NextResponse.json({ error: 'product_id and a positive quantity required' }, { status: 400 })
  }

  const result = await logWaste(supabaseAdmin, {
    businessId: bid, outletIdIn: body.outlet_id ?? null, productId: body.product_id, productName: body.product_name ?? null,
    quantity: body.quantity, unit: body.unit ?? null, reason: body.reason ?? null, staffId: acting.staff_id, staffName: acting.staff_name,
  })
  return NextResponse.json({ ok: true, ...result })
}

export const GET = withErrorCapture('inventory/app/waste:get', _GET)
export const POST = withErrorCapture('inventory/app/waste:post', _POST)
