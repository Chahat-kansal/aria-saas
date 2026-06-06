import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/aria/wins?businessId=
 * Returns a list of proven wins Aria has generated this week.
 * Sources (all additive — never remove a source):
 * 1. Waste savings from prep_predictions
 * 2. Council briefings generated
 * 3. CLV interventions sent
 * 4. Flash revenue actions
 * 5. Labour actions (early finish / open shifts)
 * 6. Revenue vs last week from pos_sales
 */
export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get('businessId')
  if (!businessId) return NextResponse.json({ wins: [] })

  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ wins: [] })

  const { data: biz } = await supabase
    .from('businesses').select('id').eq('id', businessId).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ wins: [] })

  const wins: { icon: string; label: string; value: string; color: string }[] = []
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()

  // 1. Revenue vs last week
  try {
    const [thisWeek, lastWeek] = await Promise.all([
      supabase.from('pos_sales').select('total_amount')
        .eq('business_id', businessId).eq('status', 'completed').gte('created_at', weekAgo),
      supabase.from('pos_sales').select('total_amount')
        .eq('business_id', businessId).eq('status', 'completed')
        .gte('created_at', twoWeeksAgo).lt('created_at', weekAgo),
    ])
    const tw = (thisWeek.data ?? []).reduce((s, r) => s + (r.total_amount ?? 0), 0)
    const lw = (lastWeek.data ?? []).reduce((s, r) => s + (r.total_amount ?? 0), 0)
    if (tw > 0 && lw > 0) {
      const pct = Math.round(((tw - lw) / lw) * 100)
      if (pct > 0) wins.push({ icon: '📈', label: 'Revenue', value: `+${pct}% vs last wk`, color: '#7FB897' })
      else if (pct < 0) wins.push({ icon: '📊', label: 'Revenue', value: `${pct}% vs last wk`, color: '#f59e0b' })
    } else if (tw > 0) {
      wins.push({ icon: '💰', label: 'Revenue', value: `A$${tw.toFixed(0)} this week`, color: '#7FB897' })
    }
  } catch (e) { console.error('[silent-catch]', e) }

  // 2. Council briefings generated this week
  try {
    const { count } = await supabase.from('council_runs')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', businessId).eq('synthesis_succeeded', true).gte('created_at', weekAgo)
    if ((count ?? 0) > 0)
      wins.push({ icon: '🧠', label: 'AI briefings', value: `${count} this week`, color: '#a78bfa' })
  } catch (e) { console.error('[silent-catch]', e) }

  // 3. CLV interventions sent
  try {
    const { count } = await supabase.from('aria_autopilot_actions')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', businessId).eq('action_type', 'clv_intervention').gte('created_at', weekAgo)
    if ((count ?? 0) > 0)
      wins.push({ icon: '💌', label: 'Customer messages', value: `${count} sent`, color: '#f472b6' })
  } catch (e) { console.error('[silent-catch]', e) }

  // 4. Waste savings from prep_predictions
  try {
    const { data: preds } = await supabase.from('prep_predictions')
      .select('waste_saved_dollars')
      .eq('business_id', businessId).gte('created_at', weekAgo)
    const saved = (preds ?? []).reduce((s, r) => s + (r.waste_saved_dollars ?? 0), 0)
    if (saved > 0)
      wins.push({ icon: '🥐', label: 'Waste saved', value: `A$${saved.toFixed(0)}`, color: '#34d399' })
  } catch (e) { console.error('[silent-catch]', e) }

  // 5. Labour actions (early finish offers etc)
  try {
    const { count } = await supabase.from('labour_optimisation_actions')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', businessId).eq('executed', true).gte('created_at', weekAgo)
    if ((count ?? 0) > 0)
      wins.push({ icon: '👥', label: 'Roster actions', value: `${count} executed`, color: '#60a5fa' })
  } catch (e) { console.error('[silent-catch]', e) }

  // 6. Flash revenue actions
  try {
    const { data: flash } = await supabase.from('aria_autopilot_actions')
      .select('metadata')
      .eq('business_id', businessId).eq('action_type', 'flash_revenue').gte('created_at', weekAgo)
    const flashRev = (flash ?? []).reduce((s, r) => s + ((r.metadata as Record<string,number>)?.revenue_generated ?? 0), 0)
    if (flashRev > 0)
      wins.push({ icon: '⚡', label: 'Flash revenue', value: `A$${flashRev.toFixed(0)}`, color: '#fbbf24' })
  } catch (e) { console.error('[silent-catch]', e) }

  return NextResponse.json({ wins })
}
