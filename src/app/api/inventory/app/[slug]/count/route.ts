export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { resolveBusinessId } from '@/lib/aria/resolve-business'
import { getActingStaff } from '@/lib/inventory/staff-session'
import { submitCount } from '@/lib/inventory/count'

// INV-STAFF-APP-2 — submit a count. Attributed to the acting staff. The variance (if any) goes to the owner
// review queue; items_on_hand is NEVER mutated here.

type Params = { params: Promise<{ slug: string }> }

async function _POST(req: Request, { params }: Params) {
  const { slug } = await params
  const bid = await resolveBusinessId(supabaseAdmin, slug)
  if (!bid) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const acting = await getActingStaff(bid)
  if (!acting) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { product_id?: string; counted?: number; task_id?: string; outlet_id?: string; product_name?: string }
  if (!body.product_id || body.counted == null) return NextResponse.json({ error: 'product_id and counted required' }, { status: 400 })

  const result = await submitCount(supabaseAdmin, {
    businessId: bid, outletIdIn: body.outlet_id ?? null, productId: body.product_id, productName: body.product_name ?? null,
    counted: body.counted, taskId: body.task_id ?? null, staffId: acting.staff_id, staffName: acting.staff_name,
  })
  return NextResponse.json({ ok: true, ...result })
}

export const POST = withErrorCapture('inventory/app/count', _POST)
