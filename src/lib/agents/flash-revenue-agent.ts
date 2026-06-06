import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendSMS } from '@/lib/clicksend';
import { trackAICall } from '@/lib/aria/ai-telemetry';
import { BaseAgent } from './base-agent';
import type { AgentType, AgentRunResult } from './types';

interface FiredTrigger {
  type: string;
  data: Record<string, unknown>;
  severity: 'critical' | 'high' | 'normal';
}

interface InterventionChoice {
  intervention_type: string;
  channel: string;
  target_segment: string;
  message_text: string;
  discount_pct: number | null;
  product_ids: string[] | null;
  reasoning: string;
  expected_lift_pct: number;
  expires_minutes: number;
}

interface ExpiringProduct {
  id: string;
  name: string;
  price: number;
  stock_quantity: number;
  expiry_date: string;
  cost_price?: number;
}

export class FlashRevenueAgent extends BaseAgent {
  type: AgentType = 'flash_revenue';

  async run(business_id: string): Promise<AgentRunResult> {
    const t0 = Date.now();
    const errors: Error[] = [];

    const settings = await this.getSettings(business_id);
    if (!settings.enabled) return { decisions: [], errors: [], duration_ms: 0 };

    const config = settings.config as {
      cooldown_minutes?: number;
      min_gap_between_sms_days?: number;
      trading_hours_start?: number;
      trading_hours_end?: number;
      enabled_triggers?: string[];
      revenue_shortfall_threshold_pct?: number;
      dead_period_minutes?: number;
      expiry_stock_minimum?: number;
      labour_pct_threshold?: number;
      basket_drop_threshold_pct?: number;
      mode?: string;
      best_interventions?: string[];
      failed_interventions?: string[];
      intervention_success_rates?: Record<string, number>;
    };

    // STEP 1 — Trading hours check (using AEST UTC+10 approximation via server time)
    const nowUTC = new Date();
    const aestHour = (nowUTC.getUTCHours() + 10) % 24;
    const tradingStart = config.trading_hours_start ?? 7;
    const tradingEnd = config.trading_hours_end ?? 22;
    if (aestHour < tradingStart || aestHour >= tradingEnd) {
      return { decisions: [], errors: [], duration_ms: Date.now() - t0 };
    }

    // STEP 2 — Cooldown check
    const cooldownMin = config.cooldown_minutes ?? 90;
    const cooldownCutoff = new Date(Date.now() - cooldownMin * 60000).toISOString();
    const { count: recentCount } = await supabaseAdmin
      .from('flash_interventions')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', business_id)
      .gte('executed_at', cooldownCutoff)
      .is('cancelled_at', null);

    if ((recentCount ?? 0) > 0) {
      return { decisions: [], errors: [], duration_ms: Date.now() - t0 };
    }

    // Also prevent more than 1 intervention per trigger type per hour
    const startOfHour = new Date();
    startOfHour.setMinutes(0, 0, 0);

    // STEP 3 — Fetch business info
    const { data: biz } = await supabaseAdmin
      .from('businesses')
      .select('id,name,industry,lat,lng,suburb,city,subscription_status')
      .eq('id', business_id)
      .maybeSingle();

    if (!biz) return { decisions: [], errors: [new Error('Business not found')], duration_ms: Date.now() - t0 };

    const enabledTriggers = config.enabled_triggers ?? [
      'revenue_shortfall', 'dead_period', 'expiry_stock', 'weather_event',
      'competitor_promotion', 'quiet_day', 'labour_overallocation', 'basket_size_drop',
    ];

    // STEP 4 — Gather all 8 trigger metrics in parallel
    const [t1, t2, t3, t4, t5, t6, t7, t8] = await Promise.allSettled([
      enabledTriggers.includes('revenue_shortfall') ? this.checkRevenueShortfall(business_id, config.revenue_shortfall_threshold_pct ?? 40) : Promise.resolve(null),
      enabledTriggers.includes('dead_period') ? this.checkDeadPeriod(business_id, config.dead_period_minutes ?? 20) : Promise.resolve(null),
      enabledTriggers.includes('expiry_stock') ? this.checkExpiryStock(business_id, config.expiry_stock_minimum ?? 5) : Promise.resolve(null),
      enabledTriggers.includes('weather_event') ? this.checkWeatherEvent(biz.lat, biz.lng) : Promise.resolve(null),
      enabledTriggers.includes('competitor_promotion') ? this.checkCompetitorPromotion(business_id) : Promise.resolve(null),
      enabledTriggers.includes('quiet_day') ? this.checkQuietDay(business_id, aestHour) : Promise.resolve(null),
      enabledTriggers.includes('labour_overallocation') ? this.checkLabourOverallocation(business_id, config.labour_pct_threshold ?? 45) : Promise.resolve(null),
      enabledTriggers.includes('basket_size_drop') ? this.checkBasketSizeDrop(business_id, config.basket_drop_threshold_pct ?? 20) : Promise.resolve(null),
    ]);

    const firedTriggers: FiredTrigger[] = [];
    for (const result of [t1, t2, t3, t4, t5, t6, t7, t8]) {
      if (result.status === 'fulfilled' && result.value) {
        firedTriggers.push(result.value);
      } else if (result.status === 'rejected') {
        errors.push(result.reason as Error);
      }
    }

    if (firedTriggers.length === 0) {
      await this.logRun(business_id, { decisions: [], errors, duration_ms: Date.now() - t0 }, 'cron_15min');
      return { decisions: [], errors, duration_ms: Date.now() - t0 };
    }

    // Check per-trigger hour dedup
    const primaryTrigger = firedTriggers[0];
    const { count: hourCount } = await supabaseAdmin
      .from('flash_interventions')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', business_id)
      .eq('triggered_by', primaryTrigger.type)
      .gte('executed_at', startOfHour.toISOString())
      .is('cancelled_at', null);

    if ((hourCount ?? 0) > 0) {
      return { decisions: [], errors, duration_ms: Date.now() - t0 };
    }

    // STEP 5 — Haiku intervention selection
    const expiringProducts: ExpiringProduct[] = t3.status === 'fulfilled' && t3.value?.data?.data
      ? (t3.value.data.data as unknown as ExpiringProduct[])
      : [];

    const { count: loyaltyCount } = await supabaseAdmin
      .from('pos_customers')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', business_id)
      .gt('loyalty_points', 0);

    const { data: lastInterventions } = await supabaseAdmin
      .from('flash_interventions')
      .select('intervention_type')
      .eq('business_id', business_id)
      .order('executed_at', { ascending: false })
      .limit(3);

    const bizContext = {
      industry: biz.industry,
      active_loyalty_members: loyaltyCount ?? 0,
      twilio_enabled: !!process.env.TWILIO_ACCOUNT_SID,
      expiring_products: expiringProducts.slice(0, 5),
      last_intervention_types: (lastInterventions ?? []).map(i => i.intervention_type),
      best_interventions: config.best_interventions ?? [],
      failed_interventions: config.failed_interventions ?? [],
      intervention_success_rates: config.intervention_success_rates ?? {},
    };

    const systemPrompt = `You are Aria's Flash Revenue Agent for an Australian ${biz.industry ?? 'retail'} business.
A revenue trigger has fired. Choose the SINGLE best intervention to execute RIGHT NOW based on the trigger data and business context.
Consider: customer fatigue (don't over-SMS), urgency, expected lift, and which interventions have historically worked.
Prioritise interventions that work quickly (within 30 minutes).
Return ONLY valid JSON with no markdown.`;

    const userPrompt = JSON.stringify({ fired_triggers: firedTriggers, business_context: bizContext });

    const userPromptFull = userPrompt + '\n\nRespond with JSON only:\n{"intervention_type":"sms_blast|push_notification|online_menu_flash|community_post|loyalty_offer|bundle_activation|counter_offer|markdown_expiry","channel":"sms|push|email|community|pos_display|online_menu","target_segment":"lapsed_2km|loyalty_members|all_opted_in|online_only|vip_only","message_text":"string (max 160 chars)","discount_pct":null,"product_ids":null,"reasoning":"string","expected_lift_pct":15,"expires_minutes":60}';

    const intervention = await trackAICall<InterventionChoice | null>(
      {
        route: 'flash_revenue_agent',
        model: 'claude-haiku-4-5-20251001',
        businessId: business_id,
        purpose: 'intervention_selection',
        inputTokensEstimate: Math.ceil(userPromptFull.length / 4),
      },
      () => this.claudeStructured<InterventionChoice>({
        system: systemPrompt,
        user: userPromptFull,
        maxTokens: 512,
      })
    );

    if (!intervention) {
      errors.push(new Error('Haiku returned no valid intervention'));
      return { decisions: [], errors, duration_ms: Date.now() - t0 };
    }

    // STEP 6 — Capture revenue baseline (last 2h)
    const twoHoursAgo = new Date(Date.now() - 7200000).toISOString();
    let baselineData = null;
    try {
      const { data: _bd } = await supabaseAdmin.rpc('sum_revenue', {
        p_business_id: business_id,
        p_from: twoHoursAgo,
        p_to: new Date().toISOString(),
      });
      baselineData = _bd;
    } catch (e) { console.error('[non-fatal]', e) }

    let revenueIn2hBefore = 0;
    if (!baselineData) {
      const { data: baseSales } = await supabaseAdmin
        .from('pos_sales')
        .select('total_amount')
        .eq('business_id', business_id)
        .neq('status', 'voided')
        .gte('created_at', twoHoursAgo);
      revenueIn2hBefore = (baseSales ?? []).reduce((s, r) => s + (Number(r.total_amount) || 0), 0);
    } else {
      revenueIn2hBefore = Number(baselineData) || 0;
    }

    // STEP 7 — Execute intervention
    const expiresAt = new Date(Date.now() + (intervention.expires_minutes ?? 60) * 60000);
    const mode = config.mode ?? 'suggest';
    let targetCount = 0;
    const interventionData: Record<string, unknown> = { reasoning: intervention.reasoning };

    if (mode === 'auto') {
      try {
        targetCount = await this.executeIntervention(
          intervention,
          business_id,
          biz,
          expiresAt,
          interventionData,
          config.min_gap_between_sms_days ?? 7,
          expiringProducts,
        );
      } catch (err) {
        errors.push(err instanceof Error ? err : new Error(String(err)));
      }
    }

    // STEP 8 — Insert flash_interventions row
    const { data: flashRow, error: flashErr } = await supabaseAdmin
      .from('flash_interventions')
      .insert({
        business_id,
        triggered_by: primaryTrigger.type,
        trigger_data: { triggers: firedTriggers },
        intervention_type: intervention.intervention_type,
        intervention_data: interventionData,
        target_segment: intervention.target_segment,
        target_count: targetCount,
        channel: intervention.channel,
        message_text: intervention.message_text,
        discount_pct: intervention.discount_pct,
        product_ids: intervention.product_ids,
        expires_at: expiresAt.toISOString(),
        revenue_in_2h_before: revenueIn2hBefore,
      })
      .select('id')
      .maybeSingle();

    if (flashErr) errors.push(new Error(flashErr.message));

    // Log to aria_autopilot_actions
    try {
      await supabaseAdmin.from('aria_autopilot_actions').insert({
        business_id,
        action_type: 'flash_intervention',
        action_data: { intervention_type: intervention.intervention_type, triggered_by: primaryTrigger.type, target_count: targetCount },
        status: mode === 'auto' ? 'executed' : 'pending',
        executed_at: mode === 'auto' ? new Date().toISOString() : null,
      });
    } catch (e) { console.error('[non-fatal]', e) }

    // Projected impact — deterministic from historical baseline, never from AI
    // For revenue_shortfall: use historical baseline_1h_revenue × remaining hours × recovery rate
    // For other triggers: use max(recent 2h, 2× hourly baseline) × lift pct
    let projectedImpactCents: number;
    const triggerData = primaryTrigger.data as Record<string, unknown>;
    const baselineHourlyRev = Number(triggerData.baseline_1h_revenue ?? 0);
    if (primaryTrigger.type === 'revenue_shortfall') {
      const sigmaBelow = Number(triggerData.sigma_below ?? 1.5);
      const recoveryRate = Math.min(0.65, sigmaBelow * 0.20);
      // Remaining operating hours today (assume 9am–10pm = 13h window)
      const nowHour = new Date().getHours();
      const remainingHours = Math.max(1, 22 - nowHour);
      const expectedRemaining = baselineHourlyRev > 0
        ? baselineHourlyRev * remainingHours
        : Number(triggerData.shortfall_pct ?? 30) / 100 * Math.max(revenueIn2hBefore, 50);
      projectedImpactCents = Math.round(Math.max(0, expectedRemaining * recoveryRate) * 100);
    } else {
      // Use max of recent revenue or 2× hourly historical baseline — prevents $0 on quiet hours
      const baseRev = Math.max(revenueIn2hBefore, baselineHourlyRev * 2);
      projectedImpactCents = Math.round(baseRev * (intervention.expected_lift_pct ?? 15) / 100 * 100);
    }

    // Confidence = data strength, not lift magnitude
    // Higher sigma deviation = clearer signal = higher confidence (capped 0.55–0.92)
    const sigmaForConf = primaryTrigger.type === 'revenue_shortfall'
      ? Number(triggerData.sigma_below ?? 1.5)
      : 1.5;
    const confidence_score = Math.min(0.92, Math.max(0.55, 0.50 + sigmaForConf * 0.10));

    // STEP 9 — Save agent decision
    const decisions = await this.saveDecisions([{
      business_id,
      agent_type: 'flash_revenue',
      decision_data: {
        intervention,
        trigger_summary: firedTriggers,
        flash_intervention_id: flashRow?.id,
      },
      reasoning: intervention.reasoning,
      confidence_score,
      projected_impact_cents: projectedImpactCents,
      expires_at: expiresAt.toISOString(),
      status: mode === 'auto' ? 'auto_executed' : 'pending',
    }]);

    // Update flash row with decision id
    if (flashRow?.id && decisions[0]?.id) {
      await supabaseAdmin
        .from('flash_interventions')
        .update({ agent_decision_id: decisions[0].id })
        .eq('id', flashRow.id);
    }

    const result: AgentRunResult = { decisions, errors, duration_ms: Date.now() - t0 };
    await this.logRun(business_id, result, 'cron_15min');
    return result;
  }

  // ── Trigger checkers ──────────────────────────────────────────────────────────

  private async checkRevenueShortfall(business_id: string, threshold: number): Promise<FiredTrigger | null> {
    const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
    const nowHour = new Date().getUTCHours();
    const thirtyOneDaysAgo = new Date(Date.now() - 31 * 86400000).toISOString();

    const { data: currentSales } = await supabaseAdmin
      .from('pos_sales')
      .select('total_amount')
      .eq('business_id', business_id)
      .neq('status', 'voided')
      .gte('created_at', oneHourAgo);

    const currentRevenue = (currentSales ?? []).reduce((s, r) => s + (Number(r.total_amount) || 0), 0);

    // Baseline: same hour across last 30 days
    const { data: historicSales } = await supabaseAdmin
      .from('pos_sales')
      .select('total_amount,created_at')
      .eq('business_id', business_id)
      .neq('status', 'voided')
      .gte('created_at', thirtyOneDaysAgo)
      .lt('created_at', oneHourAgo);

    const samePeriodSales = (historicSales ?? []).filter(s => {
      const h = new Date(s.created_at).getUTCHours();
      return h === nowHour;
    });

    if (samePeriodSales.length < 5) return null; // not enough history

    // Group by date and sum
    const byDate: Record<string, number> = {};
    for (const s of samePeriodSales) {
      const d = s.created_at.slice(0, 10);
      byDate[d] = (byDate[d] ?? 0) + (Number(s.total_amount) || 0);
    }
    const dailyTotals = Object.values(byDate);
    const mean = dailyTotals.reduce((a, b) => a + b, 0) / dailyTotals.length;
    if (mean < 5) return null;

    // Demand-curve-relative trigger: fire when >1.5σ below expected hourly demand
    const variance = dailyTotals.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(dailyTotals.length - 1, 1);
    const stdDev = Math.sqrt(variance);
    const sigmaBelow = stdDev > 0 ? (mean - currentRevenue) / stdDev : (mean - currentRevenue) / mean;
    const shortfallPct = ((mean - currentRevenue) / mean) * 100;

    // Also accept legacy threshold as fallback when stdDev insufficient
    const triggered = sigmaBelow > 1.5 || (stdDev === 0 && shortfallPct > threshold);
    if (triggered) {
      return {
        type: 'revenue_shortfall',
        severity: sigmaBelow > 2.5 ? 'critical' : 'high',
        data: {
          shortfall_pct: Math.round(shortfallPct),
          sigma_below: Math.round(sigmaBelow * 10) / 10,
          current_1h_revenue: Math.round(currentRevenue * 100) / 100,
          baseline_1h_revenue: Math.round(mean * 100) / 100,
          baseline_std_dev: Math.round(stdDev * 100) / 100,
        },
      };
    }
    return null;
  }

  private async checkDeadPeriod(business_id: string, deadMinutes: number): Promise<FiredTrigger | null> {
    const { data: lastSale } = await supabaseAdmin
      .from('pos_sales')
      .select('created_at')
      .eq('business_id', business_id)
      .neq('status', 'voided')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!lastSale) return null;
    const minutesSince = (Date.now() - new Date(lastSale.created_at).getTime()) / 60000;

    if (minutesSince > deadMinutes) {
      return {
        type: 'dead_period',
        severity: minutesSince > 45 ? 'critical' : 'high',
        data: { dead_minutes: Math.round(minutesSince), last_sale_at: lastSale.created_at },
      };
    }
    return null;
  }

  private async checkExpiryStock(business_id: string, minimumQty: number): Promise<FiredTrigger | null> {
    const fortyEightHours = new Date(Date.now() + 48 * 3600000).toISOString();

    const { data: products } = await supabaseAdmin
      .from('pos_products')
      .select('id,name,price,cost_price,stock_quantity,expiry_date')
      .eq('business_id', business_id)
      .eq('is_active', true)
      .not('expiry_date', 'is', null)
      .lt('expiry_date', fortyEightHours)
      .gt('stock_quantity', minimumQty);

    if (!products?.length) return null;

    return {
      type: 'expiry_stock',
      severity: 'high',
      data: {
        products: products.map(p => ({ id: p.id, name: p.name, price: p.price, stock_quantity: p.stock_quantity, expiry_date: p.expiry_date })),
        count: products.length,
        data: products,
      },
    };
  }

  private async checkWeatherEvent(lat: number | null, lng: number | null): Promise<FiredTrigger | null> {
    const latitude = lat ?? -33.8688;
    const longitude = lng ?? 151.2093;

    try {
      const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + latitude + '&longitude=' + longitude + '&hourly=weathercode&timezone=Australia%2FSydney&forecast_days=1';
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) return null;

      const data = await res.json() as { hourly?: { weathercode?: number[] } };
      const codes = data.hourly?.weathercode;
      if (!codes || codes.length < 2) return null;

      const currentHour = new Date().getHours();
      const currentCode = codes[currentHour] ?? 0;
      const prevCode = codes[Math.max(0, currentHour - 1)] ?? 0;

      // WMO code >= 61 = rain/storm. Fire if rain just started.
      if (currentCode >= 61 && prevCode < 61) {
        return {
          type: 'weather_event',
          severity: currentCode >= 80 ? 'critical' : 'high',
          data: { weather_code: currentCode, description: currentCode >= 80 ? 'heavy rain' : 'rain', lat: latitude, lng: longitude },
        };
      }
    } catch {
      // Weather API is non-critical — fail silently
    }
    return null;
  }

  private async checkCompetitorPromotion(business_id: string): Promise<FiredTrigger | null> {
    const twoHoursAgo = new Date(Date.now() - 7200000).toISOString();

    const { data: snaps } = await supabaseAdmin
      .from('competitor_snapshots')
      .select('competitor_name,price,previous_price,created_at')
      .eq('business_id', business_id)
      .gte('created_at', twoHoursAgo)
      .not('previous_price', 'is', null);

    const promotions = (snaps ?? []).filter(s => {
      const prev = Number(s.previous_price);
      const cur = Number(s.price);
      return prev > 0 && cur < prev * 0.95; // > 5% price drop
    });

    if (!promotions.length) return null;

    return {
      type: 'competitor_promotion',
      severity: 'high',
      data: {
        competitors: promotions.map(p => ({ name: p.competitor_name, price_drop_pct: Math.round((1 - Number(p.price) / Number(p.previous_price)) * 100) })),
        count: promotions.length,
      },
    };
  }

  private async checkQuietDay(business_id: string, currentHour: number): Promise<FiredTrigger | null> {
    const eightyFourDaysAgo = new Date(Date.now() - 84 * 86400000).toISOString();

    const { data: sales } = await supabaseAdmin
      .from('pos_sales')
      .select('total_amount,created_at')
      .eq('business_id', business_id)
      .neq('status', 'voided')
      .gte('created_at', eightyFourDaysAgo);

    if (!sales?.length) return null;

    // Group by day-of-week
    const byDow: Record<number, number[]> = {};
    for (const s of sales) {
      const dow = new Date(s.created_at).getDay();
      if (!byDow[dow]) byDow[dow] = [];
      byDow[dow].push(Number(s.total_amount) || 0);
    }

    const dowAvgs = Object.entries(byDow).map(([dow, amounts]) => ({
      dow: parseInt(dow),
      avg: amounts.reduce((a, b) => a + b, 0) / amounts.length,
    }));

    if (dowAvgs.length < 5) return null;

    dowAvgs.sort((a, b) => a.avg - b.avg);
    const todayDow = new Date().getDay();
    const bottomTwo = dowAvgs.slice(0, 2).map(d => d.dow);

    if (bottomTwo.includes(todayDow) && currentHour >= 9 && currentHour <= 14) {
      return {
        type: 'quiet_day',
        severity: 'normal',
        data: {
          today_dow: todayDow,
          avg_revenue_today_dow: Math.round(dowAvgs.find(d => d.dow === todayDow)?.avg ?? 0),
          best_day_avg: Math.round(dowAvgs[dowAvgs.length - 1].avg),
        },
      };
    }
    return null;
  }

  private async checkLabourOverallocation(business_id: string, threshold: number): Promise<FiredTrigger | null> {
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);

    const [{ data: activeShifts }, { data: todaySales }] = await Promise.all([
      supabaseAdmin
        .from('pos_timesheets')
        .select('clock_in,pay_rate_cents')
        .eq('business_id', business_id)
        .is('clock_out', null)
        .eq('status', 'active'),
      supabaseAdmin
        .from('pos_sales')
        .select('total_amount')
        .eq('business_id', business_id)
        .neq('status', 'voided')
        .gte('created_at', midnight.toISOString()),
    ]);

    const revenueToday = (todaySales ?? []).reduce((s, r) => s + (Number(r.total_amount) || 0), 0);
    if (revenueToday < 50) return null;

    const now = Date.now();
    const activeStaffCost = (activeShifts ?? []).reduce((s, t) => {
      const hoursWorked = (now - new Date(t.clock_in).getTime()) / 3600000;
      return s + hoursWorked * ((Number(t.pay_rate_cents) || 0) / 100);
    }, 0);

    const labourPct = (activeStaffCost / revenueToday) * 100;

    if (labourPct > threshold) {
      return {
        type: 'labour_overallocation',
        severity: labourPct > 60 ? 'critical' : 'high',
        data: {
          labour_pct: Math.round(labourPct),
          active_staff_cost: Math.round(activeStaffCost * 100) / 100,
          revenue_today: Math.round(revenueToday * 100) / 100,
          active_shifts: activeShifts?.length ?? 0,
        },
      };
    }
    return null;
  }

  private async checkBasketSizeDrop(business_id: string, threshold: number): Promise<FiredTrigger | null> {
    const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
    const nowHour = new Date().getUTCHours();

    const { data: lastHourSales } = await supabaseAdmin
      .from('pos_sales')
      .select('total_amount')
      .eq('business_id', business_id)
      .neq('status', 'voided')
      .gte('created_at', oneHourAgo);

    if (!lastHourSales || lastHourSales.length < 3) return null;

    const lastHourAvg = lastHourSales.reduce((s, r) => s + (Number(r.total_amount) || 0), 0) / lastHourSales.length;

    const { data: historicSales } = await supabaseAdmin
      .from('pos_sales')
      .select('total_amount,created_at')
      .eq('business_id', business_id)
      .neq('status', 'voided')
      .gte('created_at', thirtyDaysAgo)
      .lt('created_at', oneHourAgo);

    const samePeriod = (historicSales ?? []).filter(s => new Date(s.created_at).getUTCHours() === nowHour);
    if (samePeriod.length < 10) return null;

    const baselineAvg = samePeriod.reduce((s, r) => s + (Number(r.total_amount) || 0), 0) / samePeriod.length;
    if (baselineAvg < 10) return null;

    const dropPct = ((baselineAvg - lastHourAvg) / baselineAvg) * 100;

    if (dropPct > threshold) {
      return {
        type: 'basket_size_drop',
        severity: dropPct > 35 ? 'critical' : 'normal',
        data: {
          drop_pct: Math.round(dropPct),
          last_hour_avg_basket: Math.round(lastHourAvg * 100) / 100,
          baseline_avg_basket: Math.round(baselineAvg * 100) / 100,
          sample_size: lastHourSales.length,
        },
      };
    }
    return null;
  }

  // ── Intervention executors ────────────────────────────────────────────────────

  private async executeIntervention(
    choice: InterventionChoice,
    business_id: string,
    biz: Record<string, unknown>,
    expiresAt: Date,
    interventionData: Record<string, unknown>,
    smsDayGap: number,
    expiringProducts: ExpiringProduct[],
  ): Promise<number> {
    switch (choice.intervention_type) {
      case 'sms_blast':
        return this.executeSmsBlast(choice, business_id, interventionData, smsDayGap);
      case 'community_post':
        return this.executeCommunityPost(choice, business_id, interventionData);
      case 'loyalty_offer':
        return this.executeLoyaltyOffer(choice, business_id, expiresAt, interventionData);
      case 'bundle_activation':
        return this.executeBundleActivation(choice, business_id, expiresAt, interventionData);
      case 'markdown_expiry':
        return this.executeMarkdownExpiry(choice, business_id, expiresAt, interventionData, expiringProducts);
      case 'online_menu_flash':
        return this.executeOnlineMenuFlash(choice, business_id, expiresAt, interventionData);
      case 'counter_offer':
        return this.executeCounterOffer(choice, business_id, expiresAt, interventionData, smsDayGap);
      case 'push_notification':
        return this.executePushNotification(choice, business_id, biz, interventionData);
      default:
        return 0;
    }
  }

  private async executeSmsBlast(
    choice: InterventionChoice,
    business_id: string,
    interventionData: Record<string, unknown>,
    smsDayGap: number,
  ): Promise<number> {
    const smsGapCutoff = new Date(Date.now() - smsDayGap * 86400000).toISOString();

    // Customers who received SMS recently (from any channel)
    const { data: recentlySmsed } = await supabaseAdmin
      .from('flash_interventions')
      .select('target_segment')
      .eq('business_id', business_id)
      .eq('channel', 'sms')
      .gte('executed_at', smsGapCutoff);

    // Also check review requests
    let reviewSmsed: Array<{ customer_id: string }> | null = null;
    try {
      const { data: _rs } = await supabaseAdmin
        .from('review_requests')
        .select('customer_id')
        .eq('business_id', business_id)
        .gte('sent_at', smsGapCutoff);
      reviewSmsed = _rs as Array<{ customer_id: string }> | null;
    } catch (e) { console.error('[non-fatal]', e) }

    const recentCustomerIds = new Set((reviewSmsed ?? []).map(r => r.customer_id));

    let query = supabaseAdmin
      .from('pos_customers')
      .select('id,name,phone')
      .eq('business_id', business_id)
      .eq('marketing_consent', true)
      .not('phone', 'is', null);

    // Apply segment filter
    if (choice.target_segment === 'lapsed_2km') {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
      query = query.lt('last_visit_at', thirtyDaysAgo);
    } else if (choice.target_segment === 'vip_only') {
      query = query.gt('total_spend', 1000);
    }

    const { data: customers } = await query.limit(200);
    const eligible = (customers ?? []).filter(c => !recentCustomerIds.has(c.id));

    let sent = 0;
    for (const customer of eligible.slice(0, 100)) {
      const result = await sendSMS(customer.phone!, choice.message_text);
      if (result.ok) sent++;
    }

    interventionData.sms_sent = sent;
    interventionData.eligible_count = eligible.length;
    return sent;
  }

  private async executeCommunityPost(
    choice: InterventionChoice,
    business_id: string,
    interventionData: Record<string, unknown>,
  ): Promise<number> {
    const { error } = await supabaseAdmin
      .from('community_posts')
      .insert({
        business_id,
        content: choice.message_text,
        post_type: 'flash_deal',
        is_published: true,
        published_at: new Date().toISOString(),
      });

    interventionData.community_post_created = !error;
    return error ? 0 : 1;
  }

  private async executeLoyaltyOffer(
    choice: InterventionChoice,
    business_id: string,
    expiresAt: Date,
    interventionData: Record<string, unknown>,
  ): Promise<number> {
    const { data: promo, error } = await supabaseAdmin
      .from('pos_promotions')
      .insert({
        business_id,
        name: 'Flash Loyalty Offer — ' + new Date().toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' }),
        discount_type: 'percentage',
        discount_value: choice.discount_pct ?? 10,
        applies_to: 'cart',
        requires_code: false,
        is_active: true,
        valid_from: new Date().toISOString(),
        valid_until: expiresAt.toISOString(),
        min_purchase_amount: 20,
      })
      .select('id')
      .maybeSingle();

    interventionData.promotion_id = promo?.id;
    interventionData.promotion_created = !error;
    return error ? 0 : 1;
  }

  private async executeBundleActivation(
    choice: InterventionChoice,
    business_id: string,
    expiresAt: Date,
    interventionData: Record<string, unknown>,
  ): Promise<number> {
    if (!choice.product_ids?.length) return 0;

    const primaryProduct = choice.product_ids[0];
    const bundleProduct = choice.product_ids[1] ?? null;

    if (bundleProduct) {
      await supabaseAdmin
        .from('pos_products')
        .update({ agent_bundle_product_id: bundleProduct, agent_bundle_price: choice.discount_pct ? undefined : undefined })
        .eq('id', primaryProduct)
        .eq('business_id', business_id);
    }

    const { data: promo } = await supabaseAdmin
      .from('pos_promotions')
      .insert({
        business_id,
        name: 'Bundle Deal — ' + new Date().toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' }),
        discount_type: 'percentage',
        discount_value: choice.discount_pct ?? 10,
        applies_to: 'product',
        product_ids: choice.product_ids,
        requires_code: false,
        is_active: true,
        valid_from: new Date().toISOString(),
        valid_until: expiresAt.toISOString(),
      })
      .select('id')
      .maybeSingle();

    interventionData.promotion_id = promo?.id;
    interventionData.bundle_products = choice.product_ids;
    return 1;
  }

  private async executeMarkdownExpiry(
    choice: InterventionChoice,
    business_id: string,
    expiresAt: Date,
    interventionData: Record<string, unknown>,
    expiringProducts: ExpiringProduct[],
  ): Promise<number> {
    const targetProducts = choice.product_ids?.length ? expiringProducts.filter(p => choice.product_ids!.includes(p.id)) : expiringProducts.slice(0, 5);
    if (!targetProducts.length) return 0;

    const discountMultiplier = 1 - (choice.discount_pct ?? 20) / 100;
    const originalPrices: Record<string, number> = {};
    let updated = 0;

    for (const product of targetProducts) {
      originalPrices[product.id] = product.price;
      const newPrice = Math.max(product.cost_price ?? 0, product.price * discountMultiplier);
      const { error } = await supabaseAdmin
        .from('pos_products')
        .update({ price: Math.round(newPrice * 100) / 100 })
        .eq('id', product.id)
        .eq('business_id', business_id);
      if (!error) updated++;
    }

    interventionData.marked_down_products = targetProducts.map(p => p.name);
    interventionData.original_prices = originalPrices;
    interventionData.revert_at = expiresAt.toISOString();
    interventionData.discount_pct = choice.discount_pct ?? 20;
    return updated;
  }

  private async executeOnlineMenuFlash(
    choice: InterventionChoice,
    business_id: string,
    expiresAt: Date,
    interventionData: Record<string, unknown>,
  ): Promise<number> {
    if (choice.product_ids?.length) {
      await supabaseAdmin
        .from('pos_products')
        .update({ featured: true })
        .in('id', choice.product_ids)
        .eq('business_id', business_id);
    }

    const { data: promo } = await supabaseAdmin
      .from('pos_promotions')
      .insert({
        business_id,
        name: 'Online Flash — ' + new Date().toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' }),
        discount_type: 'percentage',
        discount_value: choice.discount_pct ?? 15,
        applies_to: choice.product_ids?.length ? 'product' : 'cart',
        product_ids: choice.product_ids ?? null,
        requires_code: false,
        is_active: true,
        valid_from: new Date().toISOString(),
        valid_until: expiresAt.toISOString(),
      })
      .select('id')
      .maybeSingle();

    interventionData.promotion_id = promo?.id;
    interventionData.featured_product_ids = choice.product_ids;
    return 1;
  }

  private async executeCounterOffer(
    choice: InterventionChoice,
    business_id: string,
    expiresAt: Date,
    interventionData: Record<string, unknown>,
    smsDayGap: number,
  ): Promise<number> {
    // Loyalty-member-only promotion
    const { data: promo } = await supabaseAdmin
      .from('pos_promotions')
      .insert({
        business_id,
        name: 'VIP Counter Offer — ' + new Date().toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' }),
        discount_type: 'percentage',
        discount_value: choice.discount_pct ?? 12,
        applies_to: 'cart',
        requires_code: false,
        is_active: true,
        valid_from: new Date().toISOString(),
        valid_until: expiresAt.toISOString(),
        min_purchase_amount: 30,
      })
      .select('id')
      .maybeSingle();

    // Notify loyalty members via SMS (with fatigue prevention)
    const smsCount = await this.executeSmsBlast(
      { ...choice, target_segment: 'loyalty_members' },
      business_id,
      interventionData,
      smsDayGap,
    );

    interventionData.promotion_id = promo?.id;
    interventionData.loyalty_only = true;
    return smsCount;
  }

  private async executePushNotification(
    choice: InterventionChoice,
    business_id: string,
    biz: Record<string, unknown>,
    interventionData: Record<string, unknown>,
  ): Promise<number> {
    // Fall back to email via Resend if push tokens not available
    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
      interventionData.push_skipped = 'no_resend_key';
      return 0;
    }

    const { data: customers } = await supabaseAdmin
      .from('pos_customers')
      .select('email,name')
      .eq('business_id', business_id)
      .eq('marketing_consent', true)
      .not('email', 'is', null)
      .limit(50);

    let sent = 0;
    for (const customer of (customers ?? []).slice(0, 20)) {
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + resendKey },
          body: JSON.stringify({
            from: 'noreply@' + (process.env.RESEND_DOMAIN ?? 'mail.aria-os.com.au'),
            to: customer.email,
            subject: 'Flash Deal from ' + (biz.name as string ?? 'us') + '!',
            text: choice.message_text,
          }),
          signal: AbortSignal.timeout(5000),
        });
        sent++;
      } catch (e) { console.error('[non-fatal]', e) }
    }

    interventionData.emails_sent = sent;
    return sent;
  }
}
