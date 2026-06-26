import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveOutletId, adjustOutletStock } from '@/lib/inventory/outlet-stock'
import { resolveCostFor } from '@/lib/inventory/resolve-cost'

// INV-7 — fresh / production. The "sale is the sensor": selling (or prepping) a recipe-linked made-item depletes
// its INGREDIENTS from stock via the CANONICAL adjustOutletStock (same path INV-2/4/5/6 use), attributed, FEFO
// (earliest-expiry batch first). End-of-day markdown is PROPOSED from real expiry × pos_eod_markdown_rules (never
// auto-applied). Temp/compliance is logged + surfaced. Reuses recipes/recipe_ingredients/pos_product_batches/
// pos_eod_markdown_rules — no parallel tables. CENTS-SAFE: recipe(_ingredients).cost_cents is CENTS (÷100 → $);
// pos_products.price / cost are DOLLARS. GROUNDING-TEETH: only deplete what the recipe specifies (linked
// product_id); no recipe / unlinked ingredient → no phantom depletion, flagged.

const round2 = (n: number) => Math.round(n * 100) / 100

// ── recipe depletion (FEFO) ───────────────────────────────────────────────────────────────────────────────
export interface DepleteLine { product_id: string; name: string; depleted: number; new_on_hand: number | null; unit_cost: number | null; value: number | null; fefo_batch: string | null; fefo_expiry: string | null }
export interface DepleteResult { depleted: boolean; reason: string | null; source: string; recipe_id: string | null; lines: DepleteLine[]; total_value: number; skipped_unlinked: number }

/** FEFO-consume `amount` of a product's batches (earliest expiry_date first); returns the first batch touched. */
async function fefoConsume(sb: SupabaseClient, businessId: string, outletId: string | null, productId: string, amount: number): Promise<{ ref: string | null; expiry: string | null }> {
  let q = sb.from('pos_product_batches').select('id, batch_ref, expiry_date, quantity_remaining')
    .eq('business_id', businessId).eq('product_id', productId).gt('quantity_remaining', 0)
    .order('expiry_date', { ascending: true, nullsFirst: false }).limit(50)
  if (outletId) q = q.eq('outlet_id', outletId)
  const { data: batches } = await q
  if (!batches?.length) return { ref: null, expiry: null }
  let remaining = Math.ceil(amount)
  const first = { ref: batches[0].batch_ref as string | null, expiry: batches[0].expiry_date as string | null }
  for (const b of batches) {
    if (remaining <= 0) break
    const take = Math.min(remaining, Number(b.quantity_remaining) || 0)
    if (take <= 0) continue
    await sb.from('pos_product_batches').update({ quantity_remaining: (Number(b.quantity_remaining) || 0) - take, updated_at: new Date().toISOString() }).eq('id', b.id)
    remaining -= take
  }
  return first
}

async function ingredientUnitCost(sb: SupabaseClient, businessId: string, ing: { cost_cents: number | null; cost_per_unit: number | null; product_id: string }, outletId: string | null): Promise<number | null> {
  if (ing.cost_cents != null) return round2(Number(ing.cost_cents) / 100)  // CENTS → dollars
  if (ing.cost_per_unit != null) return round2(Number(ing.cost_per_unit)) // already dollars
  try { const rc = await resolveCostFor(sb, businessId, ing.product_id, outletId); return rc.cost } catch { return null }
}

/** Core: deplete a recipe's linked ingredients × `multiplier`. Canonical + attributed + FEFO. Never depletes an
 *  unlinked ingredient (product_id null) — counts it as skipped (no phantom). */
async function depleteRecipe(sb: SupabaseClient, businessId: string, outletId: string | null, recipeId: string, multiplier: number, source: string, staffName: string): Promise<DepleteResult> {
  const { data: ings } = await sb.from('recipe_ingredients')
    .select('product_id, ingredient_name, quantity, unit, cost_cents, cost_per_unit, wastage_pct').eq('recipe_id', recipeId)
  const all = ings ?? []
  const linked = all.filter(i => i.product_id)
  const skippedUnlinked = all.length - linked.length
  if (!linked.length) return { depleted: false, reason: 'recipe has no stock-linked ingredients', source, recipe_id: recipeId, lines: [], total_value: 0, skipped_unlinked: skippedUnlinked }

  const lines: DepleteLine[] = []
  let totalValue = 0
  const nowIso = new Date().toISOString()
  for (const ing of linked) {
    const pid = ing.product_id as string
    const wastage = 1 + (Number(ing.wastage_pct) || 0) / 100
    const amount = round2((Number(ing.quantity) || 0) * multiplier * wastage)
    if (amount <= 0) continue
    const fefo = await fefoConsume(sb, businessId, outletId, pid, amount)
    const newOnHand = outletId ? await adjustOutletStock(sb, { businessId, outletId, productId: pid, delta: -amount }) : null
    if (outletId) await sb.from('pos_stock_adjustments').insert({ business_id: businessId, product_id: pid, outlet_id: outletId, adjustment_qty: -amount, reason: `recipe_depletion:${source}`, adjusted_by: staffName })
    const unitCost = await ingredientUnitCost(sb, businessId, { cost_cents: ing.cost_cents as number | null, cost_per_unit: ing.cost_per_unit as number | null, product_id: pid }, outletId)
    const value = unitCost != null ? round2(unitCost * amount) : null
    if (value != null) totalValue = round2(totalValue + value)
    lines.push({ product_id: pid, name: (ing.ingredient_name as string) ?? 'Ingredient', depleted: amount, new_on_hand: newOnHand, unit_cost: unitCost, value, fefo_batch: fefo.ref, fefo_expiry: fefo.expiry })
    void nowIso
  }
  return { depleted: true, reason: null, source, recipe_id: recipeId, lines, total_value: totalValue, skipped_unlinked: skippedUnlinked }
}

/** Sale is the sensor — a completed sale of a recipe-linked made-item depletes its ingredients. No recipe → no
 *  phantom depletion (flagged). Find the recipe by product_id OR linked_product_id. */
export async function depleteForSale(sb: SupabaseClient, businessId: string, outletIdIn: string | null, madeProductId: string, qtySold: number, staffName: string): Promise<DepleteResult> {
  const outletId = await resolveOutletId(sb, businessId, outletIdIn)
  const { data: recipe } = await sb.from('recipes').select('id')
    .eq('business_id', businessId).is('deleted_at', null).eq('is_active', true)
    .or(`product_id.eq.${madeProductId},linked_product_id.eq.${madeProductId}`).limit(1).maybeSingle()
  if (!recipe?.id) return { depleted: false, reason: 'no recipe linked to this product', source: 'sale', recipe_id: null, lines: [], total_value: 0, skipped_unlinked: 0 }
  return depleteRecipe(sb, businessId, outletId, recipe.id as string, Math.max(1, Math.round(qtySold)), 'sale', staffName)
}

/** Manual prep — staff prepping N batches of a recipe depletes its ingredients now. */
export async function depleteForPrep(sb: SupabaseClient, businessId: string, outletIdIn: string | null, recipeId: string, batches: number, staffName: string): Promise<DepleteResult> {
  const outletId = await resolveOutletId(sb, businessId, outletIdIn)
  return depleteRecipe(sb, businessId, outletId, recipeId, Math.max(1, Math.round(batches)), 'prep', staffName)
}

/** Recipe list (made-items with a recipe) for the Production tile. cents → dollars for any money. */
export async function listRecipes(sb: SupabaseClient, businessId: string): Promise<Array<{ id: string; name: string; serves: number; cost: number | null; ingredients: number; linked: number }>> {
  const { data: recipes } = await sb.from('recipes').select('id, name, serves, cost_cents, cost_per_serve').eq('business_id', businessId).is('deleted_at', null).eq('is_active', true).limit(200)
  const ids = (recipes ?? []).map(r => r.id as string)
  const counts = new Map<string, { total: number; linked: number }>()
  if (ids.length) {
    const { data: ings } = await sb.from('recipe_ingredients').select('recipe_id, product_id').in('recipe_id', ids)
    for (const i of ings ?? []) { const k = i.recipe_id as string; const c = counts.get(k) ?? { total: 0, linked: 0 }; c.total++; if (i.product_id) c.linked++; counts.set(k, c) }
  }
  return (recipes ?? []).map(r => ({
    id: r.id as string, name: (r.name as string) ?? 'Recipe', serves: Number(r.serves) || 1,
    cost: r.cost_cents != null ? round2(Number(r.cost_cents) / 100) : (r.cost_per_serve != null ? round2(Number(r.cost_per_serve)) : null), // cents→$ or $
    ingredients: counts.get(r.id as string)?.total ?? 0, linked: counts.get(r.id as string)?.linked ?? 0,
  }))
}

// ── markdown (PROPOSE only) ───────────────────────────────────────────────────────────────────────────────
export interface MarkdownProposal { product_id: string; name: string; batch_ref: string | null; expiry_date: string; days_left: number; current_price: number; discount_pct: number; marked_price: number; rule_name: string }
/** Expiring batches (≤ tomorrow) × an active markdown rule (category/day/time) → a grounded proposal. Never
 *  auto-applies; staff applies through the existing pricing flow. No rule match → not proposed (no fabrication). */
export async function proposeMarkdowns(sb: SupabaseClient, businessId: string, outletIdIn: string | null): Promise<{ proposals: MarkdownProposal[]; rules: number; expiring: number }> {
  const outletId = await resolveOutletId(sb, businessId, outletIdIn)
  const todayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(new Date())
  const tomorrow = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(new Date(Date.now() + 86400_000))
  const dow = (new Date().getDay() + 6) % 7 + 1 // 1=Mon..7=Sun

  const { data: rules } = await sb.from('pos_eod_markdown_rules').select('name, trigger_time, discount_pct, category_id, days_of_week, is_active').eq('business_id', businessId).eq('is_active', true)
  const activeRules = (rules ?? []).filter(r => {
    const days = Array.isArray(r.days_of_week) ? (r.days_of_week as unknown[]).map(Number) : null
    return !days || days.length === 0 || days.includes(dow)
  })
  let exq = sb.from('pos_product_batches').select('product_id, batch_ref, expiry_date, quantity_remaining').eq('business_id', businessId).eq('expiry_tracked', true).gt('quantity_remaining', 0).lte('expiry_date', tomorrow)
  if (outletId) exq = exq.eq('outlet_id', outletId)
  const { data: batches } = await exq
  if (!activeRules.length || !(batches ?? []).length) return { proposals: [], rules: activeRules.length, expiring: (batches ?? []).length }

  const pids = [...new Set((batches ?? []).map(b => b.product_id as string))]
  const { data: prods } = await sb.from('pos_products').select('id, name, price, category_id').in('id', pids)
  const pmap = new Map((prods ?? []).map(p => [p.id as string, p]))
  const proposals: MarkdownProposal[] = []
  for (const b of batches ?? []) {
    const p = pmap.get(b.product_id as string); if (!p) continue
    // rule match: a category rule for this product's category, else a global (null category) rule. Most-specific first.
    const rule = activeRules.find(r => r.category_id && r.category_id === p.category_id) ?? activeRules.find(r => !r.category_id)
    if (!rule) continue
    const price = Number(p.price) || 0
    const pct = Number(rule.discount_pct) || 0
    const expiry = b.expiry_date as string
    const daysLeft = Math.round((new Date(`${expiry}T00:00:00+10:00`).getTime() - new Date(`${todayKey}T00:00:00+10:00`).getTime()) / 86400_000)
    proposals.push({ product_id: p.id as string, name: (p.name as string) ?? 'Item', batch_ref: (b.batch_ref as string | null) ?? null, expiry_date: expiry, days_left: daysLeft, current_price: round2(price), discount_pct: pct, marked_price: round2(price * (1 - pct / 100)), rule_name: (rule.name as string) ?? 'EOD markdown' })
  }
  return { proposals, rules: activeRules.length, expiring: (batches ?? []).length }
}

// ── temp / compliance ─────────────────────────────────────────────────────────────────────────────────────
export async function logTemp(sb: SupabaseClient, businessId: string, outletIdIn: string | null, location: string, readingC: number, thresholdC: number | null, staffId: string, staffName: string): Promise<{ ok: boolean; passed: boolean; id: string | null }> {
  const outletId = await resolveOutletId(sb, businessId, outletIdIn)
  const passed = thresholdC == null ? true : readingC <= thresholdC
  const { data, error } = await sb.from('pos_temperature_logs').insert({
    business_id: businessId, outlet_id: outletId, location: location.trim() || 'Fridge', reading_c: readingC, threshold_c: thresholdC, passed, logged_by: staffId, logged_by_name: staffName,
  }).select('id').maybeSingle()
  return { ok: !error, passed, id: (data?.id as string | null) ?? null }
}

/** INV-6 reuse — if no temp has been logged today, raise a 'temp' compliance task (idempotent, once/day). */
export async function ensureTempTask(sb: SupabaseClient, businessId: string, outletIdIn?: string | null): Promise<{ added: boolean }> {
  const outletId = await resolveOutletId(sb, businessId, outletIdIn ?? null)
  const todayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(new Date())
  const { logged_today } = await tempStatus(sb, businessId, outletId)
  if (logged_today) return { added: false }
  const { data: existing } = await sb.from('inventory_tasks').select('id').eq('business_id', businessId).eq('due_date', todayKey).eq('task_type', 'temp').limit(1).maybeSingle()
  if (existing?.id) return { added: false }
  const { error } = await sb.from('inventory_tasks').insert({
    business_id: businessId, outlet_id: outletId, task_type: 'temp', product_id: null,
    title: 'Log fridge & food temps', detail: 'AU food-safety — daily temperature check',
    hypothesis: 'No temperature logged today — record fridge/display/freezer readings (pass = within the safe threshold).',
    priority: 28, generated_by: 'aria', due_date: todayKey,
  })
  return { added: !error }
}

export interface TempStatus { logged_today: boolean; failed_today: number; recent: Array<{ location: string; reading_c: number; passed: boolean; logged_at: string; by: string | null }> }
export async function tempStatus(sb: SupabaseClient, businessId: string, outletIdIn: string | null): Promise<TempStatus> {
  const outletId = await resolveOutletId(sb, businessId, outletIdIn)
  const todayStart = new Date(`${new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(new Date())}T00:00:00+10:00`).toISOString()
  let q = sb.from('pos_temperature_logs').select('location, reading_c, passed, logged_at, logged_by_name').eq('business_id', businessId).order('logged_at', { ascending: false }).limit(20)
  if (outletId) q = q.eq('outlet_id', outletId)
  const { data } = await q
  const rows = data ?? []
  const today = rows.filter(r => (r.logged_at as string) >= todayStart)
  return {
    logged_today: today.length > 0,
    failed_today: today.filter(r => r.passed === false).length,
    recent: rows.slice(0, 6).map(r => ({ location: r.location as string, reading_c: Number(r.reading_c), passed: !!r.passed, logged_at: r.logged_at as string, by: (r.logged_by_name as string | null) ?? null })),
  }
}
