export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _GET() {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: biz } = await supabaseAdmin
    .from('businesses')
    .select('id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Business not found' }, { status: 404 })

  const [forecastRes, oppsRes, bankRes] = await Promise.all([
    supabaseAdmin
      .from('cash_flow_forecasts')
      .select('*')
      .eq('business_id', biz.id)
      .order('forecast_week', { ascending: true })
      .order('week_number', { ascending: true })
      .limit(14),
    supabaseAdmin
      .from('financing_opportunities')
      .select('*')
      .eq('business_id', biz.id)
      .eq('status', 'open')
      .order('urgency', { ascending: true }),
    supabaseAdmin
      .from('basiq_connections')
      .select('status,updated_at')
      .eq('business_id', biz.id)
      .eq('status', 'active')
      .maybeSingle(),
  ])

  const weeks = forecastRes.data ?? []
  const opportunities = oppsRes.data ?? []
  const bankConnection = bankRes.data

  const currentCash = weeks[0]?.opening_cash_position ?? null
  const criticalWeeks = weeks.filter(w => w.risk_level === 'critical' || w.risk_level === 'high')

  return NextResponse.json({
    weeks,
    current_cash: currentCash,
    bank_connected: !!bankConnection,
    bank_updated_at: bankConnection?.updated_at ?? null,
    cash_is_estimated: !bankConnection,
    critical_weeks: criticalWeeks,
    opportunities,
  })
}

export const GET = withErrorCapture('agents/financing/forecast', _GET)
