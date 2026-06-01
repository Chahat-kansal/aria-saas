import { BaseAgent } from './base-agent';
import type { AgentType, AgentDecisionInput, AgentRunResult } from './types';
import { resolveUnitCost } from '@/lib/orders/resolve-unit-cost'

// Lead times by known AU supplier shorthand (days)
const KNOWN_LEAD_TIMES: Record<string, number> = {
  ALM: 2, ILG: 3, LMG: 3,
};
const DEFAULT_LEAD_DAYS = 5;
const SAFETY_STOCK_FACTOR = 1.5;
const TARGET_COVER_DAYS = 14;
const MIN_AVG_DAILY = 0.1; // skip very slow movers

interface ProductRow {
  id: string; name: string; sku: string | null; case_quantity: number | null;
  stock_quantity: number; cost_price: number; supplier_id: string | null;
}
interface SupplierRow {
  id: string; name: string; email: string | null; lead_time_days: number | null;
  delivery_days: number[] | null; order_cutoff_days: number[] | null; short_code: string | null;
}
interface POLine {
  product: ProductRow; qty: number; unit_cost: number; total: number; urgency: number; avg_daily: number;
  trend: 'up' | 'down' | 'same'; price_change_pct: number; stock_days: number;
}

function calcNextDeliveryDate(deliveryDays: number[], leadTimeDays: number): Date {
  if (!deliveryDays.length) return new Date(Date.now() + (leadTimeDays || DEFAULT_LEAD_DAYS) * 86400000)
  const todayDow = (new Date().getDay() + 6) % 7
  for (let offset = 1; offset <= 14; offset++) {
    const dow = (todayDow + offset) % 7
    if (deliveryDays.includes(dow)) return new Date(Date.now() + offset * 86400000)
  }
  return new Date(Date.now() + (leadTimeDays || DEFAULT_LEAD_DAYS) * 86400000)
}

export class ReorderAgent extends BaseAgent {
  type: AgentType = 'reorder';

  async run(business_id: string): Promise<AgentRunResult> {
    const started = Date.now();
    const errors: Error[] = [];
    const settings = await this.getSettings(business_id);
    if (!settings.enabled) return { decisions: [], errors: [], duration_ms: Date.now() - started };

    try {
      // Fetch active products with stock tracking
      const { data: products } = await this.supabase.from('pos_products')
        .select('id,name,sku,case_quantity,stock_quantity,cost_price,supplier_id')
        .eq('business_id', business_id).eq('is_active', true).eq('track_stock', true).limit(500);

      if (!products?.length) return { decisions: [], errors: [], duration_ms: Date.now() - started };

      // Fetch 30-day sales per product — two-step to exclude voided sales
      const cutoff = new Date(Date.now() - 30 * 86400000).toISOString();
      const { data: recentSales } = await this.supabase.from('pos_sales')
        .select('id')
        .eq('business_id', business_id)
        .neq('status', 'voided')
        .gte('created_at', cutoff)
        .limit(2000);
      const recentSaleIds = (recentSales ?? []).map(s => s.id);

      const sold30d = new Map<string, number>();
      if (recentSaleIds.length > 0) {
        const { data: saleItems } = await this.supabase.from('pos_sale_items')
          .select('product_id,quantity')
          .in('sale_id', recentSaleIds)
          .in('product_id', products.map(p => p.id))
          .limit(10000);
        for (const si of (saleItems ?? [])) {
          sold30d.set(si.product_id, (sold30d.get(si.product_id) ?? 0) + (si.quantity ?? 0));
        }
      }

      // Fetch 90-day sales for trend calculation
      const cutoff90 = new Date(Date.now() - 90 * 86400000).toISOString();
      const { data: sales90 } = await this.supabase.from('pos_sales')
        .select('id').eq('business_id', business_id).neq('status', 'voided')
        .gte('created_at', cutoff90).limit(5000);
      const sold90d = new Map<string, number>();
      if ((sales90 ?? []).length > 0) {
        const { data: items90 } = await this.supabase.from('pos_sale_items')
          .select('product_id,quantity')
          .in('sale_id', (sales90 ?? []).map(s => s.id))
          .in('product_id', products.map(p => p.id))
          .limit(20000);
        for (const si of (items90 ?? [])) {
          sold90d.set(si.product_id, (sold90d.get(si.product_id) ?? 0) + (si.quantity ?? 0));
        }
      }

      // Fetch suppliers (extended with delivery schedule fields)
      const supplierIds = [...new Set(products.map(p => p.supplier_id).filter(Boolean))] as string[];
      const { data: suppliers } = await this.supabase.from('pos_suppliers')
        .select('id,name,email,lead_time_days,delivery_days,order_cutoff_days,short_code').in('id', supplierIds);
      const supplierMap = new Map<string, SupplierRow>((suppliers ?? []).map(s => [s.id, s as SupplierRow]));

      // Fetch price history for price-change detection (last 60 days)
      const cutoff60 = new Date(Date.now() - 60 * 86400000).toISOString();
      const { data: recentPrices } = await this.supabase.from('supplier_product_prices')
        .select('product_id,cost_price,recorded_at')
        .in('supplier_id', supplierIds)
        .gte('recorded_at', cutoff60)
        .order('recorded_at', { ascending: true })
        .limit(5000);
      const priceChangeMap = new Map<string, number>();
      const priceByProduct = new Map<string, { old: number; current: number }>();
      for (const p of (recentPrices ?? [])) {
        if (!p.product_id) continue;
        const ex = priceByProduct.get(p.product_id);
        if (!ex) priceByProduct.set(p.product_id, { old: Number(p.cost_price), current: Number(p.cost_price) });
        else ex.current = Number(p.cost_price);
      }
      for (const [pid, pd] of priceByProduct) {
        if (pd.old > 0) priceChangeMap.set(pid, ((pd.current - pd.old) / pd.old) * 100);
      }

      // Group proposed lines by supplier
      const poBySupplier = new Map<string, { supplier: SupplierRow; lines: POLine[] }>();
      const UNASSIGNED = '__unassigned__';

      const aiSuggestionRows: Record<string, unknown>[] = [];

      for (const p of (products as ProductRow[])) {
        const avgDaily30 = (sold30d.get(p.id) ?? 0) / 30;
        const avgDaily90 = (sold90d.get(p.id) ?? 0) / 90;
        if (avgDaily30 < MIN_AVG_DAILY && avgDaily90 < MIN_AVG_DAILY) continue;
        const avgDaily = avgDaily30 || avgDaily90;

        // Trend: compare 30d velocity vs 90d velocity
        let trend: 'up' | 'down' | 'same' = 'same';
        let trendMultiplier = 1;
        if (avgDaily90 > 0) {
          if (avgDaily30 > avgDaily90 * 1.1) { trend = 'up'; trendMultiplier = 1.2; }
          else if (avgDaily30 < avgDaily90 * 0.9) { trend = 'down'; trendMultiplier = 0.85; }
        }

        const supplier = p.supplier_id ? supplierMap.get(p.supplier_id) : null;
        const leadDays = supplier?.lead_time_days ?? KNOWN_LEAD_TIMES[supplier?.name ?? ''] ?? DEFAULT_LEAD_DAYS;

        // Delivery-aware next delivery date
        const nextDelivery = calcNextDeliveryDate(supplier?.delivery_days ?? [], leadDays);
        const daysToDelivery = Math.round((nextDelivery.getTime() - Date.now()) / 86400000);

        const safetyStock = avgDaily * leadDays * SAFETY_STOCK_FACTOR;
        const targetCover = daysToDelivery + TARGET_COVER_DAYS;
        const current = p.stock_quantity ?? 0;
        let rawQty = Math.max(0, Math.ceil(avgDaily * targetCover + safetyStock - current));
        rawQty = Math.ceil(rawQty * trendMultiplier);

        const reorderPoint = safetyStock + avgDaily * leadDays;
        if (current >= reorderPoint && rawQty <= 0) continue;

        const caseQty = p.case_quantity ?? 1;
        const orderQty = rawQty <= 0 ? caseQty : (rawQty < caseQty ? caseQty : Math.ceil(rawQty / caseQty) * caseQty);
        const unitCost = await resolveUnitCost(this.supabase, p.id, business_id, { productCostPrice: p.cost_price })
        const stockDays = avgDaily > 0 ? current / avgDaily : 999;
        const urgency = stockDays <= leadDays ? 1 : stockDays <= leadDays * 2 ? 0.7 : 0.3;
        const priceChangePct = Math.round((priceChangeMap.get(p.id) ?? 0) * 10) / 10;

        // Collect for supplier_ai_suggestions write
        if (p.supplier_id) {
          aiSuggestionRows.push({
            business_id, supplier_id: p.supplier_id, product_id: p.id, product_name: p.name,
            suggested_qty: orderQty, current_qty: current, trend,
            velocity_per_week: Math.round(avgDaily * 7 * 10) / 10,
            stock_days_remaining: Math.round(stockDays * 10) / 10,
            price_change_pct: priceChangePct, accepted: null,
            reason: trend === 'up' ? 'Sales trending up vs 90-day average.' : trend === 'down' ? 'Sales trending down — reduced order.' : priceChangePct > 3 ? 'Price increase detected — review before ordering.' : null,
          });
        }

        const line: POLine = { product: p, qty: orderQty, unit_cost: unitCost, total: orderQty * unitCost, urgency, avg_daily: avgDaily, trend, price_change_pct: priceChangePct, stock_days: Math.round(stockDays * 10) / 10 };
        const key = p.supplier_id ?? UNASSIGNED;

        if (!poBySupplier.has(key)) {
          poBySupplier.set(key, {
            supplier: supplier ?? { id: UNASSIGNED, name: 'Unassigned Supplier', email: null, lead_time_days: DEFAULT_LEAD_DAYS, delivery_days: null, order_cutoff_days: null, short_code: null },
            lines: [],
          });
        }
        poBySupplier.get(key)!.lines.push(line);
      }

      if (aiSuggestionRows.length > 0) {
        void Promise.resolve(this.supabase.from('supplier_ai_suggestions').insert(aiSuggestionRows)).catch(() => {})
      }

      const decisions: AgentDecisionInput[] = [];

      for (const [, po] of poBySupplier) {
        if (!po.lines.length) continue;
        po.lines.sort((a, b) => b.urgency - a.urgency);
        const totalCost = po.lines.reduce((s, l) => s + l.total, 0);
        const topLines = po.lines.slice(0, 5).map(l => `${l.product.name}: ${l.qty} units @ A$${l.unit_cost.toFixed(2)} = A$${l.total.toFixed(2)} (${l.avg_daily.toFixed(2)}/day avg)`).join('\n');

        const reasoning = await this.claudeReason({
          system: 'You are Aria, generating purchase order reasoning for an Australian bottle shop owner. Be specific with numbers. Max 2 sentences. Australian English.',
          user: `Purchase order for ${po.supplier.name}:\n${topLines}\nTotal: A$${totalCost.toFixed(2)}. Lines ordered by urgency. Explain why these items need reordering now.`,
          maxTokens: 128,
        });

        // Save draft PO
        await this.supabase.from('purchase_order_drafts').insert({
          business_id,
          draft_type: 'agent_reorder',
          status: 'pending_approval',
          items: po.lines.map(l => ({ product_id: l.product.id, product_name: l.product.name, current_stock: l.product.stock_quantity, suggested_qty: l.qty, unit_cost_cents: Math.round(l.unit_cost * 100), total_cost_cents: Math.round(l.total * 100), reason: `avg ${l.avg_daily.toFixed(2)}/day` })),
          total_cost_cents: Math.round(totalCost * 100),
          aria_reasoning: reasoning,
          week_starting: new Date().toISOString().split('T')[0],
          supplier_id: po.supplier.id !== UNASSIGNED ? po.supplier.id : null,
        });

        decisions.push({
          business_id,
          agent_type: 'reorder',
          decision_data: {
            supplier_id: po.supplier.id,
            supplier_name: po.supplier.name,
            supplier_email: po.supplier.email,
            lines: po.lines.map(l => ({ product_id: l.product.id, product_name: l.product.name, qty: l.qty, unit_cost: l.unit_cost, total: l.total, urgency: l.urgency, trend: l.trend, price_change_pct: l.price_change_pct })),
            total_cost: totalCost,
          },
          reasoning,
          confidence_score: Math.min(0.95, po.lines.reduce((s, l) => s + l.urgency, 0) / po.lines.length),
          projected_impact_cents: Math.round(totalCost * 100),
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
      console.error('[reorder-agent]', err.message);
      return { decisions: [], errors, duration_ms: Date.now() - started };
    }
  }
}
