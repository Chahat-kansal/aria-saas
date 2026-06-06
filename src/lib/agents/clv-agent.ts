import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendSMS } from '@/lib/clicksend';
import { trackAICall } from '@/lib/aria/ai-telemetry';
import { BaseAgent } from './base-agent';
import type { AgentType, AgentRunResult, AgentDecisionInput } from './types';

// BG/NBD model (Fader, Hardie, Lee 2005) with fixed retail priors:
// r=0.5, alpha=10 (Gamma-Poisson purchase rate); a=0.8, b=2.5 (Beta-Geometric churn)
function bgNbd(
  x: number,            // transactions in observation window T
  T: number,            // observation window in days
  daysSinceLast: number // days since most recent transaction
): { pAlive: number; expectedPurchases90d: number; expectedNextOrderDays: number } {
  const r = 0.5, alpha = 10.0, a = 0.8, b = 2.5;
  if (x === 0 || T <= 0) {
    return { pAlive: Math.round(b / (a + b) * 1000) / 1000, expectedPurchases90d: 0, expectedNextOrderDays: 60 };
  }
  // Gamma-Poisson posterior mean purchase rate (per day)
  const lambdaPost = (r + x) / (alpha + T);
  // Beta-Geometric: P(survived x churn opportunities)
  const pSurvived = (b + x - 1) / (a + b + x - 1);
  // Bayes P(alive | daysSinceLast silence): P(gap|alive)×P(alive) / normalizer
  const pNoGap = Math.exp(-lambdaPost * daysSinceLast);
  const pAliveNum = pNoGap * pSurvived;
  const pAlive = Math.max(0.01, Math.min(0.99, pAliveNum / (pAliveNum + (1 - pSurvived))));
  const expectedPurchases90d = pAlive * lambdaPost * 90;
  const expectedNextOrderDays = pAlive > 0.1 ? Math.round(1 / lambdaPost) : 365;
  return {
    pAlive: Math.round(pAlive * 1000) / 1000,
    expectedPurchases90d: Math.round(expectedPurchases90d * 10) / 10,
    expectedNextOrderDays,
  };
}

// Gamma-Gamma monetary model (Fader & Hardie 2013) — expected spend per transaction
// given x transactions with sample mean zbar. Parameters p=6.25, q=3.74, gamma=15.44 (literature values)
function gammaGammaExpectedSpend(avgBasket: number, x: number): number {
  const p = 6.25, q = 3.74, gg = 15.44;
  if (x <= 0 || avgBasket <= 0) return avgBasket;
  return (p * gg + x * avgBasket) / (p * q + x);
}

interface PurchaseRecord {
  sale_id: string;
  created_at: string;
  total_amount: number;
  product_ids: string[];
  has_discount: boolean;
}

interface CustomerFeatures {
  customer_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  marketing_consent: boolean;
  most_purchased_product_name: string | null;
  first_purchase_at: string;
  avg_basket_size: number;
  visit_frequency_per_month: number;
  months_as_customer: number;
  product_diversity_score: number;
  price_sensitivity_score: number;
  seasonal_consistency_score: number;
  visit_trend: 'accelerating' | 'stable' | 'decelerating' | 'dormant';
  spend_trend: 'growing' | 'stable' | 'declining';
  days_since_last_visit: number;
  p_alive: number;
  expected_purchases_next_90d: number;
  expected_next_order_date: string | null;
  predicted_monthly_revenue: number;
  predicted_annual_revenue: number;
  predicted_3yr_clv: number;
  churn_probability: number;
  clv_tier: 'champion' | 'loyal' | 'potential' | 'at_risk' | 'dormant' | 'lost';
  intervention_priority: 'urgent' | 'high' | 'medium' | 'low' | 'none';
  recommended_offer_type: 'percentage_discount' | 'free_item' | 'points_bonus' | 'exclusive_access' | 'vip_upgrade' | 'none';
  recommended_offer_value: number | null;
  intervention_rationale: string;
  recommended_message: string | null;
}

interface BatchMessageResponse {
  messages: Array<{ customer_id: string; message: string }>;
}

export class CLVAgent extends BaseAgent {
  type: AgentType = 'clv';

  async run(business_id: string): Promise<AgentRunResult> {
    const t0 = Date.now();
    const errors: Error[] = [];

    const settings = await this.getSettings(business_id);
    if (!settings.enabled) return { decisions: [], errors: [], duration_ms: 0 };

    const config = settings.config as {
      mode?: string;
      min_purchases_for_scoring?: number;
      sms_gap_days?: number;
    };
    const mode = config.mode ?? 'suggest';
    const minPurchases = config.min_purchases_for_scoring ?? 2;
    const smsGapDays = config.sms_gap_days ?? 7;

    // ── STEP 1: Fetch all data in parallel ──────────────────────────────────────
    const twelveMonthsAgo = new Date(Date.now() - 365 * 86400000).toISOString();
    const twentyFourMonthsAgo = new Date(Date.now() - 730 * 86400000).toISOString();

    const [
      { data: customers },
      { data: allSales },
      { data: allSaleItems },
      { data: activePromos },
      { data: productRows },
    ] = await Promise.all([
      supabaseAdmin
        .from('pos_customers')
        .select('id,name,email,phone,marketing_consent,last_visit,created_at')
        .eq('business_id', business_id)
        .is('deleted_at', null),
      supabaseAdmin
        .from('pos_sales')
        .select('id,customer_id,created_at,total_amount')
        .eq('business_id', business_id)
        .neq('status', 'voided')
        .gte('created_at', twentyFourMonthsAgo)
        .not('customer_id', 'is', null),
      supabaseAdmin
        .from('pos_sale_items')
        .select('sale_id,product_id,discount_percent')
        .in(
          'sale_id',
          // placeholder — replaced below after we have sale IDs
          ['00000000-0000-0000-0000-000000000000']
        ),
      supabaseAdmin
        .from('pos_promotions')
        .select('valid_from,valid_until')
        .eq('business_id', business_id)
        .eq('is_active', true),
      supabaseAdmin
        .from('pos_products')
        .select('id')
        .eq('business_id', business_id)
        .eq('is_active', true),
    ]);

    if (!customers?.length || !allSales) {
      return { decisions: [], errors, duration_ms: Date.now() - t0 };
    }

    // Fetch sale items properly — query by business via sale IDs
    const saleIds = (allSales ?? []).map(s => s.id);
    let saleItems: Array<{ sale_id: string; product_id: string; discount_percent: number | null }> = [];
    if (saleIds.length > 0) {
      // Batch in chunks of 500 to avoid URL length limits
      for (let i = 0; i < saleIds.length; i += 500) {
        const chunk = saleIds.slice(i, i + 500);
        const { data: chunkItems } = await supabaseAdmin
          .from('pos_sale_items')
          .select('sale_id,product_id,discount_percent')
          .in('sale_id', chunk);
        saleItems = saleItems.concat(chunkItems ?? []);
      }
    }

    // Fetch product names for most-purchased calculation
    const { data: productNameRows } = await supabaseAdmin
      .from('pos_products')
      .select('id,name')
      .eq('business_id', business_id);
    const productNames = new Map((productNameRows ?? []).map(p => [p.id, p.name]));

    const totalProductCount = (productRows ?? []).length;
    const promos = (activePromos ?? []).filter(p => p.valid_from && p.valid_until);

    // ── Build sale item lookup by sale_id ──────────────────────────────────────
    const itemsBySale = new Map<string, Array<{ product_id: string; has_discount: boolean }>>();
    for (const item of saleItems) {
      const arr = itemsBySale.get(item.sale_id) ?? [];
      arr.push({ product_id: item.product_id, has_discount: (item.discount_percent ?? 0) > 0 });
      itemsBySale.set(item.sale_id, arr);
    }

    // ── Group sales by customer ────────────────────────────────────────────────
    const salesByCustomer = new Map<string, PurchaseRecord[]>();
    for (const sale of allSales ?? []) {
      if (!sale.customer_id) continue;
      const items = itemsBySale.get(sale.id) ?? [];
      const record: PurchaseRecord = {
        sale_id: sale.id,
        created_at: sale.created_at,
        total_amount: Number(sale.total_amount) || 0,
        product_ids: items.map(i => i.product_id),
        has_discount: items.some(i => i.has_discount),
      };
      const arr = salesByCustomer.get(sale.customer_id) ?? [];
      arr.push(record);
      salesByCustomer.set(sale.customer_id, arr);
    }

    const now = Date.now();
    const fourMonthsAgo = new Date(now - 120 * 86400000).getTime();
    const eightMonthsAgo = new Date(now - 240 * 86400000).getTime();

    // ── STEP 2-5: Compute features + tier + offer per customer ─────────────────
    const scored: CustomerFeatures[] = [];
    let businessAvgBasket = 0;

    // First pass: compute raw features (without tier which needs biz avg)
    const rawFeatures: Array<CustomerFeatures & { _preScore: true }> = [];

    for (const customer of customers) {
      const purchases = salesByCustomer.get(customer.id) ?? [];
      const recentPurchases = purchases.filter(p => new Date(p.created_at).getTime() > new Date(twelveMonthsAgo).getTime());

      if (recentPurchases.length < minPurchases) continue;

      // avg_basket_size
      const avgBasket = recentPurchases.reduce((s, p) => s + p.total_amount, 0) / recentPurchases.length;

      // months_as_customer
      const firstPurchase = purchases.reduce((min, p) => p.created_at < min ? p.created_at : min, purchases[0].created_at);
      const monthsAsCustomer = Math.max(
        (now - new Date(firstPurchase).getTime()) / (30 * 86400000),
        0.1
      );

      // visit_frequency_per_month
      const visitFreq = recentPurchases.length / monthsAsCustomer;

      // product_diversity_score
      const distinctProducts = new Set(recentPurchases.flatMap(p => p.product_ids)).size;
      const diversityScore = totalProductCount > 0
        ? Math.min(distinctProducts / totalProductCount, 1.0)
        : 0;

      // most-purchased product
      const productFreq: Record<string, number> = {};
      for (const p of recentPurchases) {
        for (const pid of p.product_ids) {
          productFreq[pid] = (productFreq[pid] ?? 0) + 1;
        }
      }
      const topProductId = Object.entries(productFreq).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      const mostPurchasedProductName = topProductId ? (productNames.get(topProductId) ?? null) : null;

      // price_sensitivity_score
      const discountPurchaseRate = recentPurchases.filter(p => p.has_discount).length / recentPurchases.length;
      let promoLiftScore = 0;
      const promoMonths = promos.filter(p => p.valid_from && p.valid_until).length;
      if (promoMonths > 0 && visitFreq > 0) {
        const visitsDuringPromo = recentPurchases.filter(p => {
          const pt = new Date(p.created_at).getTime();
          return promos.some(promo => {
            const pf = new Date(promo.valid_from).getTime();
            const pv = new Date(promo.valid_until).getTime();
            return pt >= pf && pt <= pv;
          });
        }).length;
        const expectedDuringPromo = visitFreq * promoMonths;
        const promoLift = visitsDuringPromo / Math.max(expectedDuringPromo, 0.01) - 1;
        promoLiftScore = Math.min(Math.max(promoLift, 0), 1);
      }
      const priceSensitivity = (discountPurchaseRate * 0.6) + (promoLiftScore * 0.4);

      // seasonal_consistency_score
      const monthlyCounts = Array(12).fill(0);
      for (const p of recentPurchases) {
        const month = new Date(p.created_at).getMonth();
        monthlyCounts[month]++;
      }
      const monthAvg = monthlyCounts.reduce((a, b) => a + b, 0) / 12;
      const variance = monthlyCounts.reduce((sum, c) => sum + Math.pow(c - monthAvg, 2), 0) / 12;
      const stdDev = Math.sqrt(variance);
      const seasonalConsistency = monthAvg > 0 ? Math.max(1 - (stdDev / monthAvg), 0) : 0;

      // visit_trend (last 4m vs prior 4m)
      const last4m = recentPurchases.filter(p => new Date(p.created_at).getTime() > fourMonthsAgo).length;
      const prior4m = recentPurchases.filter(p => {
        const t = new Date(p.created_at).getTime();
        return t > eightMonthsAgo && t <= fourMonthsAgo;
      }).length;
      let visitTrend: 'accelerating' | 'stable' | 'decelerating' | 'dormant';
      if (last4m === 0 && prior4m === 0) visitTrend = 'dormant';
      else if (prior4m === 0) visitTrend = 'accelerating';
      else {
        const ratio = last4m / prior4m;
        visitTrend = ratio > 1.2 ? 'accelerating' : ratio < 0.8 ? 'decelerating' : 'stable';
      }

      // spend_trend
      const last4mRevenue = recentPurchases.filter(p => new Date(p.created_at).getTime() > fourMonthsAgo).reduce((s, p) => s + p.total_amount, 0);
      const prior4mRevenue = recentPurchases.filter(p => {
        const t = new Date(p.created_at).getTime();
        return t > eightMonthsAgo && t <= fourMonthsAgo;
      }).reduce((s, p) => s + p.total_amount, 0);
      let spendTrend: 'growing' | 'stable' | 'declining';
      if (prior4mRevenue === 0) spendTrend = last4mRevenue > 0 ? 'growing' : 'stable';
      else {
        const spendRatio = last4mRevenue / prior4mRevenue;
        spendTrend = spendRatio > 1.1 ? 'growing' : spendRatio < 0.9 ? 'declining' : 'stable';
      }

      // days_since_last_visit
      const lastVisitDate = customer.last_visit
        ? new Date(customer.last_visit as string)
        : (recentPurchases.length > 0 ? new Date(recentPurchases[recentPurchases.length - 1].created_at) : null);
      const daysSinceLastVisit = lastVisitDate
        ? Math.floor((now - lastVisitDate.getTime()) / 86400000)
        : 999;

      // BG/NBD + Gamma-Gamma CLV predictions
      const daysAsCustomer = Math.max(monthsAsCustomer * 30, 1);
      const bgResult = bgNbd(recentPurchases.length, daysAsCustomer, daysSinceLastVisit);
      const pAlive = bgResult.pAlive;
      const expectedPurchases90d = bgResult.expectedPurchases90d;
      const expectedNextOrderDays = bgResult.expectedNextOrderDays;
      const expectedNextOrderDate = pAlive > 0.1
        ? new Date(Date.now() + expectedNextOrderDays * 86400000).toISOString().slice(0, 10)
        : null;
      // Gamma-Gamma adjusted basket (shrinks toward population mean for sparse buyers)
      const adjustedBasket = gammaGammaExpectedSpend(avgBasket, recentPurchases.length);
      const trendAdj = spendTrend === 'growing' ? 0.10 : spendTrend === 'declining' ? -0.10 : 0;
      const predictedMonthlyRevenue = adjustedBasket * (expectedPurchases90d / 3);
      const predictedAnnualRevenue = predictedMonthlyRevenue * 12 * (1 + trendAdj);
      const churnProbability = Math.round((1 - pAlive) * 1000) / 1000;
      const predicted3yrClv = predictedAnnualRevenue * 3 * pAlive;

      businessAvgBasket += avgBasket;

      rawFeatures.push({
        _preScore: true,
        customer_id: customer.id,
        name: customer.name ?? '',
        email: customer.email ?? null,
        phone: customer.phone ?? null,
        marketing_consent: !!(customer.marketing_consent),
        most_purchased_product_name: mostPurchasedProductName,
        first_purchase_at: firstPurchase,
        avg_basket_size: Math.round(avgBasket * 100) / 100,
        visit_frequency_per_month: Math.round(visitFreq * 100) / 100,
        months_as_customer: Math.round(monthsAsCustomer * 10) / 10,
        product_diversity_score: Math.round(diversityScore * 1000) / 1000,
        price_sensitivity_score: Math.round(priceSensitivity * 1000) / 1000,
        seasonal_consistency_score: Math.round(seasonalConsistency * 1000) / 1000,
        visit_trend: visitTrend,
        spend_trend: spendTrend,
        days_since_last_visit: daysSinceLastVisit,
        p_alive: pAlive,
        expected_purchases_next_90d: expectedPurchases90d,
        expected_next_order_date: expectedNextOrderDate,
        predicted_monthly_revenue: Math.round(predictedMonthlyRevenue * 100) / 100,
        predicted_annual_revenue: Math.round(predictedAnnualRevenue * 100) / 100,
        predicted_3yr_clv: Math.round(predicted3yrClv * 100) / 100,
        churn_probability: churnProbability,
        // placeholders filled in second pass:
        clv_tier: 'loyal',
        intervention_priority: 'none',
        recommended_offer_type: 'none',
        recommended_offer_value: null,
        intervention_rationale: '',
        recommended_message: null,
      });
    }

    if (rawFeatures.length === 0) {
      // Customers exist but no qualifying sales — data quality gap
      if ((customers ?? []).length > 0) {
        const dq = await this.saveDecisions([{
          business_id,
          agent_type: 'clv' as AgentType,
          decision_data: {
            action_type: 'data_quality',
            customer_count: (customers ?? []).length,
            issue: 'No sales are linked to customer profiles. Enable "Ask for customer at POS" to start building CLV data.',
          },
          reasoning: (customers ?? []).length + ' customer profiles exist but no qualifying sales are linked. CLV scoring requires pos_sales rows with customer_id set.',
          confidence_score: 0.99,
          projected_impact_cents: 0,
          expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
        }]);
        await this.logRun(business_id, { decisions: dq, errors, duration_ms: Date.now() - t0 }, 'weekly_cron');
        return { decisions: dq, errors, duration_ms: Date.now() - t0 };
      }
      return { decisions: [], errors, duration_ms: Date.now() - t0 };
    }

    businessAvgBasket = businessAvgBasket / rawFeatures.length;

    // ── STEP 4 + 5: Assign tiers and compute minimum effective offer ───────────
    for (const f of rawFeatures) {
      // Tier assignment
      let tier: CustomerFeatures['clv_tier'];
      if (f.days_since_last_visit > 180) {
        tier = 'lost';
      } else if (f.days_since_last_visit > 60) {
        tier = 'dormant';
      } else if (
        (f.visit_trend === 'decelerating' || f.visit_trend === 'dormant') &&
        f.days_since_last_visit > 21 &&
        (f.visit_frequency_per_month > 1.5 || f.avg_basket_size > businessAvgBasket * 1.2)
      ) {
        tier = 'at_risk';
      } else if (f.visit_frequency_per_month > 4.0 && f.avg_basket_size > businessAvgBasket * 1.2) {
        tier = 'champion';
      } else if (f.visit_frequency_per_month > 2.0 && (f.visit_trend === 'accelerating' || f.visit_trend === 'stable')) {
        tier = 'loyal';
      } else if (
        f.visit_frequency_per_month < 2.0 &&
        (f.visit_trend === 'accelerating' || f.avg_basket_size > businessAvgBasket * 1.5)
      ) {
        tier = 'potential';
      } else {
        tier = 'loyal'; // default
      }
      f.clv_tier = tier;

      // Intervention priority
      let priority: CustomerFeatures['intervention_priority'];
      if (tier === 'champion' && f.visit_trend === 'decelerating') priority = 'urgent';
      else if (tier === 'champion') priority = 'none';
      else if (tier === 'loyal' && f.visit_trend === 'decelerating') priority = 'medium';
      else if (tier === 'loyal') priority = 'low';
      else if (tier === 'potential') priority = 'medium';
      else if (tier === 'at_risk') priority = f.avg_basket_size > businessAvgBasket * 1.2 ? 'urgent' : 'high';
      else if (tier === 'dormant') priority = f.avg_basket_size > businessAvgBasket * 1.5 ? 'urgent' : 'high';
      else priority = 'low';
      f.intervention_priority = priority;

      // Minimum effective offer
      let offerType: CustomerFeatures['recommended_offer_type'] = 'none';
      let offerValue: number | null = null;
      let rationale = '';

      if (priority === 'none' || priority === 'low') {
        offerType = 'none';
        rationale = 'No intervention needed — customer is stable';
      } else if (f.price_sensitivity_score < 0.25) {
        // Price-insensitive: VIP experience costs nothing in discount margin
        if (tier === 'potential' && f.avg_basket_size > businessAvgBasket * 1.5) {
          offerType = 'vip_upgrade';
          rationale = 'High-basket potential customer — VIP upgrade converts without discount';
        } else {
          offerType = f.visit_trend === 'accelerating' ? 'exclusive_access' : 'free_item';
          rationale = 'Price-insensitive: complimentary item or access is more effective than a discount';
        }
      } else if (f.price_sensitivity_score < 0.55) {
        // Price-moderate: points are better than direct discount
        if (tier === 'at_risk') {
          offerType = 'percentage_discount';
          offerValue = 10;
          rationale = 'Moderate price sensitivity + at-risk: 10% nudge is minimum effective intervention';
        } else {
          offerType = 'points_bonus';
          offerValue = 3.0;
          rationale = 'Moderate price sensitivity: 3x points bonus creates reciprocity without margin erosion';
        }
      } else {
        // Price-sensitive: discount required
        if (tier === 'at_risk' && f.avg_basket_size > businessAvgBasket * 1.2) {
          offerType = 'percentage_discount';
          offerValue = 15;
          rationale = 'High-value at-risk champion: 15% justified by high predicted 3yr CLV';
        } else if (tier === 'at_risk') {
          offerType = 'percentage_discount';
          offerValue = 10;
          rationale = 'Loyal at-risk customer: 10% minimum effective for price-sensitive reactivation';
        } else if (tier === 'dormant') {
          offerType = 'percentage_discount';
          offerValue = 20;
          rationale = 'Dormant customer requires stronger hook: 20% reactivation offer';
        } else {
          offerType = 'percentage_discount';
          offerValue = 5;
          rationale = 'Potential customer: 5% nudge to increase visit frequency';
        }
      }

      f.recommended_offer_type = offerType;
      f.recommended_offer_value = offerValue;
      f.intervention_rationale = rationale;
      scored.push(f as CustomerFeatures);
    }

    // ── STEP 6: Personalised messages via Haiku (batched 20 at a time) ─────────
    const needsMessage = scored.filter(f =>
      (f.intervention_priority === 'urgent' || f.intervention_priority === 'high') &&
      f.recommended_offer_type !== 'none'
    );

    const batchSize = 20;
    for (let i = 0; i < needsMessage.length; i += batchSize) {
      const batch = needsMessage.slice(i, i + batchSize);
      const batchContext = batch.map(f => ({
        customer_id: f.customer_id,
        first_name: (f.name ?? '').split(' ')[0] || 'there',
        months_as_customer: Math.round(f.months_as_customer),
        most_purchased: f.most_purchased_product_name ?? 'our products',
        days_since_visit: f.days_since_last_visit,
        offer_type: f.recommended_offer_type,
        offer_value: f.recommended_offer_value,
        tier: f.clv_tier,
      }));

      const systemPrompt = `Generate personalised SMS messages for these customers.
Each message MUST: use their first name, mention their actual most-purchased product,
reference how long they've been a customer, feel warm and personal (not corporate),
be max 160 characters.
Do NOT say "valued customer", "we miss you" generically, or "check out our deals".
The offer is included naturally at the end.
Example good: "Hi Sarah! Your flat whites have been missed ☕ As a 2-year regular, enjoy a free almond croissant next visit (7 days). — The Sip team"
Return JSON only: {"messages":[{"customer_id":"...","message":"..."}]}`;

      try {
        const response = await trackAICall<BatchMessageResponse | null>(
          {
            route: 'clv_agent/message_generation',
            model: 'claude-haiku-4-5-20251001',
            businessId: scored[0]?.customer_id,
            purpose: 'personalised_intervention_messages',
            inputTokensEstimate: Math.ceil(JSON.stringify(batchContext).length / 4),
          },
          () => this.claudeStructured<BatchMessageResponse>({
            system: systemPrompt,
            user: JSON.stringify(batchContext),
            maxTokens: 2048,
          })
        );

        if (response?.messages) {
          const msgMap = new Map(response.messages.map(m => [m.customer_id, m.message]));
          for (const f of batch) {
            const msg = msgMap.get(f.customer_id);
            if (msg) f.recommended_message = msg.slice(0, 320);
          }
        }
      } catch (err) {
        errors.push(err instanceof Error ? err : new Error(String(err)));
      }
    }

    // ── STEP 7: Portfolio summary ────────────────────────────────────────────────
    const totalAnnualRevenue = scored.reduce((s, f) => s + f.predicted_annual_revenue, 0);
    const atRiskRevenue = scored.filter(f => f.clv_tier === 'at_risk' || f.clv_tier === 'dormant').reduce((s, f) => s + f.predicted_annual_revenue, 0);
    const sortedByRevenue = [...scored].sort((a, b) => b.predicted_annual_revenue - a.predicted_annual_revenue);
    const top20Count = Math.ceil(scored.length * 0.2);
    const top20Revenue = sortedByRevenue.slice(0, top20Count).reduce((s, f) => s + f.predicted_annual_revenue, 0);
    const top20PctShare = totalAnnualRevenue > 0 ? Math.round((top20Revenue / totalAnnualRevenue) * 1000) / 10 : 0;
    const potentials = scored.filter(f => f.clv_tier === 'potential');
    const ifRisingStars = potentials.reduce((s, f) => s + f.avg_basket_size, 0);

    const tierGroups = (tier: string) => scored.filter(f => f.clv_tier === tier);
    const avgClv = (tier: string) => {
      const g = tierGroups(tier);
      return g.length > 0 ? Math.round(g.reduce((s, f) => s + f.predicted_annual_revenue, 0) / g.length * 100) / 100 : 0;
    };

    // Fetch existing intervention stats for portfolio summary
    const { data: sentInterventions } = await supabaseAdmin
      .from('customer_clv_scores')
      .select('intervention_responded,revenue_in_30d_after')
      .eq('business_id', business_id)
      .not('intervention_sent_at', 'is', null);

    const interventionsSent = (sentInterventions ?? []).length;
    const interventionsResponded = (sentInterventions ?? []).filter(i => i.intervention_responded).length;
    const revenueAttributed = (sentInterventions ?? []).filter(i => i.intervention_responded).reduce((s, i) => s + (Number(i.revenue_in_30d_after) || 0), 0);
    const responseRatePct = interventionsSent > 0 ? Math.round(interventionsResponded / interventionsSent * 1000) / 10 : 0;

    await supabaseAdmin
      .from('clv_portfolio_summary')
      .upsert({
        business_id,
        scored_at: new Date().toISOString(),
        total_customer_count: scored.length,
        champion_count: tierGroups('champion').length,
        loyal_count: tierGroups('loyal').length,
        potential_count: tierGroups('potential').length,
        at_risk_count: tierGroups('at_risk').length,
        dormant_count: tierGroups('dormant').length,
        lost_count: tierGroups('lost').length,
        total_predicted_annual_revenue: Math.round(totalAnnualRevenue * 100) / 100,
        at_risk_annual_revenue: Math.round(atRiskRevenue * 100) / 100,
        top_20_pct_revenue_share: top20PctShare,
        if_rising_stars_add_1_visit: Math.round(ifRisingStars * 100) / 100,
        avg_clv_champion: avgClv('champion'),
        avg_clv_loyal: avgClv('loyal'),
        avg_clv_potential: avgClv('potential'),
        interventions_sent: interventionsSent,
        interventions_responded: interventionsResponded,
        response_rate_pct: responseRatePct,
        revenue_attributed_to_interventions: Math.round(revenueAttributed * 100) / 100,
      }, { onConflict: 'business_id' });

    // ── STEP 8: Bulk upsert customer_clv_scores (weekly dedup in app code) ─────
    // Find customers already scored this week
    const weekStart = new Date();
    weekStart.setHours(0, 0, 0, 0);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Sunday

    const { data: alreadyScoredThisWeek } = await supabaseAdmin
      .from('customer_clv_scores')
      .select('customer_id')
      .eq('business_id', business_id)
      .gte('scored_at', weekStart.toISOString());

    const alreadyScoredIds = new Set((alreadyScoredThisWeek ?? []).map(r => r.customer_id));
    const toInsert = scored.filter(f => !alreadyScoredIds.has(f.customer_id));

    if (toInsert.length > 0) {
      const rows = toInsert.map(f => ({
        business_id,
        customer_id: f.customer_id,
        avg_basket_size: f.avg_basket_size,
        visit_frequency_per_month: f.visit_frequency_per_month,
        months_as_customer: f.months_as_customer,
        product_diversity_score: f.product_diversity_score,
        price_sensitivity_score: f.price_sensitivity_score,
        seasonal_consistency_score: f.seasonal_consistency_score,
        predicted_monthly_revenue: f.predicted_monthly_revenue,
        predicted_annual_revenue: f.predicted_annual_revenue,
        predicted_3yr_clv: f.predicted_3yr_clv,
        clv_tier: f.clv_tier,
        visit_trend: f.visit_trend,
        spend_trend: f.spend_trend,
        days_since_last_visit: f.days_since_last_visit,
        p_alive: f.p_alive,
        expected_purchases_next_90d: f.expected_purchases_next_90d,
        expected_next_order_date: f.expected_next_order_date,
        intervention_priority: f.intervention_priority,
        recommended_offer_type: f.recommended_offer_type,
        recommended_offer_value: f.recommended_offer_value,
        recommended_message: f.recommended_message,
        intervention_rationale: f.intervention_rationale,
      }));

      // Batch inserts in chunks of 100
      for (let i = 0; i < rows.length; i += 100) {
        const { error } = await supabaseAdmin
          .from('customer_clv_scores')
          .insert(rows.slice(i, i + 100));
        if (error) errors.push(new Error('clv_scores insert: ' + error.message));
      }
    }

    // Update pos_customers: rfm_segment = clv_tier, churn_risk_score = churn_probability
    for (const f of scored.slice(0, 200)) {
      await supabaseAdmin
        .from('pos_customers')
        .update({
          rfm_segment: f.clv_tier,
          churn_risk_score: f.churn_probability,
          churn_risk_updated_at: new Date().toISOString(),
        })
        .eq('id', f.customer_id)
        .eq('business_id', business_id);
    }

    // ── STEP 9: Execute interventions if mode='auto' ──────────────────────────
    if (mode === 'auto') {
      const smsGapCutoff = new Date(Date.now() - smsGapDays * 86400000).toISOString();

      // Customers recently messaged
      const { data: recentlySent } = await supabaseAdmin
        .from('customer_clv_scores')
        .select('customer_id')
        .eq('business_id', business_id)
        .gte('intervention_sent_at', smsGapCutoff);

      const recentlySentIds = new Set((recentlySent ?? []).map(r => r.customer_id));

      const toSend = scored.filter(f =>
        (f.intervention_priority === 'urgent' || f.intervention_priority === 'high') &&
        f.recommended_message &&
        !recentlySentIds.has(f.customer_id)
      ).slice(0, 50);

      for (const f of toSend) {
        try {
          let sent = false;
          if (f.phone && f.marketing_consent) {
            const result = await sendSMS(f.phone, f.recommended_message!);
            sent = result.ok;
          } else if (f.email) {
            const resendKey = process.env.RESEND_API_KEY;
            if (resendKey) {
              await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + resendKey },
                body: JSON.stringify({
                  from: 'noreply@' + (process.env.RESEND_DOMAIN ?? 'mail.aria-os.com.au'),
                  to: f.email,
                  subject: 'A personal note from us',
                  text: f.recommended_message!,
                }),
                signal: AbortSignal.timeout(5000),
              });
              sent = true;
            }
          }

          if (sent) {
            // Update the most recent score for this customer with sent_at
            const { data: latestScore } = await supabaseAdmin
              .from('customer_clv_scores')
              .select('id')
              .eq('business_id', business_id)
              .eq('customer_id', f.customer_id)
              .order('scored_at', { ascending: false })
              .limit(1)
              .maybeSingle();

            if (latestScore?.id) {
              await supabaseAdmin
                .from('customer_clv_scores')
                .update({ intervention_sent_at: new Date().toISOString() })
                .eq('id', latestScore.id);
            }

            try {
              await supabaseAdmin.from('aria_autopilot_actions').insert({
                business_id,
                action_type: 'clv_intervention',
                action_data: {
                  customer_id: f.customer_id,
                  tier: f.clv_tier,
                  priority: f.intervention_priority,
                  offer_type: f.recommended_offer_type,
                  channel: f.phone && f.marketing_consent ? 'sms' : 'email',
                },
                status: 'executed',
                executed_at: new Date().toISOString(),
              });
            } catch (e) { console.error('[non-fatal]', e) }
          }
        } catch (err) {
          errors.push(err instanceof Error ? err : new Error(String(err)));
        }
      }
    }

    // ── STEP 10: Save agent decisions (top 10 opportunities) ──────────────────
    const top10 = scored
      .filter(f => f.intervention_priority === 'urgent' || f.intervention_priority === 'high')
      .sort((a, b) => b.predicted_annual_revenue - a.predicted_annual_revenue)
      .slice(0, 10);

    const decisionInputs: AgentDecisionInput[] = top10.map(f => ({
      business_id,
      agent_type: 'clv' as AgentType,
      decision_data: {
        customer_id: f.customer_id,
        customer_name: f.name,
        clv_tier: f.clv_tier,
        intervention_priority: f.intervention_priority,
        predicted_annual_revenue: f.predicted_annual_revenue,
        recommended_offer_type: f.recommended_offer_type,
        recommended_offer_value: f.recommended_offer_value,
        message_preview: f.recommended_message?.slice(0, 80),
        days_since_last_visit: f.days_since_last_visit,
        p_alive: f.p_alive,
        expected_purchases_next_90d: f.expected_purchases_next_90d,
        expected_next_order_date: f.expected_next_order_date,
      },
      reasoning: f.intervention_rationale,
      confidence_score: Math.min(f.predicted_3yr_clv / 10000, 1),
      projected_impact_cents: Math.round(f.predicted_annual_revenue * 100 * 0.3),
      expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
      status: 'pending',
    }));

    // Portfolio summary when no urgent/high-priority customers exist
    if (decisionInputs.length === 0 && scored.length > 0) {
      const aiSummary = await this.claudeStructured<{ reasoning: string }>({
        system: 'You are a CLV analyst for Australian small businesses. Summarise portfolio health in 1-2 sentences focusing on the key opportunity or risk.',
        user: JSON.stringify({
          total_customers: scored.length,
          champion: scored.filter(f => f.clv_tier === 'champion').length,
          loyal: scored.filter(f => f.clv_tier === 'loyal').length,
          at_risk: scored.filter(f => f.clv_tier === 'at_risk').length,
          dormant: scored.filter(f => f.clv_tier === 'dormant').length,
          total_annual_revenue: Math.round(totalAnnualRevenue),
          at_risk_revenue: Math.round(atRiskRevenue),
          top_20_pct_share: top20PctShare,
        }),
        maxTokens: 150,
        agent_key: 'clv',
        role: 'customer',
        business_id,
      });
      decisionInputs.push({
        business_id,
        agent_type: 'clv' as AgentType,
        decision_data: {
          action_type: 'portfolio_health',
          total_customers: scored.length,
          tier_breakdown: {
            champion: scored.filter(f => f.clv_tier === 'champion').length,
            loyal: scored.filter(f => f.clv_tier === 'loyal').length,
            potential: scored.filter(f => f.clv_tier === 'potential').length,
            at_risk: scored.filter(f => f.clv_tier === 'at_risk').length,
            dormant: scored.filter(f => f.clv_tier === 'dormant').length,
          },
          total_predicted_annual_revenue: Math.round(totalAnnualRevenue * 100) / 100,
          at_risk_annual_revenue: Math.round(atRiskRevenue * 100) / 100,
          top_20_pct_revenue_share: top20PctShare,
        },
        reasoning: aiSummary?.reasoning ?? ('Portfolio scored: ' + scored.length + ' customers, $' + Math.round(totalAnnualRevenue) + '/yr predicted revenue. No urgent interventions needed.'),
        confidence_score: 0.85,
        projected_impact_cents: Math.round(atRiskRevenue * 100 * 0.15),
        expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
      });
    }

    const decisions = await this.saveDecisions(decisionInputs);
    const result: AgentRunResult = { decisions, errors, duration_ms: Date.now() - t0 };
    await this.logRun(business_id, result, 'weekly_cron');
    return result;
  }
}
