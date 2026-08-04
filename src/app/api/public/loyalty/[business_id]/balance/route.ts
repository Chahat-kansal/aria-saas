export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { resolveBusinessId } from '@/lib/aria/resolve-business'
import { getCxSession } from '@/lib/cx/get-cx-session'
import { toE164AU } from '@/lib/phone'

type Params = { params: { business_id: string } }

// SECURITY-P1 (C-02) — this route had NO auth at all: any caller could enumerate any phone
// number against any business_id and get back that customer's full name, points, visit count,
// and lifetime spend. Now requires a valid cx_session (the same phone-OTP session every other CX
// personal route uses) AND that the session's own phone matches the phone being queried — a
// logged-in customer can look up their own balance, never someone else's by changing ?phone=.
async function _GET(req: Request, { params }: Params) {
  const { business_id } = params
  const phone = new URL(req.url).searchParams.get('phone')?.trim()
  if (!business_id || !phone) return NextResponse.json({ error: 'phone required' }, { status: 400 })

  const realId = await resolveBusinessId(supabaseAdmin, business_id)
  if (!realId) return NextResponse.json({ found: false })

  const session = await getCxSession(req, realId)
  if (!session || !session.phone || session.phone !== phone) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data } = await supabaseAdmin.from('pos_customers')
    .select('name, points_balance, loyalty_points, visit_count, total_spent, total_spend')
    // S-PHONE-E164 — raw match meant a customer enrolled as +61… who typed 0… saw "found: false"
    // and a zero balance, despite having points.
    .eq('business_id', realId).eq('phone', toE164AU(phone) ?? phone).maybeSingle()
  if (!data) return NextResponse.json({ found: false })

  return NextResponse.json({
    found: true,
    name: data.name,
    points: Number(data.points_balance ?? data.loyalty_points ?? 0),
    visits: Number(data.visit_count ?? 0),
    spent: Number(data.total_spent ?? data.total_spend ?? 0),
  })
}

export const GET = withErrorCapture('public/loyalty/[business_id]/balance', _GET)
