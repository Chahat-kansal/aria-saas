import { callAnthropic } from '@/lib/aria/providers/anthropic'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { parseLLMJsonOr } from '@/lib/ai-json'

export type ActionType =
  | 'bulk_price_update'
  | 'mark_products'
  | 'adjust_stock'
  | 'apply_category_discount'
  | 'set_low_stock_threshold'
  | 'create_promotion'
  | 'create_roster'
  | 'create_invoice'

export interface PlannedAction {
  type: ActionType
  title: string
  description: string
  preview: string[]
  affected_count: number
  payload: Record<string, unknown>
  estimated_impact: string
  reversible: boolean
  risk: 'low' | 'medium' | 'high'
  requires_confirmation: true
}

const PLANNER_SYSTEM = `You are Aria's action planner for an Australian business POS system.
The user wants to take an action. Plan it precisely and safely.

SUPPORTED ACTIONS (return one of these types):
  bulk_price_update    — change prices for products (by category, brand, or all)
  mark_products        — set is_active, age_restricted on products
  adjust_stock         — add/subtract/set stock_quantity on products
  apply_category_discount — apply a % discount to all products in a POS category (payload: name [string — promo name], category_id [string — UUID from POS Categories list; match the category the owner names, case-insensitive], category_name [string — human-readable name], discount_percent [number — e.g. 10 for 10%], starts_at [YYYY-MM-DD — today's date], ends_at? [YYYY-MM-DD], active_days? [number[] — ISO day numbers same as create_promotion])
  set_low_stock_threshold — update low_stock_threshold for products
  create_promotion     — create a promotion rule saved to pos_promotions (payload: name, promotion_type ["percentage_discount"|"fixed_discount"|"bogo"|"bundle"|"multibuy"], discount_amount [number — the discount value in % for percentage_discount or $ for fixed_discount], starts_at [YYYY-MM-DD — MUST use the provided today's date as base; never use a past date or the wrong year], ends_at? [YYYY-MM-DD], min_spend? [number], active_days? [number[] — ISO day numbers: 1=Mon 2=Tue 3=Wed 4=Thu 5=Fri 6=Sat 7=Sun; include ONLY if the promo targets specific days, e.g. "Thursday Special" → [4], "weekdays" → [1,2,3,4,5]; omit for all-day promos], product_ids? [string[] — UUIDs from the product list above; include ONLY if the owner names specific products by name, match the UUID exactly], category? [string for category-scoped promos], notes? [string])
  create_roster        — draft a staff roster for a week (payload: name, week_start YYYY-MM-DD, week_end?, notes?)
  create_invoice       — draft a client invoice (payload: customer_name, customer_email?, due_date?, items:[{description,quantity,unit_price}], notes?; amounts in DOLLARS)

DEFAULTS — when required fields are missing, DO NOT ask a question. Fill in the most sensible default and surface it in preview[] as "Assumed X (adjustable)" so the owner sees what was assumed before confirming:
  create_promotion missing promotion_type → use "percentage_discount"
  create_promotion missing discount_amount → use 10 (i.e. 10%)
  create_promotion missing starts_at → use today's date from context (IMPORTANT: today's year is provided — always use that year, never output a past date)
  apply_category_discount missing discount_percent → use 10 (i.e. 10%)
  apply_category_discount missing starts_at → use today's date from context
  bulk_price_update missing percentage → use 5 (5% increase, conservative)
  adjust_stock missing quantity → use 1

ABSOLUTE RULE: ALWAYS return valid JSON — never ask the user a question, never refuse, never explain why you can't plan. If something is ambiguous, pick the safest sensible default and note it in preview[].

HARD RULES:
  1. Never plan an action that would destroy data (no deletes).
  2. For price changes: flag if new price < cost_price (selling at a loss).
  3. For stock: only add/subtract/set — never negative stock.
  4. Always set reversible: true for price/stock changes (we store before state).
  5. risk = 'high' if action affects >50 products OR changes prices >20% OR affects all products.
  6. requires_confirmation must always be true.

Return ONLY valid JSON matching this shape:
{"type":"...","title":"...","description":"...","preview":["..."],"affected_count":0,"payload":{},"estimated_impact":"...","reversible":true,"risk":"low|medium|high","requires_confirmation":true}`

const CONFIRM_WORDS = ['yes', 'confirm', 'do it', 'go ahead', 'execute', 'proceed', 'yep', 'yeah', 'sure', 'ok']
export function isConfirmation(message: string): boolean {
  const lower = message.toLowerCase().trim()
  return CONFIRM_WORDS.some(w => lower === w || lower.startsWith(w + ' ') || lower.endsWith(' ' + w))
}

export async function planAction(
  userMessage: string,
  businessId: string,
): Promise<PlannedAction | null> {
  const [productsQ, staffQ, categoriesQ] = await Promise.all([
    supabaseAdmin.from('pos_products')
      .select('id,name,category,brand,price,cost_price,stock_quantity,is_active,age_restricted')
      .eq('business_id', businessId).eq('is_active', true).limit(200),
    supabaseAdmin.from('staff_members')
      .select('id,first_name,last_name,position')
      .eq('business_id', businessId).eq('status', 'active').limit(50),
    supabaseAdmin.from('pos_categories')
      .select('id,name')
      .eq('business_id', businessId).order('name'),
  ])

  const products = productsQ.data ?? []
  const staff = staffQ.data ?? []
  const categories = (categoriesQ.data ?? []) as Array<{ id: string; name: string }>

  const todayISO = new Date().toISOString().slice(0, 10)
  const contextSummary = `Today's date: ${todayISO}
Current products (sample): ${JSON.stringify(products.slice(0, 20))}
Total active products: ${products.length}
Categories: ${[...new Set(products.map((p: Record<string,unknown>) => p.category).filter(Boolean))].join(', ')}
Brands: ${[...new Set(products.map((p: Record<string,unknown>) => p.brand).filter(Boolean))].slice(0, 10).join(', ')}
Staff: ${(staff as Array<Record<string,unknown>>).map(s => `${s.first_name} ${s.last_name} (${s.position})`).join(', ')}
POS Categories (id → name, for apply_category_discount): ${JSON.stringify(categories.map(c => ({ id: c.id, name: c.name })))}`

  const result = await callAnthropic<PlannedAction>(
    {
      model: 'sonnet',
      systemPrompt: PLANNER_SYSTEM,
      userPrompt: `User request: "${userMessage}"\n\nBusiness context:\n${contextSummary}\n\nPlan this action precisely. Use today's date (${todayISO}) when resolving relative dates like "next Tuesday". ALWAYS return valid JSON with sensible defaults — do not ask questions.`,
      maxTokens: 1000,
      businessId,
      agentKey: 'ask_aria',
      role: 'chat',
    },
    { type: 'bulk_price_update', title: '', description: '', preview: [], affected_count: 0, payload: {}, estimated_impact: '', reversible: false, risk: 'low', requires_confirmation: true },
  )

  const planned = parseLLMJsonOr<Partial<PlannedAction>>(result.raw, {}, 'action-planner/plan')
  if (!planned.type) return null

  // BUG 2 FIX: clamp starts_at to a future date — the LLM sometimes outputs a past date
  // or wrong year. We check server-side and correct it.
  if (planned.payload && typeof planned.payload === 'object') {
    const p = planned.payload as Record<string, unknown>
    if (p.starts_at && typeof p.starts_at === 'string') {
      const asDate = new Date(p.starts_at)
      const today = new Date(todayISO)
      if (isNaN(asDate.getTime()) || asDate < today) {
        p.starts_at = todayISO
      }
    }
  }

  return { ...(planned as PlannedAction), requires_confirmation: true }
}
