export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions'
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { computeSaleTax, type TaxableLine } from '@/lib/pos/tax-engine';
import { withErrorCapture, setSentryContext } from '@/lib/api/with-error-capture'
import { logger } from '@/lib/observability/logger'

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: activeBiz } = await supabase
    .from('user_active_business')
    .select('business_id')
    .eq('user_id', user.id)
    .maybeSingle();
  const activeId = activeBiz?.business_id
    ?? (await supabase.from('businesses').select('id').eq('user_id', user.id)
        .eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()).data?.id;
  const business = activeId ? { id: activeId } : null;
  if (!business) return NextResponse.json({ error: 'Business not found' }, { status: 404 });

  const body = await req.json();
  const {
    items, customer_id, payment_method,
    subtotal, tax_amount, discount_amount, total_amount,
    cash_tendered, change_given, notes,
    split_cash, split_card, outlet_id, register_id, served_by, pos_user_id,
    session_id: bodySessionId, age_verified,
    table_id, order_type, applied_discounts,
    idempotency_key,
  } = body;

  // Idempotency: if client supplies a key and we've already processed it, return the existing sale
  if (idempotency_key && typeof idempotency_key === 'string') {
    const { data: existing } = await supabase.from('pos_sales')
      .select('*')
      .eq('business_id', business.id)
      .eq('idempotency_key', idempotency_key)
      .maybeSingle()
    if (existing) {
      logger.info('pos/sale idempotent replay', { route: 'pos/sale', businessId: business.id, saleId: existing.id, idempotency_key })
      return NextResponse.json({ sale: existing })
    }
  }

  setSentryContext({ businessId: business.id, userId: user.id, operation: 'sale_complete', route: 'pos/sale' })
  logger.info('pos/sale start', { route: 'pos/sale', userId: user.id, businessId: business.id })

  if (!items?.length) return NextResponse.json({ error: 'No items' }, { status: 400 });

  // ── Permission check: discount limit (line-item and total) ────────
  if (pos_user_id) {
    // Compute max line discount and effective total discount from items
    let maxLinePct = 0
    let preDiscountGross = 0
    let actualGross = 0
    for (const it of (items as Array<{ unit_price?: number; quantity?: number; discount_percent?: number }>) ?? []) {
      const pct = Number(it.discount_percent) || 0
      const unit = Number(it.unit_price) || 0
      const qty = Number(it.quantity) || 0
      if (pct > maxLinePct) maxLinePct = pct
      preDiscountGross += unit * qty
      actualGross += unit * qty * (1 - pct / 100)
    }
    const totalDiscountAmt = preDiscountGross - actualGross + (Number(discount_amount) || 0)
    const effectivePct = preDiscountGross > 0 ? (totalDiscountAmt / preDiscountGross) * 100 : 0
    const triggeringPct = Math.max(maxLinePct, effectivePct)

    if (triggeringPct > 0) {
      const { getPosUser, resolvePermissions, writeAuditLog } = await import('@/lib/pos/check-permission')
      const posUser = await getPosUser(supabase, pos_user_id, business.id)
      if (posUser) {
        const perms = resolvePermissions(posUser)
        const limit = Number(perms.max_discount_pct ?? 10)
        if (triggeringPct > limit + 0.01) {
          return NextResponse.json({
            error: `Discount of ${triggeringPct.toFixed(0)}% exceeds your limit of ${limit}%`,
            requires_override: true,
            flag: 'max_discount_pct',
          }, { status: 403 })
        }
        await writeAuditLog(supabase, {
          business_id: business.id,
          action: 'discount_applied',
          pos_user_id,
          performed_by: user.id,
          amount: totalDiscountAmt,
          metadata: { discount_pct: triggeringPct.toFixed(1), max_allowed: limit, max_line_pct: maxLinePct.toFixed(1) },
        })
      }
    }
  }

  // Validate stock for each item that tracks stock
  const productIds = items.map((i: any) => i.product_id);
  const { data: dbProducts } = await supabase
    .from('pos_products')
    .select('id, name, track_stock, stock_quantity, is_active')
    .in('id', productIds)
    .eq('business_id', business.id);

  if (!dbProducts) return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 });

  const productMap = Object.fromEntries(dbProducts.map(p => [p.id, p]));

  for (const item of items) {
    const p = productMap[item.product_id];
    if (!p) return NextResponse.json({ error: `Product not found: ${item.product_id}` }, { status: 400 });
    if (!p.is_active) return NextResponse.json({ error: `Product inactive: ${p.name}` }, { status: 400 });
    if (p.track_stock && p.stock_quantity != null && p.stock_quantity < item.quantity) {
      return NextResponse.json({ error: `Insufficient stock for: ${p.name}` }, { status: 400 });
    }
  }

  // Generate sale_number: POS-XXXX
  const { count } = await supabase
    .from('pos_sales')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', business.id);

  const saleNumber = `POS-${String((count ?? 0) + 1).padStart(4, '0')}`;

  // Note on jurisdiction: AU GST is uniform 10% nationally. Per-outlet
  // overrides (state_code, NZ outlets, etc) configured via pos_outlet_tax_codes
  // and fetched by the engine below.
  // ── Sprint E: per-item tax breakdown ──
  let computedTaxBreakdown: unknown[] = []
  let computedTaxTotal = Number(tax_amount) || 0
  try {
    const [taxCodesRes, outletOvRes, holidaysRes, customerRes] = await Promise.all([
      supabase.from('pos_tax_codes').select('*').eq('business_id', business.id).eq('is_active', true),
      outlet_id ? supabase.from('pos_outlet_tax_codes').select('*').eq('outlet_id', outlet_id).eq('is_active', true) : Promise.resolve({ data: [] }),
      supabase.from('pos_tax_holidays').select('*').eq('business_id', business.id).eq('is_active', true),
      customer_id ? supabase.from('pos_customers').select('id, tax_exempt, tax_exempt_type, tax_exempt_expires_at').eq('id', customer_id).eq('business_id', business.id).maybeSingle() : Promise.resolve({ data: null }),
    ])
    const taxLines: TaxableLine[] = (items as Array<{ product_id: string; category_id?: string; quantity: number; unit_price: number; tax_code_id?: string; additional_tax_code_ids?: string[] }>).map(i => ({
      product_id: i.product_id,
      category_id: i.category_id ?? null,
      quantity: Number(i.quantity) || 0,
      unit_price: Number(i.unit_price) || 0,
      line_subtotal: (Number(i.unit_price) || 0) * (Number(i.quantity) || 0),
      discount_amount: 0,
      tax_code_id: i.tax_code_id ?? null,
      additional_tax_code_ids: i.additional_tax_code_ids ?? [],
    }))
    if (taxLines.some(l => l.tax_code_id)) {
      const result = computeSaleTax(taxLines, taxCodesRes.data ?? [], (outletOvRes.data ?? []) as Parameters<typeof computeSaleTax>[2], (holidaysRes.data ?? []) as Parameters<typeof computeSaleTax>[3], customerRes.data ?? null, new Date())
      computedTaxTotal = result.total_tax
      computedTaxBreakdown = result.tax_breakdown
    }
  } catch { /* fall back to flat tax_amount */ }

  // Get open session
  const { data: openSession } = await supabase
    .from('pos_cash_sessions')
    .select('id, total_cash_sales, total_card_sales, register_id')
    .eq('business_id', business.id)
    .eq('status', 'open')
    .maybeSingle();

  // WIRE-DB-2: stamp register_id on every sale (was previously never captured here, the
  // primary live checkout path). Prefer the client value, else the open cash session's
  // register (the sale belongs to that session), else the first active register for the
  // outlet. Mirrors the resolution already used in /api/pos/sales. served_by is stamped
  // below from the request body unchanged.
  let resolvedRegisterId: string | null =
    (typeof register_id === 'string' && register_id) ? register_id : null;
  if (!resolvedRegisterId) resolvedRegisterId = openSession?.register_id ?? null;
  if (!resolvedRegisterId && outlet_id) {
    const { data: firstReg } = await supabase
      .from('pos_registers')
      .select('id')
      .eq('outlet_id', outlet_id)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();
    resolvedRegisterId = firstReg?.id ?? null;
  }

  // Create sale record
  const { data: sale, error: saleErr } = await supabase
    .from('pos_sales')
    .insert({
      business_id: business.id,
      sale_number: saleNumber,
      customer_id: customer_id || null,
      session_id: openSession?.id || null,
      payment_method: payment_method ?? 'cash',
      subtotal: +subtotal.toFixed(2),
      tax_amount: +(computedTaxTotal || Number(tax_amount) || Math.round(Number(subtotal) * 0.1 * 100) / 100).toFixed(2),
      tax_breakdown: computedTaxBreakdown,
      discount_amount: +(discount_amount ?? 0).toFixed(2),
      pos_user_id: pos_user_id ?? null,
      total_amount: +total_amount.toFixed(2),
      cash_tendered: cash_tendered ?? null,
      change_given: change_given ?? null,
      split_cash: split_cash ?? null,
      split_card: split_card ?? null,
      outlet_id: outlet_id ?? null,
      register_id: resolvedRegisterId,
      notes: notes ?? null,
      served_by: served_by ?? null,
      age_verified: age_verified ?? false,
      status: 'completed',
      idempotency_key: (idempotency_key && typeof idempotency_key === 'string') ? idempotency_key : null,
    })
    .select()
    .single();

  if (saleErr || !sale) {
    logger.error('pos/sale failed', { route: 'pos/sale', businessId: business.id, error: saleErr?.message })
    return NextResponse.json({ error: saleErr?.message ?? 'Failed to create sale' }, { status: 500 });
  }

  // ── Sprint D: record promotion redemptions ──────────────────────
  if (Array.isArray(applied_discounts) && applied_discounts.length > 0) {
    const redemptionRows = (applied_discounts as Array<{
      promotion_id: string; promotion_name: string; type: string;
      amount_off: number; code?: string;
    }>).map(d => ({
      business_id: business.id,
      promotion_id: d.promotion_id,
      sale_id: sale.id,
      customer_id: customer_id ?? null,
      pos_user_id: pos_user_id ?? null,
      amount_off: Number(d.amount_off) || 0,
      code_used: d.code ?? null,
      promotion_name: d.promotion_name,
      promotion_type: d.type,
      was_auto: !d.code,
    }))
    try {
      await supabase.from('pos_promotion_redemptions').insert(redemptionRows)
    } catch (e) { console.error('[non-fatal]', e) }
  }

  // Create sale items
  const saleItems = items.map((i: any) => ({
    sale_id: sale.id,
    business_id: business.id,
    product_id: i.product_id,
    product_name: i.product_name,
    product_sku: i.product_sku ?? null,
    quantity: i.quantity,
    unit_price: +i.unit_price.toFixed(2),
    discount_percent: i.discount_percent ?? 0,
    tax_rate: i.tax_rate ?? 10,
    tax_code_id: i.tax_code_id ?? null,
    line_total: +i.line_total.toFixed(2),
    modifiers: i.modifiers ?? [],
    item_notes: i.item_notes ?? null,
    price_overridden: !!i.price_overridden,
    original_unit_price: i.original_unit_price != null ? (Number(i.original_unit_price) || 0) : null,
    price_override_reason: i.price_override_reason ?? null,
    price_override_by: i.price_overridden ? user.id : null,
    price_override_at: i.price_overridden ? new Date().toISOString() : null,
    variant_id: i.variant_id ?? null,
    variant_name: i.variant_name ?? null,
  }));

  const { error: itemsErr } = await supabase.from('pos_sale_items').insert(saleItems);
  if (itemsErr) {
    // Compensate: void the orphaned sale record (hard-delete blocked by DB trigger)
    await supabase.from('pos_sales').update({ status: 'voided', notes: 'system:items_insert_failed' }).eq('id', sale.id)
    logger.error('pos/sale items insert failed — sale voided', { route: 'pos/sale', saleId: sale.id, error: itemsErr.message })
    return NextResponse.json({ error: itemsErr.message }, { status: 500 });
  }

  // Record payment breakdown in pos_sale_payments
  try {
    const paymentRows: object[] = [];
    const pm = payment_method ?? 'cash';
    if (pm === 'split') {
      if ((split_cash ?? 0) > 0) paymentRows.push({ sale_id: sale.id, method: 'cash', amount_cents: Math.round((split_cash ?? 0) * 100) });
      if ((split_card ?? 0) > 0) paymentRows.push({ sale_id: sale.id, method: 'card', amount_cents: Math.round((split_card ?? 0) * 100) });
    } else {
      paymentRows.push({ sale_id: sale.id, method: pm, amount_cents: Math.round((total_amount ?? 0) * 100) });
    }
    if (paymentRows.length) {
      const { error: paymentsErr } = await supabase.from('pos_sale_payments').insert(paymentRows);
      if (paymentsErr) console.error('[sale] pos_sale_payments insert failed:', paymentsErr.message);
    }
  } catch (e) { console.error('[sale] payment recording failed:', e); }

  // Decrement stock atomically + log stock movements
  const stockOps: PromiseLike<any>[] = [];
  for (const i of items) {
    const p = productMap[i.product_id];
    if (!p?.track_stock) continue;
    stockOps.push(
      (async () => {
        const { data: newStock, error: decErr } = await supabase.rpc('decrement_stock_quantity', { p_product_id: i.product_id, p_amount: i.quantity });
        if (decErr) logger.error('pos/sale decrement_stock_quantity failed', { route: 'pos/sale', businessId: business.id, productId: i.product_id, error: decErr.message });
        try {
          await supabase.from('stock_movements').insert({
            business_id: business.id,
            item_id: i.product_id,
            movement_type: 'sale',
            quantity_added: -i.quantity,
            new_stock: newStock ?? 0,
            notes: `Sale ${saleNumber}`,
            scanned_at: new Date().toISOString(),
          });
        } catch (e) { console.error('[non-fatal]', e) }
      })()
    );
  }
  await Promise.all(stockOps);

  // Update session totals atomically — use RPC to avoid concurrent-sale race
  if (openSession) {
    const cashAmt = payment_method === 'cash' ? total_amount
      : payment_method === 'split' ? (split_cash ?? 0) : 0;
    const cardAmt = payment_method === 'eftpos' ? total_amount
      : payment_method === 'split' ? (split_card ?? 0) : 0;
    const { error: sessErr } = await supabase.rpc('increment_session_totals', {
      p_session_id: openSession.id,
      p_cash_delta: cashAmt,
      p_card_delta: cardAmt,
      p_transaction_delta: 1,
    }).maybeSingle();
    if (sessErr) logger.error('pos/sale increment_session_totals failed', { route: 'pos/sale', businessId: business.id, sessionId: openSession.id, error: sessErr.message });
  }

  // Update customer loyalty + stats — atomic RPCs prevent concurrent-sale race
  if (customer_id) {
    waitUntil((async () => {
      try {
        // WIRE-1 — config-aware loyalty earn: points_per_dollar × total (points mode) or +1 stamp (stamps mode)
        const { data: loyCfg } = await supabase.from('pos_loyalty_config')
          .select('program_type, points_per_dollar').eq('business_id', business.id).maybeSingle()
        const stampsMode = (loyCfg?.program_type ?? 'points') === 'stamps'
        const earnedPoints = stampsMode ? 0 : Math.max(0, Math.floor(Number(loyCfg?.points_per_dollar ?? 1) * (total_amount ?? 0)))
        const earnedStamps = stampsMode ? 1 : 0

        const custResults = await Promise.all([
          stampsMode
            ? supabase.rpc('increment_numeric', { p_table: 'pos_customers', p_id: customer_id, p_column: 'stamps_count', p_amount: 1 })
            : supabase.rpc('increment_loyalty_points', { customer_id, points: earnedPoints }).maybeSingle(),
          supabase.rpc('increment_numeric', { p_table: 'pos_customers', p_id: customer_id, p_column: 'total_spent', p_amount: total_amount }),
          supabase.rpc('increment_numeric', { p_table: 'pos_customers', p_id: customer_id, p_column: 'visit_count', p_amount: 1 }),
          supabase.from('pos_customers').update({ last_visit: new Date().toISOString() }).eq('id', customer_id),
        ])
        for (const r of custResults) {
          if (r?.error) logger.error('pos/sale customer stats update failed', { route: 'pos/sale', businessId: business.id, customerId: customer_id, error: r.error.message });
        }

        // WIRE-1 — keep points_balance (the canonical balance the redeem path reads) in sync with
        // loyalty_points, so the dashboard liability and customer balance are consistent.
        if (!stampsMode && earnedPoints > 0) {
          await supabase.rpc('increment_numeric', { p_table: 'pos_customers', p_id: customer_id, p_column: 'points_balance', p_amount: earnedPoints });
        }

        // WIRE-1 — write the loyalty LEDGER (the previously-dark transactional layer).
        // Idempotent: unique index pos_loyalty_txn_earn_per_sale (sale_id where type='earn').
        if (earnedPoints > 0 || earnedStamps > 0) {
          const { error: ledgerErr } = await supabaseAdmin.from('pos_loyalty_transactions').insert({
            business_id: business.id, customer_id, sale_id: sale.id,
            type: 'earn', points_delta: earnedPoints, stamps_delta: earnedStamps,
            created_at: new Date().toISOString(),
          })
          if (ledgerErr && !/duplicate|unique/i.test(ledgerErr.message)) {
            logger.error('pos/sale loyalty ledger insert failed', { route: 'pos/sale', businessId: business.id, error: ledgerErr.message });
          }
        }
      } catch (e) { console.error('[sale] loyalty update failed:', e) }
    })())

    // LOY-CHALLENGES — separate, additive hook: this real sale may complete a loyalty challenge.
    // Recomputes progress from real pos_sale_items and awards points via the existing earn ledger.
    // Independent of the earn block above (never alters it).
    waitUntil((async () => {
      try {
        const { evaluateChallenges } = await import('@/lib/loyalty/challenges')
        await evaluateChallenges(customer_id, business.id)
      } catch (e) { console.error('[sale] challenge eval failed:', e) }
    })())

    // LOY-REFERRALS — additive hook: this customer's FIRST real purchase may be a referee's qualifying
    // purchase. Atomically rewards both referrer + referee via the existing ledger. Earn logic untouched.
    waitUntil((async () => {
      try {
        const { evaluateReferrals } = await import('@/lib/loyalty/referrals')
        await evaluateReferrals(customer_id, business.id)
      } catch (e) { console.error('[sale] referral eval failed:', e) }
    })())
  }

  // Cafe KDS + ingredient deduction (waitUntil — keeps function alive, doesn't block response)
  waitUntil((async () => {
    try {
      const { data: biz } = await supabase.from('businesses').select('industry').eq('id', business.id).maybeSingle()
      if (biz?.industry !== 'cafe') return

      // KDS ticket
      const tableLabel = table_id ? `Table ${table_id}` : (order_type === 'dine_in' ? 'Dine-in' : 'Takeaway')
      await supabase.from('pos_kds_orders').insert({
        business_id: business.id,
        sale_id: sale.id,
        table_number: tableLabel,
        items: items.map((i: any) => ({
          name: i.product_name,
          qty: i.quantity,
          modifiers: i.modifiers ?? [],
        })),
        status: 'new',
        priority: 1,
        notes: notes ?? null,
        created_at: new Date().toISOString(),
      })

      // Ingredient deduction via recipe_ingredients
      for (const item of items as Array<{ product_id: string; quantity: number }>) {
        const { data: recipe } = await supabase
          .from('recipes')
          .select('id, serves, recipe_ingredients(product_id, quantity)')
          .eq('business_id', business.id)
          .eq('product_id', item.product_id)
          .eq('is_active', true)
          .maybeSingle()
        if (!recipe || !(recipe as any).recipe_ingredients?.length) continue
        for (const ing of (recipe as any).recipe_ingredients as Array<{ product_id: string | null; quantity: number }>) {
          if (!ing.product_id) continue
          const deduct = (ing.quantity * item.quantity) / ((recipe as any).serves || 1)
          const { error: ingErr } = await supabase.rpc('decrement_stock_quantity', { p_product_id: ing.product_id, p_amount: deduct })
          if (ingErr) logger.error('pos/sale ingredient decrement failed', { route: 'pos/sale', businessId: business.id, productId: ing.product_id, error: ingErr.message })
        }
      }
    } catch (e) { console.error('[non-fatal]', e) }
  })())

  // Aria Brain — observe sale + low stock + activity log (non-blocking dynamic import)
  const bid = business.id
  import('@/lib/aria/brain').then(({ logActivity, ariaObserve }) => {
    logActivity(bid, 'sale_completed',
      `Sale ${sale.sale_number ?? sale.id?.slice(-6)} · A$${(total_amount ?? 0).toFixed(2)} · ${payment_method ?? 'cash'}`,
      { sale_id: sale.id, total: total_amount, method: payment_method }
    ).catch(() => {})

    ariaObserve({
      business_id: bid,
      category: 'sales',
      event_type: 'sale_completed',
      triggered_by: 'sale',
      data: {
        sale_id: sale.id,
        total: total_amount ?? 0,
        method: payment_method,
        item_count: body.items?.length ?? 0,
        hour: new Date().getHours(),
      },
    }).catch(() => {})

    // Low-stock check per sold item
    if (body.items?.length) {
      for (const item of body.items as Array<{ product_id?: string }>) {
        if (!item.product_id) continue
        supabase.from('pos_products')
          .select('name, stock_quantity, low_stock_threshold')
          .eq('id', item.product_id)
          .maybeSingle()
          .then(({ data: p }) => {
            if (p && p.stock_quantity != null && p.low_stock_threshold != null
                && p.stock_quantity <= p.low_stock_threshold) {
              ariaObserve({
                business_id: bid,
                category: 'inventory',
                event_type: 'low_stock_detected',
                triggered_by: 'sale',
                data: { product_name: p.name, current_stock: p.stock_quantity, reorder_level: p.low_stock_threshold },
              }).catch(() => {})
            }
          }, () => {})
      }
    }
  }).catch(() => {})

  logger.info('pos/sale completed', { route: 'pos/sale', businessId: business.id, saleId: sale.id, total: total_amount })
  return NextResponse.json({ sale });
}

export const POST = withErrorCapture('pos/sale', _POST)

