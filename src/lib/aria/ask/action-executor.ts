import { createHash } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabaseAdmin } from '@/lib/supabase-admin'
import type { PlannedAction } from './action-planner'
import { buildPromotionRow, normalisePromoKind } from './promotion-writer'
import { adjustOutletStock, setOutletStock, resolveOutletId } from '@/lib/inventory/outlet-stock'
import { onActionExecuted } from '@/lib/aria/hypothesis/outcome-learning'

// ASK-ARIA-CONSOLIDATE-2 (RC2/RC6): executor-level safety thresholds. These are the BACKSTOP — a mass write or
// an absurd quantity must be explicitly confirmed (payload.confirm_mass) before it executes, so prompt-injection
// that fools the planner still cannot push an unconfirmed catalog-wide mutation through the executor.
const MASS_MUTATION_THRESHOLD = 20      // RC2: >20 resolved products ⇒ require explicit confirm
const ADD_STOCK_CLAMP = 100_000         // RC6: a single add bigger than this ⇒ require explicit confirm

// BUGFIX-ASKARIA-RC4: DB-enforced idempotent promo insert. The executor-local 60s read-dedup (below) is a cheap
// fast-path for sequential double-clicks, but it RACES under true concurrency (5 simultaneous creates all read
// "none exists" then all insert → 5 rows). The durable invariant is the DB: a deterministic idempotency_key
// (business + normalized-name + type + value + scope + coarse 60s bucket) guarded by a PARTIAL UNIQUE INDEX. The
// first concurrent insert wins; the racers hit 23505 and we return the winner's row (idempotent success). Other
// promo paths (dashboard/POS) write NO key → the partial index ignores them (RULE 0). The coarse time bucket
// means a deliberate re-creation in a later minute has a different key and is allowed.
function promoIdempotencyKey(businessId: string, row: Record<string, unknown>): string {
  const bucket = Math.floor(Date.now() / 60_000)
  const norm = String(row.name ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
  const val = row.discount_percent ?? row.discount_amount ?? row.bundle_price ?? null
  const scope = JSON.stringify({ a: row.applies_to ?? null, c: row.category_id ?? null, p: row.product_ids ?? [] })
  return createHash('sha256').update([businessId, norm, row.promotion_type, String(val), scope, bucket].join('|')).digest('hex').slice(0, 40)
}

async function insertPromotionIdempotent(
  supabase: SupabaseClient, businessId: string, row: Record<string, unknown>,
): Promise<{ ok: true; id: string; name: string; deduped: boolean } | { ok: false; error: string }> {
  const idemKey = promoIdempotencyKey(businessId, row)
  const { data, error } = await supabase.from('pos_promotions').insert({ ...row, idempotency_key: idemKey }).select('id,name').maybeSingle()
  if (error) {
    // 23505 = the partial-unique race: another concurrent create with the same key already landed. Return it.
    if (error.code === '23505') {
      const { data: existing } = await supabase.from('pos_promotions').select('id,name')
        .eq('business_id', businessId).eq('idempotency_key', idemKey).maybeSingle()
      if (existing) return { ok: true, id: existing.id as string, name: existing.name as string, deduped: true }
    }
    return { ok: false, error: error.message }
  }
  if (!data) return { ok: false, error: 'Failed to create promotion' }
  return { ok: true, id: data.id as string, name: data.name as string, deduped: false }
}

export interface ExecutionResult {
  ok: boolean
  affected_count: number
  error?: string
  // ASK-ARIA-CONSOLIDATE-1 (RC3): surfaced so the caller never reports a success it didn't achieve.
  failed_count?: number
  warning?: string
  // ASK-ARIA-CONSOLIDATE-2 (RC2/RC6): the write was REFUSED pending an explicit confirmation of scale.
  requires_mass_confirm?: boolean
  affected_preview?: number
  action_log_id?: string
  // INTEL-OUTCOME-2 Part 1 — the aria_actions row's own id, so the caller (and onActionExecuted,
  // wired in Part 2) can reference this specific recommendation later. Previously this insert never
  // returned its id at all, so nothing downstream could ever link an outcome to it.
  aria_action_id?: string
  rollback_available: boolean
  rollback_expires_at?: string
}

// INTEL-OUTCOME-2 Part 1 — every action type here was previously recorded with a hardcoded
// category:'sales' regardless of what it actually did (a stock adjustment, a roster draft, and a
// price change were all indistinguishable to advice_weights/hypothesis generation, which key
// entirely off category). Real category per action.type, so a recommendation is durably captured in
// a way that can be MEANINGFULLY matched to a decision and an outcome, not just matched by id.
const CATEGORY_BY_ACTION_TYPE: Record<PlannedAction['type'], string> = {
  bulk_price_update: 'sales',
  create_promotion: 'sales',
  apply_category_discount: 'sales',
  update_promotion: 'sales',
  mark_products: 'inventory',
  adjust_stock: 'inventory',
  set_low_stock_threshold: 'inventory',
  create_roster: 'staffing',
  create_invoice: 'invoicing',
  approve_po_draft: 'inventory',
}

// ── ASK-ARIA-FORTRESS failsafes ─────────────────────────────────────────────────────────────────────────
// PILLAR 1 (kill switch): when ON, every WRITE action is refused at the single chokepoint (executeAction).
// PILLAR 3 (role gate): destructive/mass actions require a privileged role, not just a confirm.
const PRIVILEGED_ROLES = new Set(['owner', 'manager', 'admin'])
const DESTRUCTIVE_ACTION_TYPES = new Set(['bulk_price_update', 'mark_products', 'set_low_stock_threshold'])

/** Kill switch: env break-glass overrides; else feature_flags 'aria_actions_kill' (global or per-business).
 *  Fails OPEN (a transient flag-read error never blocks legit actions — the env var is the reliable kill). */
async function isActionsKilled(supabase: SupabaseClient, businessId: string): Promise<boolean> {
  if (process.env.ARIA_ACTIONS_KILL === '1') return true
  try {
    const { data } = await supabase.from('feature_flags')
      .select('is_globally_enabled, enabled_for_business_ids')
      .eq('flag_key', 'aria_actions_kill').maybeSingle()
    if (!data) return false
    if (data.is_globally_enabled === true) return true
    return ((data.enabled_for_business_ids as string[] | null) ?? []).includes(businessId)
  } catch { return false }
}

/** PILLAR 2: append-only audit row for a refused/failed attempt (success rows are written inside runAction). */
async function appendActionLog(
  supabase: SupabaseClient, businessId: string, action: PlannedAction, userId: string,
  conversationId: string | undefined, messageExcerpt: string | undefined, outcome: string, error?: string,
): Promise<void> {
  try {
    await supabase.from('aria_action_log').insert({
      business_id: businessId, action_type: action.type, entity_type: 'action',
      entity_ids: [], before_state: {}, after_state: { outcome, error: error ?? null },
      triggered_by: 'ask_aria', user_id: userId, conversation_id: conversationId ?? null,
      message_excerpt: messageExcerpt?.slice(0, 200) ?? null, executed_at: new Date().toISOString(),
    })
  } catch { /* logging must never break the action path */ }
}

/**
 * The single chokepoint for EVERY Ask Aria write. Layers the failsafes in front of the action runner:
 *   1) kill switch (refuse all writes when flipped — reads are unaffected, they don't come through here)
 *   2) role gate (destructive/mass actions need owner/manager/admin)
 *   3) the action runs; success logs inside runAction, failures/refusals log here (complete append-only audit)
 * actorRole defaults to 'owner' so existing callers (the owner dashboard chat) are unchanged (RULE 0).
 */
export async function executeAction(
  action: PlannedAction,
  businessId: string,
  userId: string,
  conversationId?: string,
  messageExcerpt?: string,
  actorRole?: string,
): Promise<ExecutionResult> {
  const supabase = supabaseAdmin

  // PILLAR 1 — kill switch (one chokepoint; nothing bypasses it).
  if (await isActionsKilled(supabase, businessId)) {
    await appendActionLog(supabase, businessId, action, userId, conversationId, messageExcerpt, 'refused', 'kill_switch')
    return { ok: false, affected_count: 0, error: 'Ask Aria actions are currently disabled.', rollback_available: false }
  }

  // PILLAR 3 — role gate on destructive/mass actions.
  const role = (actorRole ?? 'owner').toLowerCase()
  if (DESTRUCTIVE_ACTION_TYPES.has(action.type) && !PRIVILEGED_ROLES.has(role)) {
    await appendActionLog(supabase, businessId, action, userId, conversationId, messageExcerpt, 'refused', 'role')
    return { ok: false, affected_count: 0, error: 'This action needs a manager or owner — ask one of them to run it.', rollback_available: false }
  }

  // PILLAR 2 — run, then log any non-mass-confirm failure (success rows are written inside runAction).
  const result = await runAction(action, businessId, userId, conversationId, messageExcerpt)
  if (!result.ok && !result.requires_mass_confirm) {
    await appendActionLog(supabase, businessId, action, userId, conversationId, messageExcerpt, 'failed', result.error)
  }
  return result
}

async function runAction(
  action: PlannedAction,
  businessId: string,
  userId: string,
  conversationId?: string,
  messageExcerpt?: string,
): Promise<ExecutionResult> {
  const supabase = supabaseAdmin
  let affectedCount = 0
  let failedCount = 0
  let beforeState: Record<string, unknown> = {}
  let afterState: Record<string, unknown> = {}
  let entityIds: string[] = []
  let entityType = 'pos_products'

  // BUGFIX-ASKARIA-ACTION-ROUTING / cold-path coverage: the LLM planner emits VARYING payload key shapes
  // (product_ids vs product_id, operation vs adjust_type, is_active vs field/value, adjustment_type+percentage
  // vs price_change_type+price_change_value, filter.category vs category). Normalise them to the canonical
  // shape the cases below read, so a cold create/adjust/mark from natural language actually writes (instead of
  // silently no-op'ing or, worse, falling through to an unscoped all-products mutation). Additive + defensive.
  ;(() => {
    const p = action.payload as Record<string, unknown>
    if (!p || typeof p !== 'object') return
    const flt = (p.filter && typeof p.filter === 'object') ? p.filter as Record<string, unknown> : null
    if (p.category == null && flt?.category != null) p.category = flt.category
    if (p.brand == null && flt?.brand != null) p.brand = flt.brand
    if (action.type === 'adjust_stock') {
      if (p.product_id == null && Array.isArray(p.product_ids) && p.product_ids.length) p.product_id = p.product_ids[0]
      if (p.adjust_type == null && p.operation != null) p.adjust_type = p.operation
    }
    if (action.type === 'mark_products' && p.field == null) {
      if (p.is_active !== undefined) { p.field = 'is_active'; p.value = p.is_active }
      else if (p.age_restricted !== undefined) { p.field = 'age_restricted'; p.value = p.age_restricted }
    }
    if (action.type === 'bulk_price_update') {
      if (p.price_change_value == null) p.price_change_value = p.percentage ?? p.value ?? p.new_price ?? p.amount
      if (p.price_change_type == null) {
        const at = String(p.adjustment_type ?? p.operation ?? p.direction ?? '').toLowerCase()
        const dec = /decrease|reduce|lower|cut|discount|off\b/.test(at) || (typeof messageExcerpt === 'string' && /\b(decrease|reduce|lower|cut|drop)\b/i.test(messageExcerpt))
        if (at === 'set' || p.new_price != null) p.price_change_type = 'set'
        else if (at.includes('percent') || (typeof p.percentage === 'number')) p.price_change_type = dec ? 'decrease_pct' : 'increase_pct'
        else if (at) p.price_change_type = dec ? 'decrease_abs' : 'increase_abs'
      }
    }
  })()

  // RC2 BACKSTOP: refuse an unconfirmed mass mutation (resolved row count over the threshold). Code-level —
  // prompt-injection can fool the planner into PLANNING "set all prices to 0", but it cannot make the executor
  // execute it without payload.confirm_mass set by a real second confirmation.
  const confirmMass = (action.payload as Record<string, unknown>)?.confirm_mass === true
  const massBlock = (count: number): ExecutionResult | null =>
    count > MASS_MUTATION_THRESHOLD && !confirmMass
      ? { ok: false, affected_count: 0, requires_mass_confirm: true, affected_preview: count, error: `This will change ${count} products — reply "confirm" to proceed.`, rollback_available: false }
      : null

  try {
    switch (action.type) {
      case 'bulk_price_update': {
        const { category, brand, price_change_type, price_change_value } = action.payload as {
          category?: string; brand?: string
          price_change_type: 'set' | 'increase_pct' | 'decrease_pct' | 'increase_abs' | 'decrease_abs'
          price_change_value: number
        }
        let q = supabase.from('pos_products')
          .select('id,name,price,cost_price')
          .eq('business_id', businessId).eq('is_active', true)
        if (category) q = q.eq('category', category)
        if (brand) q = q.eq('brand', brand)
        const { data: targets } = await q.limit(500)
        if (!targets?.length) return { ok: false, affected_count: 0, error: 'No matching products found', rollback_available: false }
        { const mb = massBlock(targets.length); if (mb) return mb }

        beforeState = { products: targets.map((p: Record<string,unknown>) => ({ id: p.id, name: p.name, price: p.price })) }
        entityIds = targets.map((p: Record<string,unknown>) => String(p.id))

        for (const product of targets as Array<Record<string,unknown>>) {
          const currentPrice = Number(product.price) || 0
          const costPrice = Number(product.cost_price) || 0
          let newPrice: number
          switch (price_change_type) {
            case 'set': newPrice = Number(price_change_value); break
            case 'increase_pct': newPrice = currentPrice * (1 + Number(price_change_value) / 100); break
            case 'decrease_pct': newPrice = currentPrice * (1 - Number(price_change_value) / 100); break
            case 'increase_abs': newPrice = currentPrice + Number(price_change_value); break
            case 'decrease_abs': newPrice = currentPrice - Number(price_change_value); break
            default: newPrice = currentPrice
          }
          newPrice = Math.max(costPrice, +(newPrice).toFixed(2))
          // RC3: check the write — only count rows that actually updated.
          const { error: updErr } = await supabase.from('pos_products')
            .update({ price: newPrice, updated_at: new Date().toISOString() })
            .eq('id', String(product.id)).eq('business_id', businessId)
          if (updErr) { failedCount++; continue }
          affectedCount++
        }
        if (affectedCount === 0 && failedCount > 0) return { ok: false, affected_count: 0, failed_count: failedCount, error: `All ${failedCount} price updates failed.`, rollback_available: false }
        afterState = { price_change_type, price_change_value, affected: affectedCount, failed: failedCount }
        break
      }

      case 'mark_products': {
        const { category, brand, product_ids, field, value } = action.payload as {
          category?: string; brand?: string; product_ids?: string[]
          field: 'is_active' | 'age_restricted'; value: boolean
        }
        let q = supabase.from('pos_products').select('id,name').eq('business_id', businessId)
        if (product_ids?.length) q = q.in('id', product_ids)
        else if (category) q = q.eq('category', category)
        else if (brand) q = q.eq('brand', brand)
        const { data: targets } = await q.limit(500)
        if (!targets?.length) return { ok: false, affected_count: 0, error: 'No matching products', rollback_available: false }
        { const mb = massBlock(targets.length); if (mb) return mb }

        entityIds = targets.map((p: Record<string,unknown>) => String(p.id))
        beforeState = { field, previous_value: !value, products: targets.map((p: Record<string,unknown>) => p.name) }

        const { error: markErr } = await supabase.from('pos_products')
          .update({ [field]: value, updated_at: new Date().toISOString() })
          .in('id', entityIds).eq('business_id', businessId)
        if (markErr) return { ok: false, affected_count: 0, error: `Update failed: ${markErr.message}`, rollback_available: false }
        affectedCount = targets.length
        afterState = { field, new_value: value, affected: affectedCount }
        break
      }

      case 'adjust_stock': {
        const { product_id, product_name, adjust_type, quantity } = action.payload as {
          product_id?: string; product_name?: string
          adjust_type: 'add' | 'subtract' | 'set'; quantity: number
        }
        let productQ = supabase.from('pos_products')
          .select('id,name,stock_quantity').eq('business_id', businessId)
        if (product_id) productQ = productQ.eq('id', product_id)
        else if (product_name) productQ = productQ.ilike('name', `%${product_name}%`)
        const { data: targets } = await productQ.limit(10)
        if (!targets?.length) return { ok: false, affected_count: 0, error: 'Product not found', rollback_available: false }

        // RC6: an absurd single add (e.g. +999999) must be explicitly confirmed.
        if (adjust_type === 'add' && (Number(quantity) || 0) > ADD_STOCK_CLAMP && !confirmMass) {
          return { ok: false, affected_count: 0, requires_mass_confirm: true, affected_preview: Number(quantity) || 0, error: `Adding ${Number(quantity) || 0} units is unusually large — reply "confirm" to proceed.`, rollback_available: false }
        }
        entityIds = targets.map((p: Record<string,unknown>) => String(p.id))
        // RC2 (INV spine): stock lives in pos_outlet_inventory.items_on_hand (canonical, per-outlet), NOT
        // pos_products.stock_quantity. We also mirror stock_quantity so legacy reads stay in sync (additive).
        // RC1: 'set' goes through setOutletStock — a SINGLE atomic absolute UPDATE (set_numeric RPC) so two
        // concurrent "set 50" both land on 50 (no lost update). 'add'/'subtract' use the atomic delta RPCs.
        const adjOutletId = await resolveOutletId(supabase, businessId, null)
        const stockMoves: Array<Record<string, unknown>> = []
        for (const p of targets as Array<Record<string,unknown>>) {
          const pid = String(p.id)
          if (!adjOutletId) { failedCount++; continue }
          const amt = Number(quantity) || 0
          let prev = 0, newQty = 0
          if (adjust_type === 'set') {
            const res = await setOutletStock(supabase, { businessId, outletId: adjOutletId, productId: pid, target: amt })
            if (!res) { failedCount++; continue }
            prev = res.previous; newQty = res.new
          } else {
            const { data: invRow } = await supabase.from('pos_outlet_inventory').select('items_on_hand')
              .eq('business_id', businessId).eq('product_id', pid).eq('outlet_id', adjOutletId).maybeSingle()
            prev = invRow ? Number(invRow.items_on_hand) || 0 : 0
            const intendedDelta = adjust_type === 'add' ? amt : -amt
            const post = intendedDelta !== 0 ? await adjustOutletStock(supabase, { businessId, outletId: adjOutletId, productId: pid, delta: intendedDelta }) : prev
            if (post == null) { failedCount++; continue }
            newQty = post
          }
          const actualDelta = newQty - prev
          // attributed audit row (text adjusted_by — pos_stock_adjustments.adjusted_by is text)
          if (actualDelta !== 0) {
            await supabase.from('pos_stock_adjustments').insert({
              business_id: businessId, product_id: pid, outlet_id: adjOutletId,
              adjustment_qty: actualDelta, reason: 'ask_aria_adjust', adjusted_by: 'Ask Aria',
            })
          }
          await supabase.from('pos_products').update({ stock_quantity: newQty, updated_at: new Date().toISOString() }).eq('id', pid).eq('business_id', businessId)
          stockMoves.push({ product_id: pid, name: p.name, from: prev, to: newQty, delta: actualDelta })
          affectedCount++
        }
        beforeState = { products: stockMoves.map(m => ({ id: m.product_id, name: m.name, stock: m.from })) }
        if (affectedCount === 0) return { ok: false, affected_count: 0, failed_count: failedCount, error: 'Could not adjust stock — no outlet resolved for this business.', rollback_available: false }
        afterState = { adjust_type, quantity, affected: affectedCount, canonical: 'items_on_hand', moves: stockMoves }
        break
      }

      case 'set_low_stock_threshold': {
        const { category, brand, threshold } = action.payload as {
          category?: string; brand?: string; threshold: number
        }
        let q = supabase.from('pos_products').select('id,name').eq('business_id', businessId).eq('is_active', true)
        if (category) q = q.eq('category', category)
        if (brand) q = q.eq('brand', brand)
        const { data: targets } = await q.limit(500)
        if (!targets?.length) return { ok: false, affected_count: 0, error: 'No matching products', rollback_available: false }
        { const mb = massBlock(targets.length); if (mb) return mb }

        entityIds = targets.map((p: Record<string,unknown>) => String(p.id))
        beforeState = { threshold_set: threshold, products: targets.map((p: Record<string,unknown>) => p.name) }

        const { error: thrErr } = await supabase.from('pos_products')
          .update({ low_stock_threshold: Number(threshold), updated_at: new Date().toISOString() })
          .in('id', entityIds).eq('business_id', businessId)
        if (thrErr) return { ok: false, affected_count: 0, error: `Update failed: ${thrErr.message}`, rollback_available: false }
        affectedCount = targets.length
        afterState = { new_threshold: threshold, affected: affectedCount }
        break
      }

      case 'create_roster': {
        const { name, week_start, notes } = action.payload as {
          name?: string; week_start: string; notes?: string
        }
        if (!week_start) return { ok: false, affected_count: 0, error: 'week_start required', rollback_available: false }
        entityType = 'pos_rosters'
        // RC2: pos_rosters has NO `name`/`week_end`/`notes` columns. Required: outlet_id + shifts (jsonb).
        // Resolve the business's default outlet; an empty draft roster (owner fills shifts) is valid.
        const rosterOutlet = await resolveOutletId(supabase, businessId, null)
        if (!rosterOutlet) return { ok: false, affected_count: 0, error: 'No outlet found for this business — set up an outlet before drafting a roster.', rollback_available: false }
        const { data: roster, error: rosterErr } = await supabase.from('pos_rosters').insert({
          business_id: businessId,
          outlet_id: rosterOutlet,
          week_start,
          shifts: [],
          status: 'draft',
          published: false,
          generated_by_agent: true,
          aria_reasoning: notes ?? (name ? `Draft: ${name}` : null),
          total_cost_cents: 0,
          total_hours: 0,
          updated_at: new Date().toISOString(),
        }).select('id').single()
        if (rosterErr || !roster) return { ok: false, affected_count: 0, error: rosterErr?.message ?? 'Failed to create roster', rollback_available: false }
        entityIds = [roster.id]
        affectedCount = 1
        afterState = { roster_id: roster.id, name: name ?? null, week_start, status: 'draft' }
        break
      }

      case 'create_invoice': {
        const { customer_name, customer_email, due_date, items, notes } = action.payload as {
          customer_name: string
          customer_email?: string
          due_date?: string
          items?: Array<{ description: string; quantity: number; unit_price: number }>
          notes?: string
        }
        if (!customer_name) return { ok: false, affected_count: 0, error: 'customer_name required', rollback_available: false }
        entityType = 'invoices'
        // RC5 ATOMICITY: validate EVERY line BEFORE creating the invoice, so a bad line can never leave an
        // orphan invoice (invoices is soft-delete-only — an orphan can't be cleaned up). Reject up-front.
        for (const it of (items ?? [])) {
          if (!it || typeof it.description !== 'string' || !it.description.trim()) {
            return { ok: false, affected_count: 0, error: 'Every invoice line needs a description — nothing was saved.', rollback_available: false }
          }
          if (!(Number(it.quantity) > 0) || !(Number(it.unit_price) >= 0)) {
            return { ok: false, affected_count: 0, error: 'Every invoice line needs a positive quantity and a non-negative price — nothing was saved.', rollback_available: false }
          }
        }
        // RC2: real columns are bill_to_name/bill_to_email + gst_total (NOT customer_name/customer_email/
        // tax_amount). Line items require gst_applicable + line_subtotal + line_gst (all NOT NULL).
        const lineItems = (items ?? []).map((it, idx) => {
          const qty = Number(it.quantity) || 1
          const unit = Number(it.unit_price) || 0
          const lineSubtotal = Math.round(qty * unit * 100) / 100
          const lineGst = Math.round(lineSubtotal * 0.1 * 100) / 100
          return {
            description: it.description,
            quantity: qty,
            unit_price: unit,
            gst_applicable: true,
            line_subtotal: lineSubtotal,
            line_gst: lineGst,
            line_total: Math.round((lineSubtotal + lineGst) * 100) / 100,
            position: idx,
          }
        })
        const subtotal = lineItems.reduce((s, it) => s + it.line_subtotal, 0)
        const gstTotal = Math.round(lineItems.reduce((s, it) => s + it.line_gst, 0) * 100) / 100
        const total = Math.round((subtotal + gstTotal) * 100) / 100

        const invoiceNumber = 'INV-' + new Date().getFullYear() + '-' + String(Date.now()).slice(-5)
        const { data: invoice, error: invErr } = await supabase.from('invoices').insert({
          business_id: businessId,
          invoice_number: invoiceNumber,
          bill_to_name: customer_name,
          bill_to_email: customer_email ?? null,
          due_date: due_date ?? null,
          subtotal,
          gst_total: gstTotal,
          total,
          status: 'draft',
          notes: notes ?? null,
          ai_generated: true,
          updated_at: new Date().toISOString(),
        }).select('id').single()
        if (invErr || !invoice) return { ok: false, affected_count: 0, error: invErr?.message ?? 'Failed to create invoice', rollback_available: false }

        if (lineItems.length) {
          const { error: liErr } = await supabase.from('invoice_line_items').insert(
            lineItems.map(it => ({ ...it, invoice_id: invoice.id, business_id: businessId }))
          )
          if (liErr) return { ok: false, affected_count: 1, error: `Invoice created but line items failed: ${liErr.message}`, rollback_available: false }
        }

        entityIds = [invoice.id]
        affectedCount = 1
        afterState = { invoice_id: invoice.id, invoice_number: invoiceNumber, customer_name, total, status: 'draft' }
        break
      }

      case 'create_promotion': {
        const {
          name, promotion_type, discount_amount,
          starts_at, ends_at, min_spend,
          active_days, product_ids, category_id, buy_quantity, get_quantity, notes,
        } = action.payload as {
          name: string; promotion_type: string
          discount_amount?: number
          starts_at?: string; ends_at?: string; min_spend?: number
          active_days?: Array<number | string>
          product_ids?: string[]
          category_id?: string; buy_quantity?: number; get_quantity?: number; notes?: string
        }
        if (!name || !promotion_type) {
          return { ok: false, affected_count: 0, error: 'name and promotion_type are required', rollback_available: false }
        }
        // RC1: ALL pos_promotions writes go through the validated buildPromotionRow — it sets the columns the
        // discount engine actually reads per type, and refuses to write a dead/unusable promo.
        const kind = normalisePromoKind(promotion_type)
        if (!kind) return { ok: false, affected_count: 0, error: `Unknown promotion type "${promotion_type}". Use percentage, fixed, bogo, or bundle.`, rollback_available: false }

        // Day-name → ISO number (1=Mon … 7=Sun); also infer a single day from the promo name.
        const DAY_NAME_TO_ISO: Record<string, number> = {
          monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 7,
          mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 7,
        }
        const resolvedActiveDays: number[] | null = active_days && active_days.length > 0
          ? active_days.map(d => typeof d === 'string' ? (DAY_NAME_TO_ISO[d.toLowerCase()] ?? Number(d)) : Number(d)).filter(n => n >= 1 && n <= 7)
          : null
        const inferredDaysFromName = ((): number[] | null => {
          if (resolvedActiveDays) return null
          const lower = name.toLowerCase()
          for (const [dayName, isoNum] of Object.entries(DAY_NAME_TO_ISO)) if (lower.includes(dayName)) return [isoNum]
          return null
        })()
        const finalActiveDays = resolvedActiveDays ?? inferredDaysFromName

        entityType = 'pos_promotions'
        const built = buildPromotionRow({
          businessId, name, kind,
          value: discount_amount,
          scope: category_id ? 'category' : (product_ids && product_ids.length ? 'product' : 'all'),
          categoryId: category_id ?? null,
          productIds: product_ids ?? null,
          startsAt: starts_at ?? null, endsAt: ends_at ?? null, minSpend: min_spend ?? null,
          activeDays: finalActiveDays, buyQuantity: buy_quantity, getQuantity: get_quantity, notes: notes ?? null,
        })
        if (!built.ok) return { ok: false, affected_count: 0, error: built.error, rollback_available: false }

        // RC4 IDEMPOTENCY: a re-fire of the same promo (same name + type) within 60s returns the existing row
        // instead of writing a duplicate. Covers double-click / retry-after-timeout. (The route also clears
        // pending_action after a confirm, so the confirm path can't double-execute.)
        const promoDedupeSince = new Date(Date.now() - 60_000).toISOString()
        const { data: dupPromo } = await supabase.from('pos_promotions').select('id,name')
          .eq('business_id', businessId).eq('name', built.row.name as string).eq('promotion_type', built.row.promotion_type as string)
          .gte('created_at', promoDedupeSince).order('created_at', { ascending: false }).limit(1).maybeSingle()
        if (dupPromo) {
          entityIds = [(dupPromo as { id: string }).id]; affectedCount = 1; beforeState = {}
          afterState = { promotion_id: (dupPromo as { id: string }).id, name: (dupPromo as { name: string }).name, deduped: true }
          break
        }

        // RC4: DB-enforced idempotent insert (partial-unique key + 23505 catch) — the durable backstop for the
        // concurrency race the 60s read-dedup above can't close.
        const promoIns = await insertPromotionIdempotent(supabase, businessId, built.row as Record<string, unknown>)
        if (!promoIns.ok) {
          return { ok: false, affected_count: 0, error: promoIns.error ?? 'Failed to create promotion', rollback_available: false }
        }
        const promo = { id: promoIns.id, name: promoIns.name }
        entityIds = [promo.id]
        affectedCount = 1
        beforeState = {}
        afterState = {
          promotion_id: promo.id,
          name: promo.name,
          deduped: promoIns.deduped,
          promotion_type: built.row.promotion_type,
          discount_percent: built.row.discount_percent ?? null,
          discount_amount: built.row.discount_amount ?? null,
          bundle_price: built.row.bundle_price ?? null,
          active: true,
          active_days: built.row.active_days,
          product_ids: built.row.product_ids,
        }
        break
      }

      case 'apply_category_discount': {
        const {
          category_id, category_name, discount_percent,
          starts_at, ends_at, active_days, name, notes,
        } = action.payload as {
          category_id: string; category_name?: string
          discount_percent?: number
          starts_at?: string; ends_at?: string
          active_days?: number[]
          name?: string; notes?: string
        }
        if (!category_id) {
          return { ok: false, affected_count: 0, error: 'category_id is required for apply_category_discount', rollback_available: false }
        }

        // Verify category belongs to this business
        const { data: catRow } = await supabase.from('pos_categories')
          .select('id,name').eq('id', category_id).eq('business_id', businessId).maybeSingle()
        if (!catRow) {
          const { data: allCats } = await supabase.from('pos_categories')
            .select('name').eq('business_id', businessId).order('name')
          const catList = (allCats ?? []).map((c: Record<string,unknown>) => String(c.name)).join(', ')
          return { ok: false, affected_count: 0, error: `Category not found. Available categories: ${catList || 'none'}`, rollback_available: false }
        }

        const DAY_NAME_TO_ISO_CAT: Record<string, number> = {
          monday: 1, tuesday: 2, wednesday: 3, thursday: 4,
          friday: 5, saturday: 6, sunday: 7,
          mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 7,
        }
        const resolvedCatDays: number[] | null = active_days && active_days.length > 0
          ? active_days.map(d => typeof d === 'string'
              ? (DAY_NAME_TO_ISO_CAT[(d as string).toLowerCase()] ?? Number(d))
              : Number(d)).filter(n => n >= 1 && n <= 7)
          : null

        const pct = Number(discount_percent ?? 10)
        const promoName = name ?? `${catRow.name} ${pct}% off`

        entityType = 'pos_promotions'
        // RC1: same validated writer — category-scoped percentage promo.
        const catBuilt = buildPromotionRow({
          businessId, name: promoName, kind: 'percentage', value: pct,
          scope: 'category', categoryId: category_id,
          startsAt: starts_at ?? null, endsAt: ends_at ?? null,
          activeDays: resolvedCatDays, notes: notes ?? null,
        })
        if (!catBuilt.ok) return { ok: false, affected_count: 0, error: catBuilt.error, rollback_available: false }

        // RC4: same DB-enforced idempotent insert as create_promotion.
        const catIns = await insertPromotionIdempotent(supabase, businessId, catBuilt.row as Record<string, unknown>)
        if (!catIns.ok) {
          return { ok: false, affected_count: 0, error: catIns.error ?? 'Failed to create category promotion', rollback_available: false }
        }
        const catPromo = { id: catIns.id, name: catIns.name }
        entityIds = [catPromo.id]
        affectedCount = 1
        beforeState = {}
        afterState = {
          promotion_id: catPromo.id,
          deduped: catIns.deduped,
          name: (catPromo as { name: string }).name,
          promotion_type: 'percentage_discount',
          discount_percent: pct,
          applies_to: 'category',
          category_id,
          category_name: category_name ?? (catRow as { name: string }).name,
          active: true,
          active_days: resolvedCatDays ?? [1, 2, 3, 4, 5, 6, 7],
        }
        break
      }

      case 'update_promotion': {
        // RC3: edit an EXISTING promo ("actually make it 15%") instead of creating a duplicate. Updates only
        // the value column that matches the promo's existing type, validated the same way buildPromotionRow is.
        const { promotion_id, discount_percent, discount_amount, bundle_price, ends_at, active } = action.payload as {
          promotion_id?: string; discount_percent?: number; discount_amount?: number; bundle_price?: number; ends_at?: string; active?: boolean
        }
        if (!promotion_id) return { ok: false, affected_count: 0, error: 'promotion_id required to update a promotion', rollback_available: false }
        entityType = 'pos_promotions'
        const { data: existing } = await supabase.from('pos_promotions')
          .select('id,name,promotion_type,discount_percent,discount_amount,bundle_price,active')
          .eq('id', promotion_id).eq('business_id', businessId).maybeSingle()
        if (!existing) return { ok: false, affected_count: 0, error: 'That promotion was not found.', rollback_available: false }
        beforeState = { id: existing.id, promotion_type: existing.promotion_type, discount_percent: existing.discount_percent, discount_amount: existing.discount_amount, bundle_price: existing.bundle_price }
        const ptype = existing.promotion_type as string
        const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
        // A bare numeric edit ("make it 15") resolves against the promo's OWN type.
        const numericEdit = discount_percent ?? discount_amount
        if (ptype === 'percentage_discount') {
          const v = Number(discount_percent ?? numericEdit)
          if (discount_percent != null || (discount_amount == null && numericEdit != null)) {
            if (!(v > 0 && v <= 100)) return { ok: false, affected_count: 0, error: 'A percentage discount must be between 1 and 100.', rollback_available: false }
            patch.discount_percent = v; patch.value = v
          }
        } else if (ptype === 'fixed_discount') {
          const v = Number(discount_amount ?? numericEdit)
          if (discount_amount != null || numericEdit != null) {
            if (!(v > 0)) return { ok: false, affected_count: 0, error: 'A $-off discount must be greater than 0.', rollback_available: false }
            patch.discount_amount = v; patch.value = v
          }
        } else if (ptype === 'bundle' || ptype === 'combo') {
          const v = Number(bundle_price ?? numericEdit)
          if (bundle_price != null || numericEdit != null) {
            if (!(v > 0)) return { ok: false, affected_count: 0, error: 'A bundle price must be greater than 0.', rollback_available: false }
            patch.bundle_price = v
          }
        }
        if (ends_at !== undefined) patch.ends_at = ends_at
        if (active !== undefined) { patch.active = active; patch.is_active = active }
        if (Object.keys(patch).length <= 1) return { ok: false, affected_count: 0, error: 'Nothing to change on that promotion — tell me the new value.', rollback_available: false }
        const { error: upErr } = await supabase.from('pos_promotions').update(patch).eq('id', promotion_id).eq('business_id', businessId)
        if (upErr) return { ok: false, affected_count: 0, error: `Update failed: ${upErr.message}`, rollback_available: false }
        entityIds = [promotion_id]
        affectedCount = 1
        afterState = { promotion_id, name: existing.name, ...patch }
        break
      }

      case 'approve_po_draft': {
        // INV-AGENT-1: approve a purchase_order_drafts row (AI-generated replenishment draft).
        // NEVER sends to supplier — just sets status='approved' for the owner to act on.
        const draftId = (action.payload as Record<string, unknown>).draft_id as string | undefined
        if (!draftId) return { ok: false, affected_count: 0, error: 'No draft_id in payload.', rollback_available: false }

        const { data: draft, error: draftErr } = await supabase.from('purchase_order_drafts')
          .select('id, status, total_cost_cents, items')
          .eq('id', draftId).eq('business_id', businessId).maybeSingle()

        if (draftErr || !draft) return { ok: false, affected_count: 0, error: 'Draft not found.', rollback_available: false }
        if ((draft.status as string) !== 'pending_approval') {
          return { ok: false, affected_count: 0, error: `Draft is already ${draft.status}.`, rollback_available: false }
        }

        const { error: approveErr } = await supabase.from('purchase_order_drafts')
          .update({ status: 'approved', approved_at: new Date().toISOString() })
          .eq('id', draftId).eq('business_id', businessId)

        if (approveErr) return { ok: false, affected_count: 0, error: approveErr.message, rollback_available: false }

        const draftItems = (draft.items as Array<unknown> | null) ?? []
        entityType = 'purchase_order_drafts'
        entityIds = [draftId]
        beforeState = { status: 'pending_approval' }
        afterState = { status: 'approved', total_cost_cents: Number(draft.total_cost_cents ?? 0) }
        affectedCount = draftItems.length
        break
      }

      default:
        return { ok: false, affected_count: 0, error: `Action type "${action.type}" not yet supported`, rollback_available: false }
    }

    // Write immutable audit log
    const { data: logEntry } = await supabase.from('aria_action_log').insert({
      business_id: businessId,
      action_type: action.type,
      entity_type: entityType,
      entity_ids: entityIds,
      before_state: beforeState,
      after_state: afterState,
      triggered_by: 'ask_aria',
      user_id: userId,
      conversation_id: conversationId ?? null,
      message_excerpt: messageExcerpt?.slice(0, 200) ?? null,
      executed_at: new Date().toISOString(),
    }).select('id').single()

    // Write to aria_actions for Brain panel visibility
    const impactNumeric = action.estimated_impact.replace(/[^0-9.]/g, '').slice(0, 10) || '0'
    const impactText = (Number(impactNumeric) || 0).toFixed(2)
    // INTEL-OUTCOME-2 Part 1 — .select('id').single() so the caller gets this row's real id back
    // (previously discarded, so nothing downstream could ever reference this specific recommendation
    // again — the durable-capture gap INTEL-OUTCOME-1 identified as the highest-leverage fix).
    const { data: actionRow, error: actionInsertErr } = await supabase.from('aria_actions').insert({
      business_id: businessId,
      category: CATEGORY_BY_ACTION_TYPE[action.type] ?? 'sales',
      title: action.title,
      recommendation: action.description,
      expected_impact: impactText,
      confidence: action.risk === 'low' ? 'high' : action.risk === 'medium' ? 'medium' : 'low',
      status: 'executed',
      rollback_data: action.reversible ? beforeState : null,
      source: 'ask_aria:action',
      priority: action.risk === 'high' ? 'high' : 'medium',
      triggered_by: 'ask_aria',
      executed_by_user_id: userId,
      payload: {
        action_type: action.type,
        affected_count: affectedCount,
        log_id: (logEntry as { id: string } | null)?.id ?? null,
      },
    }).select('id').single()
    if (actionInsertErr) console.error('[action-executor] aria_actions insert failed:', actionInsertErr.message)

    // INTEL-OUTCOME-2 Part 2 — the decision here IS the fact that this action executed
    // successfully (Ask Aria collapses recommend+decide into one chat message; there is no separate
    // approve step for this path). Writing that decision back onto the recommendation means creating
    // its linked aria_outcomes row now, at the only decision point this path ever has — mirroring
    // exactly what I4-VERIFY wired into the PATCH-route and auto-execute paths, but for the path that
    // has produced 100% of this business's real executed actions and was the only one never wired.
    // onActionExecuted never throws (it catches and logs its own errors), so awaiting it here cannot
    // break the chat response even if outcome-tracking fails.
    const newActionId = (actionRow as { id: string } | null)?.id
    if (newActionId) {
      await onActionExecuted(newActionId, businessId)
    }

    return {
      ok: true,
      affected_count: affectedCount,
      aria_action_id: (actionRow as { id: string } | null)?.id,
      failed_count: failedCount > 0 ? failedCount : undefined,
      warning: failedCount > 0 ? `${affectedCount} updated, ${failedCount} failed.` : undefined,
      action_log_id: (logEntry as { id: string } | null)?.id,
      rollback_available: action.reversible,
      rollback_expires_at: action.reversible ? new Date(Date.now() + 3600_000).toISOString() : undefined,
    }
  } catch (e) {
    return { ok: false, affected_count: affectedCount, error: (e as Error).message, rollback_available: false }
  }
}
