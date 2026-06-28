export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { resolveBusinessId } from '@/lib/aria/resolve-business'
import { getActingStaff } from '@/lib/inventory/staff-session'
import { resolveOutletId } from '@/lib/inventory/outlet-stock'
import { applyAdjustment, staffCanAdjust, recentAdjustmentsToday, ADJUST_REASONS } from '@/lib/inventory/adjust'

// INV-ADJUST-1 — manual stock correction. GET = permission + today's adjustments (transparent/auditable).
// POST = apply (permission-gated, reason-mandatory; moves items_on_hand once via the shared rail).

type Params = { params: Promise<{ slug: string }> }

async function _GET(req: Request, { params }: Params) {
  const { slug } = await params
  const bid = await resolveBusinessId(supabaseAdmin, slug)
  if (!bid) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const acting = await getActingStaff(bid)
  if (!acting) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const outletId = await resolveOutletId(supabaseAdmin, bid, new URL(req.url).searchParams.get('outlet_id'))
  const [perm, recent] = await Promise.all([
    staffCanAdjust(supabaseAdmin, bid, acting.staff_id),
    recentAdjustmentsToday(supabaseAdmin, bid, outletId),
  ])
  return NextResponse.json({
    acting: { id: acting.staff_id, name: acting.staff_name },
    role: perm.role, can_adjust: perm.allowed, reasons: ADJUST_REASONS, recent,
  })
}

async function _POST(req: Request, { params }: Params) {
  const { slug } = await params
  const bid = await resolveBusinessId(supabaseAdmin, slug)
  if (!bid) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const acting = await getActingStaff(bid)
  if (!acting) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { product_id?: string; product_name?: string; mode?: string; value?: number; reason?: string; outlet_id?: string; idempotency_key?: string; staff_id?: string; staff_name?: string }
  if (!body.product_id || !['set', 'add', 'remove'].includes(body.mode ?? '') || body.value == null) {
    return NextResponse.json({ error: 'product_id, mode (set|add|remove) and value required' }, { status: 400 })
  }

  // Offline-queue replay: if body.staff_id differs from the current cookie (staff switched between enqueue
  // and reconnect), use the original staff identity — validated against this business to prevent spoofing.
  let useStaffId = acting.staff_id, useStaffName = acting.staff_name
  if (body.staff_id && body.staff_id !== acting.staff_id) {
    const { data: orig } = await supabaseAdmin.from('pos_staff')
      .select('id, name').eq('id', body.staff_id).eq('business_id', bid).eq('is_active', true).maybeSingle()
    if (orig) { useStaffId = orig.id as string; useStaffName = (orig.name as string) ?? acting.staff_name }
  }

  const outcome = await applyAdjustment(supabaseAdmin, {
    businessId: bid, outletIdIn: body.outlet_id ?? null, productId: body.product_id, productName: body.product_name ?? null,
    mode: body.mode as 'set' | 'add' | 'remove', value: Number(body.value), reason: body.reason ?? null,
    staffId: useStaffId, staffName: useStaffName, idempotency_key: body.idempotency_key ?? null,
  })

  if (!outcome.ok) {
    if (outcome.error === 'permission') return NextResponse.json({ ok: false, error: 'permission', role: outcome.role, message: 'Stock adjustments need a manager. Ask a manager to sign in and apply this correction.' }, { status: 403 })
    if (outcome.error === 'no_reason') return NextResponse.json({ ok: false, error: 'reason_required', message: 'Pick a reason — a correction without a reason is how stock silently drifts.' }, { status: 400 })
    return NextResponse.json({ ok: false, error: 'no_change', message: 'That leaves stock unchanged.' }, { status: 400 })
  }
  return NextResponse.json(outcome)
}

export const GET = withErrorCapture('inventory/app/adjust:get', _GET)
export const POST = withErrorCapture('inventory/app/adjust:post', _POST)
