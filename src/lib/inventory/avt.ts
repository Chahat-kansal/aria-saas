import type { SupabaseClient } from '@supabase/supabase-js'

// INV-AVT — theoretical-vs-actual food cost variance. Read-only computation; no writes.
// THEORETICAL: recipe_ingredients.quantity × units_sold (completed sales) = expected ingredient usage.
// ACTUAL: pos_stock_adjustments (reason LIKE recipe_depletion%) + pos_waste_log for those ingredients in period.
// GAP = theoretical − actual. Positive = under-consumed vs spec; negative = over-consumed (over-portion / loss).
// GROUNDING-TEETH: compute only where recipe + sales + depletion history coexist. No recipe → 'no recipe'.
// No sales → 'no_sales'. No depletion history → 'depletion_not_tracked' (INV-7 may be new).
// CENTS-SAFE: recipe_ingredients.cost_cents = CENTS (÷100 → $); cost_per_unit is already DOLLARS.

const round2 = (n: number) => Math.round(n * 100) / 100

export interface AvTIngredientLine {
  ingredient_id: string | null
  ingredient_name: string
  unit: string
  theoretical_qty: number          // recipe spec × units_sold (incl. wastage_pct)
  actual_qty: number               // pos_stock_adjustments depletion + pos_waste_log
  gap_qty: number                  // theoretical − actual; + = under-consumed; − = over-consumed
  unit_cost_dollars: number | null // cost_cents ÷ 100 (priority) or cost_per_unit; null = no cost on record
  gap_dollars: number | null       // gap_qty × unit_cost; null if cost unknown
  direction: 'over' | 'under' | 'exact'
  depletion_events: number         // pos_stock_adjustments recipe_depletion row count for this ingredient
}

export interface AvTProductResult {
  product_id: string
  product_name: string
  recipe_id: string
  recipe_name: string
  units_sold: number
  theoretical_cost_dollars: number | null  // null if any ingredient has no resolved cost
  actual_cost_dollars: number | null
  gap_dollars: number | null               // + = under-spent vs spec; − = over-spent; null if costs unknown
  gap_pct: number | null                   // gap_dollars / actual_cost × 100
  revenue_dollars: number | null
  food_cost_pct: number | null             // actual_ingredient_cost / revenue × 100
  ingredients: AvTIngredientLine[]
  status: 'computed' | 'no_sales' | 'depletion_not_tracked' | 'no_linked_ingredients'
  thin_data: boolean
  thin_reason: string | null
}

export interface AvTResult {
  period_label: string
  computed_at: string
  product_results: AvTProductResult[]
  recipes_unlinked: number          // recipes that exist but have no product_id or linked_product_id
  total_gap_dollars: number | null  // summed across all computed products; null if no costed results
}

/** cost_cents (CENTS) → dollars takes priority over cost_per_unit (already dollars). */
function ingUnitCost(cost_cents: number | null, cost_per_unit: number | null): number | null {
  if (cost_cents != null) return round2(Number(cost_cents) / 100)
  if (cost_per_unit != null) return round2(Number(cost_per_unit))
  return null
}

export async function computeAvT(
  sb: SupabaseClient,
  businessId: string,
  outletId: string | null,
  rangeStart: string,
  rangeEnd: string,
  periodLabel: string,
): Promise<AvTResult> {
  // 1. Active recipes for this business
  const { data: allRecipes } = await sb.from('recipes')
    .select('id, name, product_id, linked_product_id')
    .eq('business_id', businessId).is('deleted_at', null).eq('is_active', true)
  const recipes = (allRecipes ?? []) as Array<{ id: string; name: string; product_id: string | null; linked_product_id: string | null }>
  const linked = recipes.filter(r => r.product_id || r.linked_product_id)
  const unlinkCount = recipes.length - linked.length

  if (!linked.length) {
    return { period_label: periodLabel, computed_at: new Date().toISOString(), product_results: [], recipes_unlinked: unlinkCount, total_gap_dollars: null }
  }

  // 2. Units sold + revenue per linked-product in period (completed sales only, excl. voided)
  const linkedPids = linked.map(r => (r.product_id ?? r.linked_product_id) as string)
  const { data: saleRows } = await sb.from('pos_sale_items')
    .select('product_id, quantity, returned_quantity, line_total, pos_sales!inner(business_id, created_at, status)')
    .eq('pos_sales.business_id', businessId).neq('pos_sales.status', 'voided')
    .gte('pos_sales.created_at', rangeStart).lte('pos_sales.created_at', rangeEnd)
    .in('product_id', linkedPids).limit(40000)
  const soldMap = new Map<string, { units: number; revenue: number }>()
  for (const it of (saleRows ?? []) as Array<{ product_id: string | null; quantity: number | null; returned_quantity: number | null; line_total: number | null }>) {
    if (!it.product_id) continue
    const net = (Number(it.quantity) || 0) - (Number(it.returned_quantity) || 0)
    if (net <= 0) continue
    const cur = soldMap.get(it.product_id) ?? { units: 0, revenue: 0 }
    cur.units += net; cur.revenue += Number(it.line_total) || 0
    soldMap.set(it.product_id, cur)
  }

  // 3. Recipe ingredients for all linked recipes
  const recipeIds = linked.map(r => r.id)
  const { data: ingsRaw } = await sb.from('recipe_ingredients')
    .select('recipe_id, product_id, ingredient_name, quantity, unit, cost_cents, cost_per_unit, wastage_pct')
    .in('recipe_id', recipeIds)
  const ingsByRecipe = new Map<string, Array<Record<string, unknown>>>()
  for (const i of (ingsRaw ?? []) as Array<Record<string, unknown>>) {
    const rid = i.recipe_id as string
    const arr = ingsByRecipe.get(rid) ?? []; arr.push(i); ingsByRecipe.set(rid, arr)
  }

  // 4. Actual depletion (recipe_depletion adjustments + waste log) for ingredient products in period
  const ingPids = [...new Set((ingsRaw ?? []).map((i: Record<string, unknown>) => i.product_id as string | null).filter(Boolean) as string[])]
  const depMap = new Map<string, { qty: number; events: number }>()
  const wasteQtyMap = new Map<string, number>()
  if (ingPids.length) {
    let dq = sb.from('pos_stock_adjustments')
      .select('product_id, adjustment_qty')
      .eq('business_id', businessId).ilike('reason', 'recipe_depletion%')
      .gte('created_at', rangeStart).lte('created_at', rangeEnd)
      .in('product_id', ingPids).limit(10000)
    if (outletId) dq = dq.eq('outlet_id', outletId)
    const { data: depRows } = await dq
    for (const d of (depRows ?? []) as Array<{ product_id: string; adjustment_qty: number }>) {
      const cur = depMap.get(d.product_id) ?? { qty: 0, events: 0 }
      cur.qty += Math.abs(Number(d.adjustment_qty) || 0); cur.events++
      depMap.set(d.product_id, cur)
    }
    const { data: wRows } = await sb.from('pos_waste_log')
      .select('product_id, quantity')
      .eq('business_id', businessId).gte('recorded_at', rangeStart).lte('recorded_at', rangeEnd)
      .in('product_id', ingPids).limit(5000)
    for (const w of (wRows ?? []) as Array<{ product_id: string | null; quantity: number }>) {
      if (!w.product_id) continue
      wasteQtyMap.set(w.product_id, (wasteQtyMap.get(w.product_id) ?? 0) + (Number(w.quantity) || 0))
    }
  }

  // 5. Per-recipe AvT computation
  const product_results: AvTProductResult[] = []
  let totalGap = 0; let hasGapData = false

  for (const recipe of linked) {
    const pid = (recipe.product_id ?? recipe.linked_product_id) as string
    const sold = soldMap.get(pid)
    const ings = ingsByRecipe.get(recipe.id) ?? []
    const linkedIngs = ings.filter(i => i.product_id)

    if (!sold || sold.units === 0) {
      product_results.push({
        product_id: pid, product_name: pid, recipe_id: recipe.id, recipe_name: recipe.name,
        units_sold: 0, theoretical_cost_dollars: null, actual_cost_dollars: null, gap_dollars: null,
        gap_pct: null, revenue_dollars: null, food_cost_pct: null, ingredients: [],
        status: 'no_sales', thin_data: false, thin_reason: 'No sales in this period',
      }); continue
    }
    if (!linkedIngs.length) {
      product_results.push({
        product_id: pid, product_name: pid, recipe_id: recipe.id, recipe_name: recipe.name,
        units_sold: sold.units, theoretical_cost_dollars: null, actual_cost_dollars: null, gap_dollars: null,
        gap_pct: null, revenue_dollars: round2(sold.revenue), food_cost_pct: null, ingredients: [],
        status: 'no_linked_ingredients', thin_data: false, thin_reason: 'No stock-linked ingredients in recipe',
      }); continue
    }

    const hasDepletion = linkedIngs.some(i => (depMap.get(i.product_id as string)?.events ?? 0) > 0)
    const ingLines: AvTIngredientLine[] = []
    let theoCost = 0; let actualCost = 0; let gapCost = 0; let allCosts = true

    for (const ing of linkedIngs) {
      const ingPid = ing.product_id as string
      const unitCost = ingUnitCost(ing.cost_cents as number | null, ing.cost_per_unit as number | null)
      const wasteMult = 1 + (Number(ing.wastage_pct) || 0) / 100
      const theoQty = round2((Number(ing.quantity) || 0) * wasteMult * sold.units)
      const actualQty = round2((depMap.get(ingPid)?.qty ?? 0) + (wasteQtyMap.get(ingPid) ?? 0))
      const gapQty = round2(theoQty - actualQty)
      const gapDollars = unitCost != null ? round2(gapQty * unitCost) : null
      const direction: 'over' | 'under' | 'exact' = Math.abs(gapQty) < 0.001 ? 'exact' : gapQty > 0 ? 'under' : 'over'
      if (unitCost != null) {
        theoCost = round2(theoCost + round2(theoQty * unitCost))
        actualCost = round2(actualCost + round2(actualQty * unitCost))
        gapCost = round2(gapCost + (gapDollars ?? 0))
      } else { allCosts = false }
      ingLines.push({
        ingredient_id: ingPid, ingredient_name: (ing.ingredient_name as string | null) ?? 'Ingredient',
        unit: (ing.unit as string) || '', theoretical_qty: theoQty, actual_qty: actualQty, gap_qty: gapQty,
        unit_cost_dollars: unitCost, gap_dollars: gapDollars, direction,
        depletion_events: depMap.get(ingPid)?.events ?? 0,
      })
    }

    const theoCostFinal = allCosts ? round2(theoCost) : null
    const actualCostFinal = allCosts ? round2(actualCost) : null
    const gapDollarsFinal = allCosts ? round2(gapCost) : null
    const totalDepEvents = ingLines.reduce((s, l) => s + l.depletion_events, 0)
    const expectedEvents = sold.units * linkedIngs.length
    const thinData = !hasDepletion || totalDepEvents < expectedEvents * 0.5
    const thinReason = !hasDepletion
      ? 'No depletion events for this period — INV-7 recipe depletion may not have run for these sales yet'
      : thinData
        ? `Only ${totalDepEvents} depletion event${totalDepEvents !== 1 ? 's' : ''} recorded vs ${sold.units} unit${sold.units !== 1 ? 's' : ''} sold — AvT may understate actual consumption`
        : null
    const foodCostPct = actualCostFinal != null && sold.revenue > 0 ? round2((actualCostFinal / sold.revenue) * 100) : null
    const gapPct = gapDollarsFinal != null && actualCostFinal != null && actualCostFinal > 0 ? round2((gapDollarsFinal / actualCostFinal) * 100) : null

    if (gapDollarsFinal != null) { totalGap = round2(totalGap + gapDollarsFinal); hasGapData = true }
    product_results.push({
      product_id: pid, product_name: pid, recipe_id: recipe.id, recipe_name: recipe.name,
      units_sold: sold.units, theoretical_cost_dollars: theoCostFinal, actual_cost_dollars: actualCostFinal,
      gap_dollars: gapDollarsFinal, gap_pct: gapPct, revenue_dollars: round2(sold.revenue),
      food_cost_pct: foodCostPct, ingredients: ingLines,
      status: hasDepletion ? 'computed' : 'depletion_not_tracked',
      thin_data: thinData, thin_reason: thinReason,
    })
  }

  // 6. Resolve real product names (initial value was placeholder pid)
  const allPids = product_results.map(r => r.product_id).filter(Boolean)
  if (allPids.length) {
    const { data: prods } = await sb.from('pos_products').select('id, name').in('id', allPids)
    const pnames = new Map((prods ?? []).map(p => [p.id as string, p.name as string]))
    for (const r of product_results) { const n = pnames.get(r.product_id); if (n) r.product_name = n }
  }

  return {
    period_label: periodLabel, computed_at: new Date().toISOString(),
    product_results, recipes_unlinked: unlinkCount,
    total_gap_dollars: hasGapData ? round2(totalGap) : null,
  }
}
