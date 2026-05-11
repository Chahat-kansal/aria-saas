export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { generateInsight } from '@/lib/aria-insights'
import { checkBriefingTrigger, localDateString, BriefingBusiness } from '@/lib/aria/timezone'

function authOk(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return true  // dev — no secret configured
  const auth = req.headers.get('authorization') ?? req.headers.get('x-cron-secret') ?? ''
  return auth === `Bearer ${cronSecret}` || auth === cronSecret
}

async function generateMorning(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  biz: BriefingBusiness,
  today: string
) {
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const yday = yesterday.toISOString().slice(0, 10)

  const { data: sales } = await supabase
    .from('pos_sales')
    .select('total_amount, served_by')
    .eq('business_id', biz.id)
    .neq('status', 'voided')
    .gte('created_at', `${yday}T00:00:00Z`)
    .lte('created_at', `${yday}T23:59:59Z`)

  const revenue = (sales ?? []).reduce((s, r) => s + (r.total_amount ?? 0), 0)
  const txCount = (sales ?? []).length

  const { data: lowStock } = await supabase
    .from('pos_products')
    .select('name, stock_quantity')
    .eq('business_id', biz.id)
    .eq('is_active', true)
    .lte('stock_quantity', 5)
    .limit(5)

  const { bullets } = await generateInsight({
    business_id: biz.id,
    context: `morning_briefing date=${today} yesterday_revenue=$${revenue.toFixed(0)} yesterday_transactions=${txCount} low_stock_count=${(lowStock ?? []).length}`,
    data: { revenue, transactions: txCount, low_stock: (lowStock ?? []).map(p => p.name) },
    maxBullets: 3,
    realtime: true,
  })

  await supabase.from('pos_daily_briefings').upsert({
    business_id: biz.id,
    briefing_date: today,
    briefing_type: 'morning',
    bullets,
    action_items: [],
    pace_vs_average_pct: null,
  }, { onConflict: 'business_id,briefing_date,briefing_type' })

  // Also keep legacy cache in sync
  const { error: cacheErr } = await supabase.from('aria_briefings_cache').upsert({
    business_id: biz.id,
    briefing_date: today,
    bullets,
  }, { onConflict: 'business_id,briefing_date' })
  if (cacheErr) console.warn('[generate-briefings] aria_briefings_cache upsert:', cacheErr.message)
}

async function generateEvening(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  biz: BriefingBusiness,
  today: string
) {
  const { data: sales } = await supabase
    .from('pos_sales')
    .select('total_amount, served_by, created_at')
    .eq('business_id', biz.id)
    .neq('status', 'voided')
    .gte('created_at', `${today}T00:00:00Z`)

  const revenue = (sales ?? []).reduce((s, r) => s + (r.total_amount ?? 0), 0)
  const txCount = (sales ?? []).length

  const { bullets } = await generateInsight({
    business_id: biz.id,
    context: `evening_briefing date=${today} today_revenue_so_far=$${revenue.toFixed(0)} today_transactions=${txCount}`,
    data: { revenue, transactions: txCount, type: 'evening' },
    maxBullets: 3,
    realtime: true,
  })

  await supabase.from('pos_daily_briefings').upsert({
    business_id: biz.id,
    briefing_date: today,
    briefing_type: 'evening',
    bullets,
    action_items: [],
    eod_reconciliation_status: 'pending',
  }, { onConflict: 'business_id,briefing_date,briefing_type' })
}

export async function GET(req: NextRequest) {
  if (!authOk(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const supabase = createServerSupabaseClient()

  const { data: bizList, error } = await supabase
    .from('businesses')
    .select('id, timezone, closing_hour_local, evening_briefing_lead_hours, evening_briefing_enabled, morning_briefing_enabled')
    .eq('is_active', true)
    .limit(500)

  if (error) {
    console.error('[generate-briefings] businesses query failed:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const businesses = (bizList ?? []) as BriefingBusiness[]
  let morning = 0, evening = 0, errors = 0

  for (const biz of businesses) {
    const trigger = checkBriefingTrigger(biz)
    if (!trigger) continue

    const today = localDateString(biz.timezone || 'Australia/Melbourne')

    try {
      if (trigger === 'morning') {
        await generateMorning(supabase, biz, today)
        morning++
      } else {
        await generateEvening(supabase, biz, today)
        evening++
      }
    } catch (err) {
      console.error(`[generate-briefings] ${trigger} failed for ${biz.id}:`, err)
      errors++
    }
  }

  return NextResponse.json({ morning, evening, errors, total: businesses.length })
}
