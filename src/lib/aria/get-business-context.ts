import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { todayAEST, toAESTStart, startOfWeekAEST } from '@/lib/date-au'
import { getWeatherContext } from './get-weather-context'
import { CANONICAL_COLS } from './schema-registry'

export async function getBusinessContext(businessId: string): Promise<string> {
  const supabase = createServerSupabaseClient()
  const db = supabaseAdmin
  const now = new Date()

  const d7  = new Date(now.getTime() - 7  * 86400000).toISOString()
  const d30 = new Date(now.getTime() - 30 * 86400000).toISOString()
  const d90 = new Date(now.getTime() - 90 * 86400000).toISOString()

  const ly = new Date(now.getTime() - 365 * 86400000)
  const ly7start  = new Date(ly.getTime() - 7  * 86400000).toISOString()
  const ly7end    = ly.toISOString()
  const ly30start = new Date(ly.getTime() - 30 * 86400000).toISOString()
  const ly30end   = ly.toISOString()

  // SWLM-1: "Same week last month" = the CALENDAR week 4 weeks ago (Mon 00:00 AEST → Mon),
  // replacing the rolling d-35/d-28 window whose request-time anchoring caused per-request drift
  const swlmMonShifted = startOfWeekAEST() // shifted Date — ISO date-part IS the AEST Monday
  const thisMonIso = toAESTStart(swlmMonShifted.toISOString().slice(0, 10))
  const d35 = new Date(new Date(thisMonIso).getTime() - 28 * 86400000).toISOString() // SWLM window start (Mon, 4 weeks ago)
  const d28 = new Date(new Date(thisMonIso).getTime() - 21 * 86400000).toISOString() // SWLM window end (Mon, 3 weeks ago)
  const swlmMonStr = new Date(swlmMonShifted.getTime() - 28 * 86400000).toISOString().slice(0, 10)
  const swlmSunStr = new Date(swlmMonShifted.getTime() - 22 * 86400000).toISOString().slice(0, 10)

  const monthStart = toAESTStart(todayAEST().slice(0, 7) + '-01') // TZ-1: AEST month start

  const [
    business,
    sales7, sales30, sales90,
    ly7, ly30,
    saleItems7,
    customers, reviews, outcomes, lowStock,
    hypothesisOutcomes,
    topLeakRaw,
    expenses7Raw,
    posCustomerCountRaw,
    posCustomerEmailCountRaw,
    posConsentCountRaw,
    promotionsRaw,
    salesSameWeekLastMonth,
    ariaActionsRaw,
    salesThisCalWeekRaw,
  ] = await Promise.allSettled([
    db.from('businesses').select('*').eq('id', businessId).single(),
    db.from('pos_sales').select('total_amount, created_at')
      .eq('business_id', businessId).gte('created_at', d7).neq('status', 'voided'),
    db.from('pos_sales').select('total_amount')
      .eq('business_id', businessId).gte('created_at', d30).neq('status', 'voided'),
    db.from('pos_sales').select('total_amount')
      .eq('business_id', businessId).gte('created_at', d90).neq('status', 'voided'),
    db.from('pos_sales').select('total_amount')
      .eq('business_id', businessId)
      .gte('created_at', ly7start).lte('created_at', ly7end).neq('status', 'voided'),
    db.from('pos_sales').select('total_amount')
      .eq('business_id', businessId)
      .gte('created_at', ly30start).lte('created_at', ly30end).neq('status', 'voided'),
    // SKU aggregation from sale_items — line_total canonical (RULE 6, product_sales registry domain)
    db.from('pos_sale_items').select(`product_name, ${CANONICAL_COLS.PRODUCT_UNITS}, ${CANONICAL_COLS.PRODUCT_REVENUE}`)
      .in('sale_id',
        (await db.from('pos_sales').select('id')
          .eq('business_id', businessId).gte('created_at', d7).neq('status', 'voided')
        ).data?.map((s: any) => s.id) ?? []
      ),
    db.from('pos_customers').select('id, name, total_spent, last_visit, visit_count')
      .eq('business_id', businessId).order('total_spent', { ascending: false }).limit(5),
    db.from('reviews').select('rating, text, created_at')
      .eq('business_id', businessId).order('created_at', { ascending: false }).limit(5),
    db.from('aria_outcomes').select('recommendation_type, recommendation_detail, recommended_at')
      .eq('business_id', businessId).order('recommended_at', { ascending: false }).limit(5),
    db.from('pos_products').select('name, stock_quantity, reorder_point')
      .eq('business_id', businessId).eq('is_active', true)
      .filter('stock_quantity', 'lte', 10).limit(5),
    db.from('aria_hypotheses')
      .select('outcome_verdict')
      .eq('business_id', businessId)
      .eq('status', 'closed')
      .gte('generated_at', monthStart),
    db.from('profit_leaks')
      .select('title, monthly_loss, recommendation, status')
      .eq('business_id', businessId)
      .neq('status', 'fixed')
      .order('monthly_loss', { ascending: false })
      .limit(1)
      .maybeSingle(),
    db.from('business_expenses')
      .select('amount')
      .eq('business_id', businessId)
      .gte('expense_date', d7),
    // Real POS customer count — distinct from the CRM 'customers' table
    db.from('pos_customers').select('*', { count: 'exact', head: true }).eq('business_id', businessId),
    // POS customers with a non-null email
    db.from('pos_customers').select('*', { count: 'exact', head: true }).eq('business_id', businessId).not('email', 'is', null).neq('email', ''),
    // Marketing-consented customers only — the ONLY safe emailable/textable audience (registry: marketing_consent domain)
    db.from('pos_customers').select('*', { count: 'exact', head: true }).eq('business_id', businessId).eq(CANONICAL_COLS.MARKETING_CONSENT, true),
    // Promotion status — prevents hallucinated "working" claims about scheduled promos
    db.from('pos_promotions')
      .select('id, name, promotion_type, discount_amount, active, starts_at, ends_at, current_uses')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(20),
    // SWLM-1: "Same week last month" — calendar week 4 weeks ago (Mon AEST → Mon AEST)
    db.from('pos_sales').select('total_amount')
      .eq('business_id', businessId)
      .gte('created_at', d35).lt('created_at', d28).neq('status', 'voided'),
    // CANONICAL recommendations (aria_actions). See THREE-TABLE NOTE in return JSON below.
    db.from('aria_actions')
      .select('id, title, category, priority, recommendation, expected_impact, created_at', { count: 'exact' })
      .eq('business_id', businessId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(10),
    // WEEK-1: "this week" = calendar week (Monday 00:00 AEST → now) for week_tracking / on-track checks
    db.from('pos_sales').select('total_amount')
      .eq('business_id', businessId)
      .gte('created_at', toAESTStart(startOfWeekAEST().toISOString().slice(0, 10)))
      .neq('status', 'voided'),
  ])

  // SKU aggregation from sale_items — use line_total (registry product_sales canonical, RULE 6)
  const skuMap: Record<string, { revenue: number; units: number; name: string }> = {}
  if (saleItems7.status === 'fulfilled' && saleItems7.value.data) {
    for (const item of saleItems7.value.data as Array<Record<string, unknown>>) {
      const key = (item.product_name as string | null) ?? 'unknown'
      if (!skuMap[key]) skuMap[key] = { revenue: 0, units: 0, name: key }
      skuMap[key].revenue += Number(item[CANONICAL_COLS.PRODUCT_REVENUE] ?? 0)
      skuMap[key].units  += Number(item[CANONICAL_COLS.PRODUCT_UNITS]   ?? 1)
    }
  }
  const skus     = Object.values(skuMap).sort((a, b) => b.revenue - a.revenue)
  const top20    = skus.slice(0, 10)
  const bottom20 = skus.length > 5 ? skus.slice(-10).reverse() : []

  const sum = (r: any) => r.status === 'fulfilled'
    ? (r.value.data ?? []).reduce((s: number, x: any) => s + (x.total_amount ?? 0), 0)
    : null

  const rev7   = sum(sales7)
  const rev30  = sum(sales30)
  const rev90  = sum(sales90)
  const lyRev7  = sum(ly7)
  const lyRev30 = sum(ly30)
  const revSWLM = sum(salesSameWeekLastMonth)   // "same week last month" revenue
  const revWeek = sum(salesThisCalWeekRaw)      // WEEK-1: calendar week (Mon 00:00 AEST → now)

  const yoy7  = rev7 != null && lyRev7  != null && lyRev7  > 0
    ? (((rev7  - lyRev7)  / lyRev7)  * 100).toFixed(1) + '%' : null
  const yoy30 = rev30 != null && lyRev30 != null && lyRev30 > 0
    ? (((rev30 - lyRev30) / lyRev30) * 100).toFixed(1) + '%' : null

  const biz   = business.status  === 'fulfilled' ? business.value.data   : null
  const custs = customers.status === 'fulfilled' ? customers.value.data  ?? [] : []
  const revs  = reviews.status   === 'fulfilled' ? reviews.value.data    ?? [] : []
  const outs  = outcomes.status  === 'fulfilled' ? outcomes.value.data   ?? [] : []
  const alts  = lowStock.status  === 'fulfilled' ? lowStock.value.data   ?? [] : []

  const topLeakData = topLeakRaw.status === 'fulfilled' ? (topLeakRaw.value.data as { title: string; monthly_loss: number; recommendation: string; status: string } | null) : null

  const expenses7Total = expenses7Raw.status === 'fulfilled'
    ? ((expenses7Raw.value.data ?? []) as Array<{ amount: number }>).reduce((s, e) => s + (e.amount ?? 0), 0)
    : 0
  const net7 = (rev7 ?? 0) - expenses7Total
  const dailyNet = net7 / 7

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const posCustomerCount: number | null = (posCustomerCountRaw as any).status === 'fulfilled'
    ? ((posCustomerCountRaw as any).value?.count ?? 0)
    : null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const posCustomerEmailCount: number | null = (posCustomerEmailCountRaw as any).status === 'fulfilled'
    ? ((posCustomerEmailCountRaw as any).value?.count ?? 0)
    : null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const posConsentCount: number | null = (posConsentCountRaw as any).status === 'fulfilled'
    ? ((posConsentCountRaw as any).value?.count ?? 0)
    : null

  const todayStr = todayAEST() // TZ-1: AEST calendar date, was UTC date
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allPromos = (promotionsRaw as any).status === 'fulfilled'
    ? ((promotionsRaw as any).value?.data ?? []) as Array<{
        id: string; name: string; promotion_type: string; discount_amount: number | null
        active: boolean; starts_at: string | null; ends_at: string | null; current_uses: number
      }>
    : []
  const activePromos = allPromos.filter(p => p.active && (!p.starts_at || p.starts_at <= todayStr))
  const scheduledPromos = allPromos.filter(p => !p.active || (!!p.starts_at && p.starts_at > todayStr))

  const outcomeData = hypothesisOutcomes.status === 'fulfilled' ? (hypothesisOutcomes.value.data ?? []) : []
  const outcomes_arr = (outcomeData) as Array<{ outcome_verdict: string | null }>
  const hyp_worked = outcomes_arr.filter(o => o.outcome_verdict === 'worked').length
  const hyp_failed = outcomes_arr.filter(o => o.outcome_verdict === 'failed').length
  const hyp_total = outcomes_arr.filter(o => o.outcome_verdict !== null).length
  const hyp_successRate = hyp_total > 0 ? Math.round((hyp_worked / hyp_total) * 100) : null

  const lapsed = custs.filter((c: any) =>
    c.last_visit && new Date(c.last_visit) < new Date(now.getTime() - 42 * 86400000)
  )

  const avgRating = revs.length
    ? (revs.reduce((s: number, r: any) => s + (r.rating ?? 0), 0) / revs.length).toFixed(1)
    : null

  const hasSalesData = (rev7 ?? 0) > 0 || skus.length > 0

  const city     = biz?.city ?? biz?.suburb ?? 'Melbourne'
  const industry = biz?.industry ?? 'retail'
  const weather  = await getWeatherContext(industry, city)

  return JSON.stringify({
    _meta: {
      snapshot_date: now.toISOString().split('T')[0],
      has_sales_data: hasSalesData,
      business_id: businessId,
    },
    business: biz ? {
      name:             biz.name,
      industry:         biz.industry,
      city:             biz.city ?? biz.suburb ?? 'AU',
      owner_name:       biz.owner_name ?? biz.contact_name ?? 'the owner',
      plan:             biz.plan,
      pos_enabled:      biz.pos_enabled ?? false,
      entity_type:      biz.entity_type ?? null,
      business_model:   biz.business_model ?? null,
      year_established: biz.year_established ?? null,
      biggest_challenge: biz.biggest_challenge ?? null,
    } : null,
    revenue: {
      last_7_days:    rev7,
      last_30_days:   rev30,
      last_90_days:   rev90,
      yoy_7d_change:  yoy7,
      yoy_30d_change: yoy30,
      yoy_note: yoy7
        ? `vs same period last year: 7d ${yoy7}, 30d ${yoy30 ?? 'n/a'}`
        : 'no prior year data available',
    },
    week_tracking: (() => {
      // WEEK-1: "this week" / on-track checks use the CALENDAR week (Mon 00:00 AEST → now), not rolling 7d
      const target = biz?.weekly_revenue_target ? Number(biz.weekly_revenue_target) : null
      const pctOfTarget = (target && target > 0 && revWeek != null)
        ? Math.round((revWeek / target) * 100) : null
      const vsSWLMPct = (revSWLM != null && revSWLM > 0 && revWeek != null)
        ? (((revWeek - revSWLM) / revSWLM) * 100).toFixed(1) + '%' : null
      const onTrack = (target && revWeek != null)
        ? (revWeek >= target ? 'on_track' : 'behind') : null
      const swlmWindow = `Mon ${swlmMonStr} to Sun ${swlmSunStr} (calendar week, 4 weeks ago)`
      const parts: string[] = []
      if (revWeek != null) {
        if (target) {
          const gap = target - revWeek
          parts.push(`This week (Mon 00:00 AEST → now) revenue $${revWeek.toFixed(2)} vs weekly target $${target.toFixed(2)} — ${pctOfTarget}% of target${gap > 0 ? ', $' + gap.toFixed(2) + ' short' : ', on track'}.`)
        } else {
          parts.push(`This week (Mon 00:00 AEST → now) revenue $${revWeek.toFixed(2)}. Weekly target: NOT SET — if owner asks "on track?", say target not set and offer to set one. Never use any average as a proxy for a target.`)
        }
      }
      if (revSWLM != null) {
        parts.push(`Same week last month (${swlmWindow}): $${revSWLM.toFixed(2)}${vsSWLMPct ? ' (' + (Number(vsSWLMPct) >= 0 ? '+' : '') + vsSWLMPct + ' vs current week)' : ''}.`)
      } else {
        parts.push(`Same week last month (${swlmWindow}): no sales data found for that window.`)
      }
      return {
        current_week_revenue: revWeek,
        current_7d_revenue: rev7,
        same_week_last_month_revenue: revSWLM,
        same_week_window: swlmWindow,
        weekly_revenue_target: target,
        pct_of_target: pctOfTarget,
        vs_same_week_pct: vsSWLMPct,
        on_track: onTrack,
        note: parts.join(' '),
      }
    })(),
    top_products_7d:  top20.map(s => ({ name: s.name, revenue: s.revenue, units: s.units })),
    slow_products_7d: bottom20.map(s => ({ name: s.name, revenue: s.revenue, units: s.units })),
    customers: {
      pos_customer_count: posCustomerCount,
      with_email_count: posCustomerEmailCount,
      marketing_consented_count: posConsentCount,
      marketing_consent_caveat: posConsentCount !== null && posCustomerCount !== null
        ? `MANDATORY: only ${posConsentCount} of ${posCustomerCount} customers have consented to marketing. Emailable/textable audience = ${posConsentCount}, NOT ${posCustomerCount}. Always state this when suggesting campaigns.`
        : 'marketing consent count unavailable — do not state a campaign audience size without querying live',
      total:           custs.length,
      top_5_by_spend:  custs.slice(0, 5).map((c: any) => ({
        name: c.name, total_spent: c.total_spent, visit_count: c.visit_count
      })),
      lapsed_count:  lapsed.length,
      lapsed_sample: lapsed.slice(0, 3).map((c: any) => ({
        name: c.name, last_visit: c.last_visit, total_spent: c.total_spent
      })),
    },
    reviews: {
      average_rating: avgRating,
      recent: revs.slice(0, 3).map((r: any) => ({
        rating: r.rating, text: r.text?.slice(0, 200), date: r.created_at
      })),
    },
    low_stock_alerts: alts,
    recent_aria_outcomes: outs,
    aria_intelligence: {
      suggestions_this_month: { worked: hyp_worked, failed: hyp_failed, inconclusive: hyp_total - hyp_worked - hyp_failed },
      success_rate_pct: hyp_successRate,
      summary: hyp_successRate !== null
        ? 'Aria suggestions this month: ' + hyp_worked + ' worked, ' + hyp_failed + " didn't (" + hyp_successRate + '% success rate)'
        : 'No closed hypotheses this month yet',
    },
    cash_position: {
      estimated_net_7d: Math.round(net7 * 100) / 100,
      daily_net: Math.round(dailyNet * 100) / 100,
      runway_signal: dailyNet < 0 ? 'Spending exceeds revenue — monitor cash closely' : 'Revenue exceeding expenses — healthy position',
      summary: 'Estimated 7-day net position: $' + net7.toFixed(0) + '. Daily net: $' + dailyNet.toFixed(2) + '/day.',
    },
    promotions: {
      as_of: todayStr,
      active_count: activePromos.length,
      scheduled_count: scheduledPromos.length,
      active: activePromos.slice(0, 5).map(p => ({
        name: p.name, type: p.promotion_type, discount: p.discount_amount,
        starts_at: p.starts_at, ends_at: p.ends_at, uses: p.current_uses,
        status: 'ACTIVE — live and running now',
      })),
      scheduled: scheduledPromos.slice(0, 5).map(p => ({
        name: p.name, type: p.promotion_type, discount: p.discount_amount,
        starts_at: p.starts_at, ends_at: p.ends_at,
        status: p.starts_at && p.starts_at > todayStr
          ? `SCHEDULED — not live yet (starts ${p.starts_at})`
          : 'INACTIVE — created but not yet activated',
      })),
    },
    top_profit_leak: topLeakData ? {
      title: topLeakData.title,
      monthly_loss: topLeakData.monthly_loss,
      recommendation: topLeakData.recommendation,
      summary: 'Top profit leak: ' + topLeakData.title + ' — costing $' + Number(topLeakData.monthly_loss ?? 0).toFixed(0) + '/month. ' + (topLeakData.recommendation ?? ''),
    } : null,
    weather: weather ?? { _note: 'Weather data unavailable — proceeding without weather context.' },
    // THREE-TABLE NOTE — prevents split-brain when reading recommendation counts:
    //   aria_actions          = CANONICAL queue (~235 pending for Sip); UI: Autopilot/Brain panel
    //   aria_autopilot_actions = secondary table (~1 pending for Sip); UI: aria-os/status, inbox, wins
    //   aria_action_log        = immutable audit trail (never counts as "recommendations")
    // The block below uses aria_actions (canonical). Use this count when correcting user premises.
    aria_recommendations: (() => {
      if (ariaActionsRaw.status !== 'fulfilled') return null
      const r = ariaActionsRaw.value
      const rows = (r.data ?? []) as Array<{
        title: string | null; category: string | null; priority: string | null
        recommendation: string | null; expected_impact: string | null; created_at: string
      }>
      return {
        _source: 'aria_actions (canonical — NOT aria_autopilot_actions)',
        pending_count: r.count ?? 0,
        top_pending: rows.slice(0, 5).map(a => ({
          title:           a.title,
          category:        a.category,
          priority:        a.priority,
          recommendation:  a.recommendation?.slice(0, 200),
          expected_impact: a.expected_impact,
          created_at:      a.created_at,
        })),
        grounding_note: `Pending recommendation count is ${r.count ?? 0}. If the user states a different number, correct them before answering.`,
      }
    })(),
    seo: await (async () => {
      try {
        const [seoCtx, kwRankings] = await Promise.all([
          db.from('aria_seo_context').select('health_score, critical_issues, top_keyword, top_keyword_rank, updated_at').eq('business_id', businessId).maybeSingle(),
          db.from('seo_keyword_rankings').select('keyword, current_position, position_history, last_checked_at').eq('business_id', businessId).order('current_position', { ascending: true }).limit(10),
        ])
        const seo = seoCtx.data
        const rankings = (kwRankings.data ?? []) as Array<{ keyword: string; current_position: number | null; position_history: unknown; last_checked_at: string | null }>

        const top5 = rankings
          .filter(r => r.current_position != null)
          .slice(0, 5)
          .map(r => ({ keyword: r.keyword, position: r.current_position }))

        const movers: Array<{ keyword: string; from: number; to: number; change: number }> = []
        for (const r of rankings) {
          if (r.current_position == null) continue
          const hist = Array.isArray(r.position_history) ? (r.position_history as Array<{ position: number | null }>) : []
          if (hist.length < 2) continue
          const prev = hist[hist.length - 2].position
          if (prev == null) continue
          const change = prev - r.current_position
          if (Math.abs(change) > 3) movers.push({ keyword: r.keyword, from: prev, to: r.current_position, change })
        }

        return {
          health_score: seo?.health_score ?? null,
          critical_issues: seo?.critical_issues ?? null,
          top_keyword: seo?.top_keyword ?? (top5[0]?.keyword ?? null),
          top_keyword_rank: seo?.top_keyword_rank ?? (top5[0]?.position ?? null),
          last_audit: seo?.updated_at ?? null,
          top_keywords: top5,
          ranking_movers: movers.slice(0, 5),
        }
      } catch { return null }
    })(),
  }, null, 2)
}

// Pre-flight guard — call before Claude on analysis routes
export function hasEnoughData(context: string): boolean {
  try {
    return JSON.parse(context)._meta?.has_sales_data === true
  } catch {
    return false
  }
}
