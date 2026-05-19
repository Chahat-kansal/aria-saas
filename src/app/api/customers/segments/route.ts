export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const business_id = searchParams.get('business_id')
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).single()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const now = Date.now()
  const d30  = new Date(now - 30  * 86400000).toISOString()
  const d60  = new Date(now - 60  * 86400000).toISOString()
  const d61  = new Date(now - 61  * 86400000).toISOString()
  const d120 = new Date(now - 120 * 86400000).toISOString()

  const base = supabaseAdmin.from('pos_customers').select('id, total_spent, total_spend, visit_count, last_visit', { count: 'exact', head: false }).eq('business_id', business_id)

  const [total, newSeg, regular, atRisk, lost, neverRet] = await Promise.all([
    supabaseAdmin.from('pos_customers').select('id', { count: 'exact', head: true }).eq('business_id', business_id),
    base.gte('last_visit', d30).eq('visit_count', 1),
    base.gte('last_visit', d60).gte('visit_count', 3),
    base.gte('last_visit', d120).lt('last_visit', d61).gte('visit_count', 2),
    base.lt('last_visit', d120).gte('visit_count', 2),
    base.eq('visit_count', 1).lt('last_visit', d30),
  ])

  // VIP: total_spent >= 500 OR visit_count >= 10
  const { data: allCusts } = await supabaseAdmin
    .from('pos_customers')
    .select('total_spent, total_spend, visit_count')
    .eq('business_id', business_id)

  const vipCount = (allCusts ?? []).filter(c => {
    const spend = Number(c.total_spent ?? c.total_spend ?? 0)
    return spend >= 500 || (c.visit_count ?? 0) >= 10
  }).length

  return NextResponse.json({
    total:          total.count ?? 0,
    new:            newSeg.data?.length ?? 0,
    regular:        regular.data?.length ?? 0,
    vip:            vipCount,
    at_risk:        atRisk.data?.length ?? 0,
    lost:           lost.data?.length ?? 0,
    never_returned: neverRet.data?.length ?? 0,
  })
}

export const GET = withErrorCapture('customers/segments', _GET)
