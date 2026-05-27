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
  const businessId = searchParams.get('business_id')
  if (!businessId) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', businessId).eq('user_id', user.id).single()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { searchParams: sp2 } = new URL(req.url)
  const id = sp2.get('id')

  if (id) {
    const { data: row } = await supabaseAdmin
      .from('weekly_report_records')
      .select('id, week_starting, pdf_url, email_sent, email_sent_at, revenue, transaction_count, avg_ticket, new_customers, goal_attainment_pct, report_data, narrative, created_at')
      .eq('id', id)
      .eq('business_id', businessId)
      .maybeSingle()
    return NextResponse.json({ record: row })
  }

  const { data } = await supabaseAdmin
    .from('weekly_report_records')
    .select('id, week_starting, pdf_url, email_sent, email_sent_at, revenue, transaction_count, avg_ticket, new_customers, goal_attainment_pct, created_at')
    .eq('business_id', businessId)
    .order('week_starting', { ascending: false })
    .limit(50)

  return NextResponse.json({ records: data ?? [] })
}

export const GET = withErrorCapture('reports/weekly-records', _GET)
