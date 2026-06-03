export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { assessDataQuality } from '@/lib/aria/data-quality'

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const businessIdParam = searchParams.get('businessId')

  let bid: string | null = null
  if (businessIdParam) {
    const { data: biz } = await supabaseAdmin
      .from('businesses')
      .select('id')
      .eq('id', businessIdParam)
      .eq('user_id', user.id)
      .maybeSingle()
    bid = biz?.id ?? null
  } else {
    const { data: active } = await supabaseAdmin
      .from('user_active_business')
      .select('business_id')
      .eq('user_id', user.id)
      .maybeSingle()
    bid = active?.business_id ?? null
    if (!bid) {
      const { data: biz } = await supabaseAdmin
        .from('businesses')
        .select('id')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle()
      bid = biz?.id ?? null
    }
  }

  if (!bid) return NextResponse.json({ error: 'Business not found' }, { status: 404 })

  const report = await assessDataQuality(bid)

  // Upsert to DB for dashboard history
  try {
    await supabaseAdmin.from('aria_data_quality').upsert({
      business_id: bid,
      assessed_date: new Date().toISOString().slice(0, 10),
      pos_data_score: report.pos_score,
      customer_data_score: report.customer_score,
      inventory_data_score: report.inventory_score,
      staff_data_score: report.staff_score,
      supplier_data_score: report.supplier_score,
      overall_score: report.overall_score,
      missing_critical: report.missing_critical,
      missing_helpful: report.missing_helpful,
    }, { onConflict: 'business_id,assessed_date' })
  } catch { /* non-fatal */ }

  return NextResponse.json(report)
}

export const GET = withErrorCapture('aria/data-quality', _GET)
