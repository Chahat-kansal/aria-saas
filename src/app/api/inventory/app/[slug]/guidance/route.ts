export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { resolveBusinessId } from '@/lib/aria/resolve-business'
import { getActingStaff } from '@/lib/inventory/staff-session'
import { resolveOutletId } from '@/lib/inventory/outlet-stock'
import { pulse, handover, weatherInsight } from '@/lib/inventory/guidance'

// INV-6 — Pulse (live per-outlet snapshot) + Handover (open vs done + flagged). Grounded read-only; per-outlet.

type Params = { params: Promise<{ slug: string }> }

async function _GET(req: Request, { params }: Params) {
  const { slug } = await params
  const bid = await resolveBusinessId(supabaseAdmin, slug)
  if (!bid) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const acting = await getActingStaff(bid)
  if (!acting) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const sp = new URL(req.url).searchParams
  const outletId = await resolveOutletId(supabaseAdmin, bid, sp.get('outlet_id'))

  if (sp.get('handover') === '1') {
    const data = await handover(supabaseAdmin, bid, outletId)
    return NextResponse.json({ acting: { id: acting.staff_id, name: acting.staff_name }, handover: data })
  }
  // default: pulse (+ the weather insight so the UI can show the grounded correlation / honest "insufficient")
  const [p, wx] = await Promise.all([pulse(supabaseAdmin, bid, outletId), weatherInsight(supabaseAdmin, bid).catch(() => null)])
  return NextResponse.json({ acting: { id: acting.staff_id, name: acting.staff_name }, pulse: p, weather: wx })
}

export const GET = withErrorCapture('inventory/app/guidance', _GET)
