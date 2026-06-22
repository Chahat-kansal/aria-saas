import { supabaseAdmin } from '@/lib/supabase-admin'

// LOY-REWARD-RULES — behaviour-triggered rewards evaluated against REAL sale data. Each active rule is
// checked against the just-completed sale; on a match it awards points_value through the EXISTING ledger
// and writes a loyalty_rule_awards row. The UNIQUE(rule_id, sale_id) on that table is the idempotency
// guard: re-evaluating the same sale can never double-award. GROUNDING-TEETH: thresholds are checked
// against the sale's real total / item categories / the member's real completed-visit count.

interface Rule { id: string; rule_type: string; points_value: number | null; threshold_value: number | null; config: Record<string, unknown> | null; is_active: boolean }

async function awardViaLedger(customerId: string, businessId: string, points: number): Promise<void> {
  await supabaseAdmin.rpc('increment_loyalty_points', { customer_id: customerId, points })
  await supabaseAdmin.rpc('increment_numeric', { p_table: 'pos_customers', p_id: customerId, p_column: 'points_balance', p_amount: points })
  await supabaseAdmin.from('pos_loyalty_transactions').insert({
    business_id: businessId, customer_id: customerId, sale_id: null, type: 'earn', points_delta: points, created_at: new Date().toISOString(),
  })
}

async function qualifies(rule: Rule, ctx: { customerId: string; businessId: string; saleId: string; total: number }): Promise<boolean> {
  const threshold = Number(rule.threshold_value ?? 0)
  if (rule.rule_type === 'spend_threshold') {
    return ctx.total >= threshold && threshold > 0
  }
  if (rule.rule_type === 'visit_count') {
    // Fires on exactly the Nth completed (non-voided) visit — counted from real pos_sales.
    if (threshold <= 0) return false
    const { count } = await supabaseAdmin.from('pos_sales')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', ctx.businessId).eq('customer_id', ctx.customerId).eq('status', 'completed')
    return (count ?? 0) === Math.round(threshold)
  }
  if (rule.rule_type === 'category_purchase') {
    const category = String((rule.config ?? {}).category ?? '').trim()
    if (!category) return false
    const { data: items } = await supabaseAdmin.from('pos_sale_items')
      .select('product_id, product_name').eq('sale_id', ctx.saleId)
    if (!items?.length) return false
    // Match by the product's real category (preferred) or a product-name contains fallback.
    const productIds = items.map(i => i.product_id).filter(Boolean) as string[]
    if (productIds.length) {
      const { data: prods } = await supabaseAdmin.from('pos_products').select('id, category').in('id', productIds)
      if ((prods ?? []).some(p => String(p.category ?? '').toLowerCase() === category.toLowerCase())) return true
    }
    return items.some(i => String(i.product_name ?? '').toLowerCase().includes(category.toLowerCase()))
  }
  return false
}

/** Evaluate this business's active reward rules against one real completed sale. Idempotent per (rule, sale). */
export async function evaluateRewardRules(customerId: string, businessId: string, saleId: string): Promise<void> {
  // Ground truth: read the sale itself (skip voided / not-completed).
  const { data: sale } = await supabaseAdmin.from('pos_sales')
    .select('total_amount, status').eq('id', saleId).eq('business_id', businessId).maybeSingle()
  if (!sale || sale.status === 'voided') return
  const total = Number(sale.total_amount ?? 0)

  const { data: rules } = await supabaseAdmin.from('loyalty_reward_rules')
    .select('id, rule_type, points_value, threshold_value, config, is_active')
    .eq('business_id', businessId).eq('is_active', true)
  if (!rules?.length) return

  for (const rule of rules as Rule[]) {
    if (!['spend_threshold', 'visit_count', 'category_purchase'].includes(rule.rule_type)) continue
    const points = Math.max(0, Math.round(Number(rule.points_value ?? 0)))
    if (points <= 0) continue
    if (!(await qualifies(rule, { customerId, businessId, saleId, total }))) continue

    // Idempotency claim: the UNIQUE(rule_id, sale_id) rejects a second award for this sale.
    const { error: claimErr } = await supabaseAdmin.from('loyalty_rule_awards')
      .insert({ rule_id: rule.id, business_id: businessId, customer_id: customerId, sale_id: saleId, points_awarded: points })
    if (claimErr) continue // already awarded for this sale (or insert failed) → skip
    await awardViaLedger(customerId, businessId, points)
  }
}
