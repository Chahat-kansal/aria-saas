import type { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { waitUntil } from '@vercel/functions'
import { computeSaleTax, type TaxableLine } from '@/lib/pos/tax-engine'
import { logger } from '@/lib/observability/logger'
import { recordSaleMovements, type SaleMovementLine } from '@/lib/inventory/record-sale-movement'
import { resolveOutletId, adjustOutletStock } from '@/lib/inventory/outlet-stock'
import { fireKdsTickets } from '@/lib/pos/kds-fire'

// POS-SALE-CONSOLIDATE-1 — the single place a sale is created, items are inserted, and every
// downstream effect fires. Extracted from pos/sale/route.ts (the primary, most complete, most
// battle-tested checkout path — REDEMPTION-VERIFY-1, INVENTORY-DECREMENT-FIX-1, and the full
// LOY-* hook set all landed there first this cycle) and additively extended with the extra
// capabilities pos/sales/route.ts needs (gift cards, an arbitrary split_payments array, direct
// deposit) so migrating that route to this service drops nothing. Both routes keep their own
// route-specific pre-processing (auth, REDEMPTION-VERIFY-1's discount capping, gift-card
// validation, tax computation) and call this with an already-decided item list and totals — this
// function owns sale+items+every downstream effect, not request parsing.

export interface CreateSaleItem {
  product_id: string
  product_name: string
  product_sku?: string | null
  quantity: number
  unit_price: number
  discount_percent?: number
  tax_rate?: number
  tax_code_id?: string | null
  line_total: number
  modifiers?: unknown[]
  item_notes?: string | null
  price_overridden?: boolean
  original_unit_price?: number | null
  price_override_reason?: string | null
  variant_id?: string | null
  variant_name?: string | null
  cost_price?: number | null
  seat_number?: number | null
  course?: number | null
}

export interface AppliedDiscountEntry {
  promotion_id: string
  promotion_name: string
  type: string
  amount_off: number
  code?: string
}

export interface CreateSaleParams {
  businessId: string
  userId: string
  items: CreateSaleItem[]
  customerId?: string | null
  paymentMethod?: string | null
  subtotal: number
  taxAmount?: number
  taxBreakdown?: unknown[]
  discountAmount?: number
  totalAmount: number
  cashTendered?: number | null
  changeGiven?: number | null
  notes?: string | null
  splitCash?: number | null
  splitCard?: number | null
  /** Additive — pos/sales' arbitrary-length split. When present, takes priority over splitCash/splitCard. */
  splitPayments?: Array<{ method: string; amount: number }> | null
  outletId?: string | null
  registerId?: string | null
  servedBy?: string | null
  posUserId?: string | null
  ageVerified?: boolean
  tableId?: string | null
  orderType?: string | null
  tableLabel?: string | null
  appliedDiscounts?: AppliedDiscountEntry[]
  idempotencyKey?: string | null
  source?: string | null
  synced?: { fromOffline: true; queuedAt: string } | null
  /** Additive — gift-card fields pos/sales already supports; the sale row records them. Balance
   * validation/deduction stays the caller's responsibility (route-specific, not transactional here). */
  giftCard?: { id?: string | null; code?: string | null; amount?: number | null } | null
  directDepositRef?: string | null
  /** Explicit session override; else resolved from the business's open cash session. */
  sessionId?: string | null
  /** Additive — place-order's freeform pickup identity (no pos_customers row required to have
   * these on the sale row itself); every existing caller omits these and is unaffected. */
  customerName?: string | null
  customerPhone?: string | null
  pickupTime?: string | null
  /** Additive — online orders already have their own deliberately-gated KDS trigger
   * (fireKdsForOrder, fired only once the merchant accepts AND, for card payments, only once
   * Stripe confirms). Set true so createSale's own (ungated) KDS firing doesn't show the kitchen
   * an order that hasn't been accepted or paid for yet. Every other caller omits this and is
   * unaffected. */
  skipKds?: boolean
}

export interface CreateSaleResult {
  sale: Record<string, unknown> | null
  error: string | null
  status: number
  voided: boolean
}

/** Builds the tax breakdown from real tax codes when the items (or their underlying products)
 * carry a tax_code_id; falls back to the caller-supplied flat tax_amount otherwise (unchanged from
 * pos/sale's existing behaviour).
 *
 * INTEL-COMPUTE-2 — previously ONLY looked at the line item's own tax_code_id, which the terminal
 * doesn't always attach per line (confirmed live: dozens of real historical pos_sale_items rows
 * have tax_code_id IS NULL) — every such sale fell straight through to createSale()'s flat-10%
 * fallback, with zero exemption awareness, and that flat figure was PERSISTED to pos_sales.tax_amount
 * (real money, not a display estimate). Now also falls back to the product's own configured
 * pos_products.tax_code_id before giving up — the same real tax-code system, just resolved one
 * level further, so a product actually configured as GST-free/WET/LCT gets taxed correctly even
 * when the terminal didn't stamp its tax_code_id onto this specific line. */
async function computeTax(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  businessId: string,
  outletId: string | null | undefined,
  customerId: string | null | undefined,
  items: CreateSaleItem[],
  taxAmount: number,
  productTaxCodeMap: Record<string, string | null | undefined>,
): Promise<{ total: number; breakdown: unknown[] }> {
  let computedTaxTotal = taxAmount
  let computedTaxBreakdown: unknown[] = []
  try {
    const [taxCodesRes, outletOvRes, holidaysRes, customerRes] = await Promise.all([
      supabase.from('pos_tax_codes').select('*').eq('business_id', businessId).eq('is_active', true),
      outletId ? supabase.from('pos_outlet_tax_codes').select('*').eq('outlet_id', outletId).eq('is_active', true) : Promise.resolve({ data: [] }),
      supabase.from('pos_tax_holidays').select('*').eq('business_id', businessId).eq('is_active', true),
      customerId ? supabase.from('pos_customers').select('id, tax_exempt, tax_exempt_type, tax_exempt_expires_at').eq('id', customerId).eq('business_id', businessId).maybeSingle() : Promise.resolve({ data: null }),
    ])
    const taxLines: TaxableLine[] = items.map(i => ({
      product_id: i.product_id,
      category_id: null,
      quantity: Number(i.quantity) || 0,
      unit_price: Number(i.unit_price) || 0,
      line_subtotal: (Number(i.unit_price) || 0) * (Number(i.quantity) || 0),
      discount_amount: 0,
      tax_code_id: i.tax_code_id ?? productTaxCodeMap[i.product_id] ?? null,
      additional_tax_code_ids: [],
    }))
    if (taxLines.some(l => l.tax_code_id)) {
      const result = computeSaleTax(taxLines, taxCodesRes.data ?? [], (outletOvRes.data ?? []) as Parameters<typeof computeSaleTax>[2], (holidaysRes.data ?? []) as Parameters<typeof computeSaleTax>[3], customerRes.data ?? null, new Date())
      computedTaxTotal = result.total_tax
      computedTaxBreakdown = result.tax_breakdown
    }
  } catch { /* fall back to flat tax_amount */ }
  return { total: computedTaxTotal, breakdown: computedTaxBreakdown }
}

export async function createSale(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  params: CreateSaleParams,
): Promise<CreateSaleResult> {
  const { businessId, items } = params
  if (!items?.length) return { sale: null, error: 'No items', status: 400, voided: false }

  // Idempotency: if the client supplied a key and we've already processed it, replay the existing sale.
  if (params.idempotencyKey) {
    const { data: existing } = await supabase.from('pos_sales')
      .select('*').eq('business_id', businessId).eq('idempotency_key', params.idempotencyKey).maybeSingle()
    if (existing) {
      logger.info('createSale idempotent replay', { businessId, saleId: existing.id, idempotencyKey: params.idempotencyKey })
      return { sale: existing, error: null, status: 200, voided: false }
    }
  }

  const productIds = items.map(i => i.product_id)
  const { data: dbProducts } = await supabase.from('pos_products')
    .select('id, name, track_stock, stock_quantity, is_active, tax_code_id').in('id', productIds).eq('business_id', businessId)
  if (!dbProducts) return { sale: null, error: 'Failed to fetch products', status: 500, voided: false }
  const productMap = Object.fromEntries(dbProducts.map(p => [p.id, p]))
  const productTaxCodeMap: Record<string, string | null | undefined> = Object.fromEntries(dbProducts.map(p => [p.id, p.tax_code_id]))
  for (const item of items) {
    const p = productMap[item.product_id]
    if (!p) return { sale: null, error: `Product not found: ${item.product_id}`, status: 400, voided: false }
    if (!p.is_active) return { sale: null, error: `Product inactive: ${p.name}`, status: 400, voided: false }
    if (p.track_stock && p.stock_quantity != null && p.stock_quantity < item.quantity) {
      return { sale: null, error: `Insufficient stock for: ${p.name}`, status: 400, voided: false }
    }
  }

  const { count } = await supabase.from('pos_sales').select('id', { count: 'exact', head: true }).eq('business_id', businessId)
  const saleNumber = `POS-${String((count ?? 0) + 1).padStart(4, '0')}`

  const { total: computedTaxTotal, breakdown: computedTaxBreakdown } = await computeTax(
    supabase, businessId, params.outletId, params.customerId, items, params.taxAmount ?? 0, productTaxCodeMap,
  )

  const { data: openSession } = params.sessionId
    ? { data: { id: params.sessionId } as { id: string; register_id?: string | null } }
    : await supabase.from('pos_cash_sessions').select('id, register_id').eq('business_id', businessId).eq('status', 'open').maybeSingle()

  let resolvedRegisterId: string | null = (typeof params.registerId === 'string' && params.registerId) ? params.registerId : null
  if (!resolvedRegisterId) resolvedRegisterId = (openSession as { register_id?: string | null } | null)?.register_id ?? null
  if (!resolvedRegisterId && params.outletId) {
    const { data: firstReg } = await supabase.from('pos_registers').select('id').eq('outlet_id', params.outletId).eq('is_active', true).limit(1).maybeSingle()
    resolvedRegisterId = firstReg?.id ?? null
  }

  const salePayload: Record<string, unknown> = {
    business_id: businessId,
    sale_number: saleNumber,
    customer_id: params.customerId || null,
    session_id: openSession?.id || null,
    payment_method: params.paymentMethod ?? 'cash',
    subtotal: +Number(params.subtotal ?? 0).toFixed(2),
    // INTEL-COMPUTE-2 — the flat subtotal*0.1 fallback is now only reached when NEITHER the line
    // item NOR its underlying product has any tax_code_id at all (computeTax() above now checks
    // both) — a genuinely tax-code-unconfigured product, not the common case of a per-line
    // tax_code_id simply not being stamped on this specific sale.
    tax_amount: +(computedTaxTotal || Number(params.taxAmount) || Math.round(Number(params.subtotal) * 0.1 * 100) / 100).toFixed(2),
    tax_breakdown: computedTaxBreakdown,
    discount_amount: +Number(params.discountAmount ?? 0).toFixed(2),
    pos_user_id: params.posUserId ?? null,
    total_amount: +Number(params.totalAmount).toFixed(2),
    cash_tendered: params.cashTendered ?? null,
    change_given: params.changeGiven ?? null,
    split_cash: params.splitCash ?? null,
    split_card: params.splitCard ?? null,
    outlet_id: params.outletId ?? null,
    register_id: resolvedRegisterId,
    notes: params.notes ?? null,
    served_by: params.servedBy ?? null,
    age_verified: params.ageVerified ?? false,
    status: 'completed',
    idempotency_key: params.idempotencyKey ?? null,
  }
  if (params.source) salePayload.source = params.source
  // PLACE-ORDER-FIX-1 — order_type was already accepted as a param (used for the KDS tableLabel
  // fallback below) but never actually written onto the pos_sales row itself, silently dropping it
  // for every caller. pos/sale/route.ts has forwarded a real order_type here since before this
  // service existed; place-order's online-order marker depends on it too (column defaults to
  // 'takeaway' otherwise, per its DB default) — write it through.
  if (params.orderType) salePayload.order_type = params.orderType
  if (params.customerName) salePayload.customer_name = params.customerName
  if (params.customerPhone) salePayload.customer_phone = params.customerPhone
  if (params.pickupTime) salePayload.pickup_time = params.pickupTime
  if (params.synced) { salePayload.synced_from_offline = true; salePayload.offline_queued_at = params.synced.queuedAt }
  if (params.giftCard?.code) {
    salePayload.gift_card_code = String(params.giftCard.code).toUpperCase().trim()
    salePayload.gift_card_amount = params.giftCard.amount ?? 0
    if (params.giftCard.id) salePayload.gift_card_id = params.giftCard.id
  }
  if (params.directDepositRef) salePayload.direct_deposit_ref = params.directDepositRef

  const { data: sale, error: saleErr } = await supabase.from('pos_sales').insert(salePayload).select().single()
  if (saleErr || !sale) {
    logger.error('createSale failed', { businessId, error: saleErr?.message })
    return { sale: null, error: saleErr?.message ?? 'Failed to create sale', status: 500, voided: false }
  }

  if (params.appliedDiscounts?.length) {
    const redemptionRows = params.appliedDiscounts.map(d => ({
      business_id: businessId, promotion_id: d.promotion_id, sale_id: sale.id,
      customer_id: params.customerId ?? null, pos_user_id: params.posUserId ?? null,
      amount_off: Number(d.amount_off) || 0, code_used: d.code ?? null,
      promotion_name: d.promotion_name, promotion_type: d.type, was_auto: !d.code,
    }))
    try { await supabase.from('pos_promotion_redemptions').insert(redemptionRows) }
    catch (e) { console.error('[createSale] promotion redemptions insert (non-fatal):', e) }
  }

  const saleItems = items.map(i => ({
    sale_id: sale.id, business_id: businessId,
    product_id: i.product_id, product_name: i.product_name, product_sku: i.product_sku ?? null,
    quantity: i.quantity, unit_price: +Number(i.unit_price).toFixed(2),
    discount_percent: i.discount_percent ?? 0, tax_rate: i.tax_rate ?? 10, tax_code_id: i.tax_code_id ?? null,
    line_total: +Number(i.line_total).toFixed(2), modifiers: i.modifiers ?? [], item_notes: i.item_notes ?? null,
    price_overridden: !!i.price_overridden,
    original_unit_price: i.original_unit_price != null ? (Number(i.original_unit_price) || 0) : null,
    price_override_reason: i.price_override_reason ?? null,
    price_override_by: i.price_overridden ? params.userId : null,
    price_override_at: i.price_overridden ? new Date().toISOString() : null,
    variant_id: i.variant_id ?? null, variant_name: i.variant_name ?? null,
    cost_price: i.cost_price ?? null,
    seat_number: i.seat_number ?? null, course: i.course ?? null,
  }))

  // POS-SALE-CONSOLIDATE-1 — a failed item-insert must void the whole sale, never leave a partial
  // one. pos/sale/route.ts already had this compensating void; pos/sales/route.ts did not (it just
  // returned an error and left the completed sale row orphaned with zero items). Every caller of
  // this shared service now gets the same guarantee.
  const { error: itemsErr } = await supabase.from('pos_sale_items').insert(saleItems)
  if (itemsErr) {
    await supabase.from('pos_sales').update({ status: 'voided', notes: 'system:items_insert_failed' }).eq('id', sale.id)
    logger.error('createSale items insert failed — sale voided', { businessId, saleId: sale.id, error: itemsErr.message })
    return { sale: null, error: itemsErr.message, status: 500, voided: true }
  }

  // Payment rows — accepts either an arbitrary split_payments array (pos/sales) or the fixed
  // split_cash/split_card pair (pos/sale), else a single row for the sale's payment_method.
  try {
    const paymentRows: Array<{ sale_id: string; method: string; amount_cents: number; reference?: string | null }> = []
    const pm = params.paymentMethod ?? 'cash'
    if (params.splitPayments?.length) {
      for (const sp of params.splitPayments) paymentRows.push({ sale_id: sale.id, method: sp.method, amount_cents: Math.round((sp.amount ?? 0) * 100) })
    } else if (pm === 'split') {
      if ((params.splitCash ?? 0) > 0) paymentRows.push({ sale_id: sale.id, method: 'cash', amount_cents: Math.round((params.splitCash ?? 0) * 100) })
      if ((params.splitCard ?? 0) > 0) paymentRows.push({ sale_id: sale.id, method: 'card', amount_cents: Math.round((params.splitCard ?? 0) * 100) })
    } else {
      paymentRows.push({ sale_id: sale.id, method: pm, amount_cents: Math.round((params.totalAmount ?? 0) * 100), reference: params.directDepositRef ?? null })
    }
    if (paymentRows.length) {
      const { error: paymentsErr } = await supabase.from('pos_sale_payments').insert(paymentRows)
      if (paymentsErr) console.error('[createSale] pos_sale_payments insert failed:', paymentsErr.message)
    }
  } catch (e) { console.error('[createSale] payment recording failed:', e) }

  // Canonical stock decrement — pos_outlet_inventory.items_on_hand (awaited, logged on failure),
  // stock_quantity kept in parallel as a rollback cache. INVENTORY-DECREMENT-FIX-1's single source
  // of truth, now shared by every caller instead of two near-identical copies.
  const saleOutletId = await resolveOutletId(supabase, businessId, params.outletId ?? null)
  const movementLines: SaleMovementLine[] = []
  const stockOps: Array<Promise<void>> = []
  for (const i of items) {
    const p = productMap[i.product_id]
    if (!p?.track_stock) continue
    stockOps.push((async () => {
      const { data: cacheStock, error: decErr } = await supabase.rpc('decrement_stock_quantity', { p_product_id: i.product_id, p_amount: i.quantity })
      if (decErr) logger.error('createSale decrement_stock_quantity failed', { businessId, productId: i.product_id, error: decErr.message })
      const itemsOnHand = await adjustOutletStock(supabase, { businessId, outletId: saleOutletId, productId: i.product_id, delta: -i.quantity })
      movementLines.push({ itemId: i.product_id, quantitySold: i.quantity, newStock: itemsOnHand ?? cacheStock ?? 0 })
    })())
  }
  await Promise.all(stockOps)
  await recordSaleMovements(supabase, { businessId, saleId: sale.id, saleNumber, lines: movementLines })

  // Session totals — atomic RPC (avoids the concurrent-sale race a plain read-then-update has).
  if (openSession?.id) {
    const pm = params.paymentMethod
    const cashAmt = pm === 'cash' ? params.totalAmount : pm === 'split' ? (params.splitCash ?? 0) : 0
    const cardAmt = pm === 'eftpos' || pm === 'card' ? params.totalAmount : pm === 'split' ? (params.splitCard ?? 0) : 0
    const { error: sessErr } = await supabase.rpc('increment_session_totals', {
      p_session_id: openSession.id, p_cash_delta: cashAmt, p_card_delta: cardAmt, p_transaction_delta: 1,
    }).maybeSingle()
    if (sessErr) logger.error('createSale increment_session_totals failed', { businessId, sessionId: openSession.id, error: sessErr.message })
  }

  // Loyalty — base earn plus the full LOY-* hook set (challenges/referrals/reward-rules/tier-perks),
  // all additive and idempotent per (hook, sale). Every caller now gets the complete set instead of
  // pos/sales' base-earn-only subset.
  const customerId = params.customerId
  if (customerId) {
    const totalAmount = params.totalAmount
    waitUntil((async () => {
      try {
        const { earnOnSale } = await import('@/lib/loyalty/earnOnSale')
        const result = await earnOnSale({ businessId, customerId, saleId: sale.id, totalAmount: totalAmount ?? 0 })
        if (result.idempotent) logger.info('createSale loyalty earn idempotent replay', { businessId, saleId: sale.id })
      } catch (e) {
        logger.error('createSale loyalty earn failed', { businessId, saleId: sale.id, error: (e as Error).message })
        void supabaseAdmin.from('activity_log').insert({
          business_id: businessId, action_type: 'loyalty_earn_error',
          description: '[createSale] earnOnSale failed: ' + (e as Error).message,
          metadata: { sale_id: sale.id, customer_id: customerId, error: (e as Error).message },
          created_at: new Date().toISOString(),
        })
      }
    })())
    waitUntil((async () => { try { const { evaluateChallenges } = await import('@/lib/loyalty/challenges'); await evaluateChallenges(customerId, businessId) } catch (e) { console.error('[createSale] challenge eval failed:', e) } })())
    waitUntil((async () => { try { const { evaluateReferrals } = await import('@/lib/loyalty/referrals'); await evaluateReferrals(customerId, businessId) } catch (e) { console.error('[createSale] referral eval failed:', e) } })())
    waitUntil((async () => { try { const { evaluateRewardRules } = await import('@/lib/loyalty/reward-rules'); await evaluateRewardRules(customerId, businessId, sale.id) } catch (e) { console.error('[createSale] reward-rule eval failed:', e) } })())
    waitUntil((async () => { try { const { applyTierEarnPerks } = await import('@/lib/loyalty/tiers'); await applyTierEarnPerks(customerId, businessId, sale.id) } catch (e) { console.error('[createSale] tier-perk eval failed:', e) } })())
  }

  // Cafe KDS (legacy pos_kds_orders) + recipe ingredient deduction — industry-gated, unchanged
  // behaviour from pos/sale's existing block (the RPC-based decrement is safer under concurrency
  // than pos/sales' old read-then-update copy of the same logic).
  const tableLabel = params.tableLabel ?? (params.tableId ? `Table ${params.tableId}` : (params.orderType === 'dine_in' ? 'Dine-in' : 'Takeaway'))
  waitUntil((async () => {
    try {
      const { data: biz } = await supabase.from('businesses').select('industry').eq('id', businessId).maybeSingle()
      if (biz?.industry !== 'cafe') return
      if (!params.skipKds) {
        await supabase.from('pos_kds_orders').insert({
          business_id: businessId, sale_id: sale.id, table_number: tableLabel,
          items: items.map(i => ({ name: i.product_name, qty: i.quantity, modifiers: i.modifiers ?? [] })),
          status: 'new', priority: 1, notes: params.notes ?? null, created_at: new Date().toISOString(),
        })
      }
      for (const item of items) {
        const { data: recipe } = await supabase.from('recipes')
          .select('id, serves, recipe_ingredients(product_id, quantity)')
          .eq('business_id', businessId).eq('product_id', item.product_id).eq('is_active', true).maybeSingle()
        if (!recipe || !(recipe as { recipe_ingredients?: unknown[] }).recipe_ingredients?.length) continue
        for (const ing of (recipe as { recipe_ingredients: Array<{ product_id: string | null; quantity: number }> }).recipe_ingredients) {
          if (!ing.product_id) continue
          const deduct = (ing.quantity * item.quantity) / ((recipe as { serves?: number }).serves || 1)
          const { error: ingErr } = await supabase.rpc('decrement_stock_quantity', { p_product_id: ing.product_id, p_amount: deduct })
          if (ingErr) logger.error('createSale ingredient decrement failed', { businessId, productId: ing.product_id, error: ingErr.message })
        }
      }
    } catch (e) { console.error('[non-fatal]', e) }
  })())

  // KDS-FIX-1's station-KDS ticket creation (pos_kds_tickets) — the canonical, idempotent,
  // server-truth implementation. pos/sales/route.ts had its own inline copy of the exact pattern
  // this was built from; consolidated onto the one shared helper.
  waitUntil((async () => {
    try {
      if (params.skipKds) return
      const result = await fireKdsTickets(supabase, { business_id: businessId, outlet_id: params.outletId ?? null, sale_id: sale.id, table_label: tableLabel })
      if (result.errors.length > 0) {
        logger.error('createSale fireKdsTickets failed', { businessId, saleId: sale.id, errors: result.errors })
        void supabaseAdmin.from('activity_log').insert({
          business_id: businessId, action_type: 'kds_ticket_fire_error',
          description: '[createSale] fireKdsTickets failed: ' + result.errors.join('; '),
          metadata: { sale_id: sale.id, errors: result.errors }, created_at: new Date().toISOString(),
        })
      }
    } catch (e) { console.error('[non-fatal]', e) }
  })())

  // Aria Brain — observe sale + low stock + activity log.
  const totalAmount = params.totalAmount
  const paymentMethod = params.paymentMethod
  import('@/lib/aria/brain').then(({ logActivity, ariaObserve }) => {
    logActivity(businessId, 'sale_completed',
      `Sale ${sale.sale_number ?? String(sale.id).slice(-6)} · A$${(totalAmount ?? 0).toFixed(2)} · ${paymentMethod ?? 'cash'}`,
      { sale_id: sale.id, total: totalAmount, method: paymentMethod },
    ).catch(() => {})
    ariaObserve({
      business_id: businessId, category: 'sales', event_type: 'sale_completed', triggered_by: 'sale',
      data: { sale_id: sale.id, total: totalAmount ?? 0, method: paymentMethod, item_count: items.length, hour: new Date().getHours() },
    }).catch(() => {})
    for (const item of items) {
      supabase.from('pos_products').select('name, stock_quantity, low_stock_threshold').eq('id', item.product_id).maybeSingle()
        .then(({ data: p }) => {
          if (p && p.stock_quantity != null && p.low_stock_threshold != null && p.stock_quantity <= p.low_stock_threshold) {
            ariaObserve({
              business_id: businessId, category: 'inventory', event_type: 'low_stock_detected', triggered_by: 'sale',
              data: { product_name: p.name, current_stock: p.stock_quantity, reorder_level: p.low_stock_threshold },
            }).catch(() => {})
          }
        }, () => {})
    }
  }).catch(() => {})

  logger.info('createSale completed', { businessId, saleId: sale.id, total: totalAmount })
  return { sale, error: null, status: 200, voided: false }
}
