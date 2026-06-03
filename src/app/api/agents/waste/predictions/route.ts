export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _GET() {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: biz } = await supabaseAdmin
    .from('businesses').select('id').eq('user_id', user.id).eq('is_active', true).limit(1).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Business not found' }, { status: 404 })

  const today = new Date().toISOString().slice(0, 10)
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)

  const [todayRes, tomorrowRes, wasteRes, accuracyRes] = await Promise.all([
    supabaseAdmin
      .from('prep_predictions')
      .select('id,product_id,predicted_units_sold,recommended_prep_qty,recommended_prep_time,prep_guide_narrative,prediction_confidence,actual_units_sold,actual_waste_units,actual_waste_value,promotion_triggered,pos_products(name,shelf_life_hours)')
      .eq('business_id', biz.id)
      .eq('prediction_date', today),
    supabaseAdmin
      .from('prep_predictions')
      .select('id,product_id,predicted_units_sold,recommended_prep_qty,recommended_prep_time,prep_guide_narrative,prediction_confidence,pos_products(name,shelf_life_hours)')
      .eq('business_id', biz.id)
      .eq('prediction_date', tomorrow),
    supabaseAdmin
      .from('waste_log')
      .select('total_waste_value,prevented_by_agent')
      .eq('business_id', biz.id)
      .gte('waste_date', thirtyDaysAgo),
    supabaseAdmin
      .from('prep_predictions')
      .select('prediction_error_pct')
      .eq('business_id', biz.id)
      .gte('prediction_date', thirtyDaysAgo)
      .not('prediction_error_pct', 'is', null),
  ])

  const wasteRows = wasteRes.data ?? []
  const wasteSavedThisMonth = wasteRows
    .filter(w => w.prevented_by_agent)
    .reduce((s, w) => s + Number(w.total_waste_value ?? 0), 0)

  const accuracyRows = (accuracyRes.data ?? []).map(r => Number(r.prediction_error_pct ?? 0))
  const avgError = accuracyRows.length > 0 ? accuracyRows.reduce((s, v) => s + v, 0) / accuracyRows.length : null
  const accuracyPct = avgError !== null ? Math.max(0, Math.round((100 - avgError) * 10) / 10) : null

  return NextResponse.json({
    today_predictions: todayRes.data ?? [],
    tomorrow_predictions: tomorrowRes.data ?? [],
    waste_saved_this_month: Math.round(wasteSavedThisMonth * 100) / 100,
    accuracy_this_month: accuracyPct,
  })
}

export const GET = withErrorCapture('agents/waste/predictions', _GET)
