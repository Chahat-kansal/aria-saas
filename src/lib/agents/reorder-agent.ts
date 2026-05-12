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
interface SupplierRow { id: string; name: string; email: string | null; lead_time_days: number | null; }
interface POLine { product: ProductRow; qty: number; unit_cost: number; total: number; urgency: number; avg_daily: number; }

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

      // Fetch suppliers
      const supplierIds = [...new Set(products.map(p => p.supplier_id).filter(Boolean))] as string[];
      const { data: suppliers } = await this.supabase.from('pos_suppliers')
        .select('id,name,email,lead_time_days').in('id', supplierIds);
      const supplierMap = new Map<string, SupplierRow>((suppliers ?? []).map(s => [s.id, s as SupplierRow]));

      // Group proposed lines by supplier
      const poBySupplier = new Map<string, { supplier: SupplierRow; lines: POLine[] }>();
      const UNASSIGNED = '__unassigned__';

      for (const p of (products as ProductRow[])) {
        const avgDaily = (sold30d.get(p.id) ?? 0) / 30;
        if (avgDaily < MIN_AVG_DAILY) continue;

        const supplier = p.supplier_id ? supplierMap.get(p.supplier_id) : null;
        const leadDays = supplier?.lead_time_days ?? KNOWN_LEAD_TIMES[supplier?.name ?? ''] ?? DEFAULT_LEAD_DAYS;
        const safetyStock = avgDaily * leadDays * SAFETY_STOCK_FACTOR;
        const reorderPoint = safetyStock + avgDaily * leadDays;
        const current = p.stock_quantity ?? 0;

        if (current >= reorderPoint) continue;

        const targetStock = avgDaily * TARGET_COVER_DAYS;
        let rawQty = Math.ceil(targetStock - current);
        if (rawQty <= 0) rawQty = 1;

        const caseQty = p.case_quantity ?? 1;
        const orderQty = rawQty < caseQty ? caseQty : Math.ceil(rawQty / caseQty) * caseQty;
        const unitCost = await resolveUnitCost(this.supabase, p.id, business_id, { productCostPrice: p.cost_price })
        const urgency = reorderPoint > 0 ? Math.max(0, Math.min(1, 1 - current / reorderPoint)) : 1;

        const line: POLine = { product: p, qty: orderQty, unit_cost: unitCost, total: orderQty * unitCost, urgency, avg_daily: avgDaily };
        const key = p.supplier_id ?? UNASSIGNED;

        if (!poBySupplier.has(key)) {
          poBySupplier.set(key, {
            supplier: supplier ?? { id: UNASSIGNED, name: 'Unassigned Supplier', email: null, lead_time_days: DEFAULT_LEAD_DAYS },
            lines: [],
          });
        }
        poBySupplier.get(key)!.lines.push(line);
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
            lines: po.lines.map(l => ({ product_id: l.product.id, product_name: l.product.name, qty: l.qty, unit_cost: l.unit_cost, total: l.total, urgency: l.urgency })),
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
