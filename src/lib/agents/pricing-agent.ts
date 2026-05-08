import { BaseAgent } from './base-agent';
import type { AgentType, AgentDecisionInput, AgentRunResult } from './types';

const MIN_COMPETITOR_POINTS = 3;

function quantile(arr: number[], q: number): number {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = q * (sorted.length - 1);
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function percentileOf(val: number, arr: number[]): number {
  if (!arr.length) return 0.5;
  return arr.filter(v => v <= val).length / arr.length;
}

export class PricingAgent extends BaseAgent {
  type: AgentType = 'pricing';

  async run(business_id: string): Promise<AgentRunResult> {
    const started = Date.now();
    const errors: Error[] = [];
    const settings = await this.getSettings(business_id);
    if (!settings.enabled) return { decisions: [], errors: [], duration_ms: Date.now() - started };

    try {
      // Fetch competitor cache for this business
      const { data: compCache } = await this.supabase.from('competitor_price_cache')
        .select('product_name,competitor_prices,own_price_cents,own_margin_pct')
        .eq('business_id', business_id)
        .gt('expires_at', new Date().toISOString())
        .limit(500);

      if (!compCache?.length) return { decisions: [], errors: [], duration_ms: Date.now() - started };

      // Get our products
      const { data: products } = await this.supabase.from('pos_products')
        .select('id,name,price,cost_price,is_active')
        .eq('business_id', business_id).eq('is_active', true).limit(500);

      const productByName = new Map((products ?? []).map(p => [p.name.toLowerCase(), p]));

      // 30-day velocity
      const cutoff14 = new Date(Date.now() - 14 * 86400000).toISOString();
      const cutoff28 = new Date(Date.now() - 28 * 86400000).toISOString();
      const cutoff30 = new Date(Date.now() - 30 * 86400000).toISOString();

      const { data: recent14 } = await this.supabase.from('pos_sale_items').select('product_id,quantity').gte('created_at', cutoff14).eq('business_id', business_id).limit(5000);
      const { data: prev14 } = await this.supabase.from('pos_sale_items').select('product_id,quantity').gte('created_at', cutoff28).lt('created_at', cutoff14).eq('business_id', business_id).limit(5000);

      const vel14 = new Map<string, number>();
      const vel14Prev = new Map<string, number>();
      for (const si of (recent14 ?? [])) vel14.set(si.product_id, (vel14.get(si.product_id) ?? 0) + si.quantity);
      for (const si of (prev14 ?? [])) vel14Prev.set(si.product_id, (vel14Prev.get(si.product_id) ?? 0) + si.quantity);

      const decisions: AgentDecisionInput[] = [];

      for (const cc of (compCache as Array<{ product_name: string; competitor_prices: unknown; own_price_cents: number; own_margin_pct: number }>)) {
        const compPrices: number[] = Array.isArray(cc.competitor_prices) ? cc.competitor_prices.map((c: { price_cents?: number }) => (c.price_cents ?? 0) / 100).filter(Boolean) : [];
        if (compPrices.length < MIN_COMPETITOR_POINTS) continue;

        const product = productByName.get(cc.product_name.toLowerCase());
        if (!product) continue;

        const ourPrice = product.price ?? (cc.own_price_cents / 100);
        const median = quantile(compPrices, 0.5);
        const p25 = quantile(compPrices, 0.25);
        const p75 = quantile(compPrices, 0.75);
        const positionPct = percentileOf(ourPrice, compPrices);

        const recentSold = vel14.get(product.id) ?? 0;
        const prevSold = vel14Prev.get(product.id) ?? 0;
        const velocityTrend = prevSold > 0 ? (recentSold - prevSold) / prevSold : 0;

        let suggested: number | null = null;
        let focus = '';

        if (positionPct >= 0.75 && velocityTrend < -0.10) {
          suggested = this.roundToNearest99(median);
          focus = 'price-drop-to-recover-volume';
        } else if (positionPct <= 0.25 && cc.own_margin_pct > 30) {
          suggested = this.roundToNearest99(p75 - 0.50);
          focus = 'price-lift-on-margin-opportunity';
        }

        if (!suggested || Math.abs(suggested - ourPrice) < 0.10) continue;

        const direction = suggested < ourPrice ? 'drop' : 'lift';
        const projectedRevenueImpact = Math.round((suggested - ourPrice) * recentSold * 4 * 100); // 4 weeks cents

        const reasoning = await this.claudeReason({
          system: 'You are Aria, an AI pricing advisor for an Australian bottle shop. Be specific with dollars and percentages. Max 2 sentences. Australian English.',
          user: `Product: ${product.name}. Our price: A$${ourPrice.toFixed(2)}. Market: median A$${median.toFixed(2)}, range A$${p25.toFixed(2)}-A$${p75.toFixed(2)}. Sales: ${recentSold} units/14d, trending ${velocityTrend >= 0 ? '+' : ''}${(velocityTrend * 100).toFixed(0)}%. Suggesting A$${suggested.toFixed(2)} because ${focus}. Project: ${direction === 'drop' ? 'volume recovery' : 'margin lift'}.`,
          maxTokens: 100,
        });

        decisions.push({
          business_id,
          agent_type: 'pricing',
          decision_data: {
            product_id: product.id,
            product_name: product.name,
            current_price: ourPrice,
            suggested_price: suggested,
            direction,
            focus,
            market: { median, p25, p75, position_pct: positionPct },
            velocity: { recent_14d: recentSold, prev_14d: prevSold, trend_pct: velocityTrend },
          },
          reasoning,
          confidence_score: focus === 'price-drop-to-recover-volume' ? 0.78 : 0.65,
          projected_impact_cents: projectedRevenueImpact,
          expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
        });
      }

      const saved = await this.saveDecisions(decisions);
      const result: AgentRunResult = { decisions: saved, errors, duration_ms: Date.now() - started };
      await this.logRun(business_id, result);
      return result;
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      errors.push(err);
      return { decisions: [], errors, duration_ms: Date.now() - started };
    }
  }
}
