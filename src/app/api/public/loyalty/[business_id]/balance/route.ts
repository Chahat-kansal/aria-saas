export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { resolveBusinessId } from '@/lib/aria/resolve-business'

type Params = { params: { business_id: string } }

// Public points-balance check — a customer looks up their own points by phone.
async function _GET(req: Request, { params }: Params) {
  const { business_id } = params
  const phone = new URL(req.url).searchParams.get('phone')?.trim()
  if (!business_id || !phone) return NextResponse.json({ error: 'phone required' }, { status: 400 })

  const realId = await resolveBusinessId(supabaseAdmin, business_id)
  if (!realId) return NextResponse.json({ found: false })

  const { data } = await supabaseAdmin.from('pos_customers')
    .select('name, points_balance, loyalty_points, visit_count, total_spent, total_spend')
    .eq('business_id', realId).eq('phone', phone).maybeSingle()
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
