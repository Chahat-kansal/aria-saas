import { callModel } from '@/lib/ai/gateway'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { parseLLMJsonOr } from '@/lib/ai-json'

export type ActionType =
  | 'bulk_price_update'
  | 'mark_products'
  | 'adjust_stock'
  | 'apply_category_discount'
  | 'set_low_stock_threshold'
  | 'create_promotion'
  | 'update_promotion'
  | 'create_roster'
  | 'create_invoice'
  | 'approve_po_draft'
  | 'create_agent' // MS13 phase 4 — staged by the composer lane (deterministic), executed on confirm

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

SUPPORTED ACTIONS (return one of these types). The payload keys below are EXACT — use these literal key names and value sets, never synonyms (do NOT use "operation", "product_ids" for single-product, "is_active" as a top-level key, "adjustment_type", "percentage", or a nested "filter" object):
  bulk_price_update    — change prices for products (payload: category? [string — exact category name], brand? [string], price_change_type ["set"|"increase_pct"|"decrease_pct"|"increase_abs"|"decrease_abs"], price_change_value [number]. e.g. "increase all prices 10%" → {price_change_type:"increase_pct", price_change_value:10}; "$2 off the Coffee category" → {category:"Coffee", price_change_type:"decrease_abs", price_change_value:2})
  mark_products        — activate/deactivate or age-restrict products (payload: product_ids? [string[] — UUIDs], category? [string], brand? [string], field ["is_active"|"age_restricted"], value [boolean]. e.g. "deactivate X" → {product_ids:["<uuid>"], field:"is_active", value:false})
  adjust_stock         — add/subtract/set stock for ONE product (payload: product_id? [string — UUID] OR product_name? [string], adjust_type ["set"|"add"|"subtract"], quantity [number]. e.g. "set stock of X to 50" → {product_id:"<uuid>", adjust_type:"set", quantity:50}; "remove 3 from X" → {adjust_type:"subtract", quantity:3})
  apply_category_discount — apply a % discount to all products in a POS category (payload: name [string — promo name], category_id [string — UUID from POS Categories list; match the category the owner names, case-insensitive], category_name [string — human-readable name], discount_percent [number — e.g. 10 for 10%], starts_at [YYYY-MM-DD — today's date], ends_at? [YYYY-MM-DD], active_days? [number[] — ISO day numbers same as create_promotion])
  set_low_stock_threshold — update low_stock_threshold for products (payload: category? [string — exact category name], brand? [string], threshold [number]. Do NOT nest in a "filter" object.)
  create_promotion     — create a promotion rule saved to pos_promotions (payload: name, promotion_type ["percentage_discount"|"fixed_discount"|"bogo"|"bundle"|"multibuy"], discount_amount [number — the discount value in % for percentage_discount or $ for fixed_discount], starts_at [YYYY-MM-DD — MUST use the provided today's date as base; never use a past date or the wrong year], ends_at? [YYYY-MM-DD], min_spend? [number], active_days? [number[] — ISO day numbers: 1=Mon 2=Tue 3=Wed 4=Thu 5=Fri 6=Sat 7=Sun; include ONLY if the promo targets specific days, e.g. "Thursday Special" → [4], "weekdays" → [1,2,3,4,5]; omit for all-day promos], product_ids? [string[] — UUIDs from the product list above; include ONLY if the owner names specific products by name, match the UUID exactly], category? [string for category-scoped promos], notes? [string])
  update_promotion     — EDIT an EXISTING promotion (payload: promotion_id [string — the LAST_PROMOTION id from context], discount_percent? [number, for a % promo], discount_amount? [number, for a $ promo], bundle_price? [number], ends_at? [YYYY-MM-DD], active? [boolean]). USE THIS — never create a second promo — when the owner adjusts the promo just created/discussed: "actually make it 15%", "change it to 20%", "make it $5 instead", "end it Friday", "turn it off". Map the new number into the field that matches the existing promo's type.
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
  7. Check PAST PERFORMANCE BY CATEGORY in the business context before planning. If the category this
     action falls under has weight <= 0.8 (a real track record of backfiring — the neutral starting
     weight is 1.0), be more conservative — prefer a smaller change, a shorter time window, or a
     narrower scope than you otherwise would, and name the past result in preview[] (e.g. "Note:
     pricing changes have backfired before — starting smaller than usual"). Weight > 0.8 needs no
     special caution.

Return ONLY valid JSON matching this shape:
{"type":"...","title":"...","description":"...","preview":["..."],"affected_count":0,"payload":{},"estimated_impact":"...","reversible":true,"risk":"low|medium|high","requires_confirmation":true}`

const CONFIRM_WORDS = ['yes', 'confirm', 'do it', 'go ahead', 'execute', 'proceed', 'yep', 'yeah', 'sure', 'ok']
export function isConfirmation(message: string): boolean {
  const lower = message.toLowerCase().trim()
  return CONFIRM_WORDS.some(w => lower === w || lower.startsWith(w + ' ') || lower.endsWith(' ' + w))
}

export interface PlanContext {
  recentTurns?: string[]
  lastPromotion?: { id: string; name: string; promotion_type: string; value: number | null } | null
}

export async function planAction(
  userMessage: string,
  businessId: string,
  ctx?: PlanContext,
): Promise<PlannedAction | null> {
  const [productsQ, staffQ, categoriesQ, weightsQ] = await Promise.all([
    supabaseAdmin.from('pos_products')
      .select('id,name,category,brand,price,cost_price,stock_quantity,is_active,age_restricted')
      .eq('business_id', businessId).eq('is_active', true).limit(200),
    supabaseAdmin.from('staff_members')
      .select('id,first_name,last_name,position')
      .eq('business_id', businessId).eq('status', 'active').limit(50),
    supabaseAdmin.from('pos_categories')
      .select('id,name')
      .eq('business_id', businessId).order('name'),
    // INTEL-OUTCOME-2 Part 4 — the LEARN half of the loop. adjustAdviceWeight() (outcome-learning.ts)
    // already updates this table from real measured outcomes; hypothesis/generate.ts already reads
    // it into its own prompt. This planner — the thing that actually decides what to DO next time the
    // owner asks for a price/promo/stock action — never did, so a learned "pricing has backfired
    // before" weight had no way to change future advice for the one action type that's ever produced
    // real organic outcomes. Same query shape as hypothesis/generate.ts's existing read.
    supabaseAdmin.from('aria_advice_weights').select('category,weight,positive_outcomes,negative_outcomes').eq('business_id', businessId),
  ])

  const products = productsQ.data ?? []
  const staff = staffQ.data ?? []
  const categories = (categoriesQ.data ?? []) as Array<{ id: string; name: string }>
  const weights = weightsQ.data ?? []

  // INTEL-OUTCOME-2 Part 4 — same "avoid low weight / favour high weight" framing already proven in
  // hypothesis/generate.ts's prompt, so a real backfired outcome actually changes what this planner
  // proposes next time, not just what the nightly hypothesis generator suggests.
  const weightLines = weights.length > 0
    ? (weights as Array<{ category: string; weight: number; positive_outcomes: number; negative_outcomes: number }>)
        .map(w => `${w.category}: weight ${w.weight} (${w.positive_outcomes}+ ${w.negative_outcomes}-)`)
    : ['no prior outcome data']

  const todayISO = new Date().toISOString().slice(0, 10)
  const contextSummary = `Today's date: ${todayISO}
Current products (sample): ${JSON.stringify(products.slice(0, 20))}
Total active products: ${products.length}
Categories: ${[...new Set(products.map((p: Record<string,unknown>) => p.category).filter(Boolean))].join(', ')}
Brands: ${[...new Set(products.map((p: Record<string,unknown>) => p.brand).filter(Boolean))].slice(0, 10).join(', ')}
Staff: ${(staff as Array<Record<string,unknown>>).map(s => `${s.first_name} ${s.last_name} (${s.position})`).join(', ')}
POS Categories (id → name, for apply_category_discount): ${JSON.stringify(categories.map(c => ({ id: c.id, name: c.name })))}
PAST PERFORMANCE BY CATEGORY (advice weight — how this business's past actions in each category actually turned out): ${weightLines.join('; ')}${ctx?.lastPromotion ? `
LAST_PROMOTION (the promo just created/discussed — for "actually make it X"/"change it to X" use update_promotion with this id): ${JSON.stringify(ctx.lastPromotion)}` : ''}${ctx?.recentTurns?.length ? `
RECENT_CONVERSATION (resolve "it"/"that promo"/"her favourite"/"actually" against this — most recent last):
${ctx.recentTurns.slice(-10).join('\n')}` : ''}`

  // M13 phase 5 — through the gateway. Same sonnet, same prompt; businessId is now required at
  // the boundary rather than optional, so this call cannot silently miss the ledger.
  const result = await callModel<PlannedAction>(
    {
      model: 'sonnet',
      systemPrompt: PLANNER_SYSTEM,
      userPrompt: `User request: "${userMessage}"\n\nBusiness context:\n${contextSummary}\n\nPlan this action precisely. Use today's date (${todayISO}) when resolving relative dates like "next Tuesday". If the request EDITS the LAST_PROMOTION (e.g. "actually make it 15%", "change it to 20%", "make it $5 instead") return update_promotion with that promotion_id — NEVER create a second promo and NEVER switch to bulk_price_update. ALWAYS return valid JSON with sensible defaults — do not ask questions.`,
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
