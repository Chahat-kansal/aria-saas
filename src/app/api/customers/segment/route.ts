export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

function scoreR(daysSince: number): number {
  if (daysSince <= 7) return 5
  if (daysSince <= 30) return 4
  if (daysSince <= 60) return 3
  if (daysSince <= 90) return 2
  return 1
}
function scoreF(visits: number): number {
  if (visits >= 20) return 5
  if (visits >= 10) return 4
  if (visits >= 5) return 3
  if (visits >= 2) return 2
  return 1
}
function scoreM(spend: number): number {
  if (spend >= 500) return 5
  if (spend >= 200) return 4
  if (spend >= 100) return 3
  if (spend >= 50) return 2
  return 1
}
function segment(r: number, f: number, m: number, daysSince: number, visits: number, agedays: number): string {
  if (agedays <= 30 && visits <= 2) return 'new'
  if (visits === 1 && agedays > 30) return 'never_returned'
  if (r >= 4 && f >= 4 && m >= 4) return 'champions'
  if (f >= 4 && (r + f + m) >= 10) return 'loyal'
  if (r <= 2 && f >= 3) return 'at_risk'
  if (r === 1) return 'lost'
  return 'regular'
}
function churnRisk(daysSince: number, seg: string): string {
  if (seg === 'at_risk' || seg === 'lost' || seg === 'never_returned' || daysSince > 90) return 'high'
  if (daysSince >= 45) return 'medium'
  return 'low'
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const business_id = body.business_id as string | undefined
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).single()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: customers } = await supabaseAdmin
    .from('customers')
    .select('id, visit_count, total_spent, total_spend, last_visit, created_at')
    .eq('business_id', business_id)
    .eq('archived', false)

  if (!customers || customers.length === 0) return NextResponse.json({ updated: 0 })

  const now = Date.now()
  let updated = 0

  for (const c of customers) {
    const daysSince = c.last_visit
      ? Math.floor((now - new Date(c.last_visit).getTime()) / 86400000)
      : 999
    const agedays = c.created_at
      ? Math.floor((now - new Date(c.created_at).getTime()) / 86400000)
      : 0
    const visits = Number(c.visit_count ?? 0)
    const spend = Number(c.total_spent ?? c.total_spend ?? 0)

    const r = scoreR(daysSince)
    const f = scoreF(visits)
    const m = scoreM(spend)
    const total = r + f + m
    const seg = segment(r, f, m, daysSince, visits, agedays)
    const risk = churnRisk(daysSince, seg)

    await supabaseAdmin.from('customers').update({
      rfm_score_numeric: total,
      customer_segment: seg,
      churn_risk: risk,
      updated_at: new Date().toISOString(),
    }).eq('id', c.id)
    updated++
  }

  return NextResponse.json({ updated })
}

export const POST = withErrorCapture('customers/segment', _POST)
