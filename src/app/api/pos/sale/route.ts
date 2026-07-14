export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { withErrorCapture, setSentryContext } from '@/lib/api/with-error-capture'
import { logger } from '@/lib/observability/logger'
import { createSale, type AppliedDiscountEntry } from '@/lib/pos/create-sale'

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
    age_verified,
    table_id, order_type, applied_discounts,
    idempotency_key,
  } = body;

  setSentryContext({ businessId: business.id, userId: user.id, operation: 'sale_complete', route: 'pos/sale' })
  logger.info('pos/sale start', { route: 'pos/sale', userId: user.id, businessId: business.id })

  if (!items?.length) return NextResponse.json({ error: 'No items' }, { status: 400 });

  // REDEMPTION-VERIFY-1 — the terminal computes a loyalty-redeem discount (points_cost * point_value)
  // and folds it straight into applied_discounts/discount_amount/total_amount BEFORE the sale is ever
  // submitted here; the ONLY server-side balance check previously lived in a separate, fire-and-forget
  // /api/pos/loyalty/redeem call fired AFTER this sale already committed — its failure never undid the
  // discount already charged. Verify against the customer's REAL current balance here, before the
  // discount is trusted into the sale total — same "never trust the client" principle as the KDS and
  // reels-usage fixes. Caps down only (never up) and only touches loyalty-tagged entries; every other
  // discount/promotion on the sale is untouched. This is API-boundary input validation, not part of
  // the createSale domain service — createSale trusts the amounts it's given are already decided.
  let verifiedAppliedDiscounts: AppliedDiscountEntry[] =
    Array.isArray(applied_discounts) ? (applied_discounts as AppliedDiscountEntry[]).map(d => ({ ...d })) : []
  let verifiedDiscountAmount = Number(discount_amount) || 0
  let verifiedTotalAmount = Number(total_amount) || 0

  const loyaltyEntries = verifiedAppliedDiscounts.filter(d => typeof d.promotion_id === 'string' && d.promotion_id.startsWith('loyalty-redeem-'))
  if (customer_id && loyaltyEntries.length > 0) {
    const [{ data: redeemCustomer }, { data: loyaltyCfg }] = await Promise.all([
      supabase.from('pos_customers').select('points_balance, stamps_count').eq('id', customer_id).eq('business_id', business.id).maybeSingle(),
      supabase.from('pos_loyalty_config').select('point_value_cents, stamps_to_reward').eq('business_id', business.id).maybeSingle(),
    ])
    const realPointsBalance = Number(redeemCustomer?.points_balance ?? 0)
    const realStampsCount = Number(redeemCustomer?.stamps_count ?? 0)
    const pointValueCents = Number(loyaltyCfg?.point_value_cents ?? 1)
    const stampsNeeded = Number(loyaltyCfg?.stamps_to_reward ?? 10)
    const maxValidPointsDiscount = Math.round(realPointsBalance * pointValueCents) / 100

    let shortfall = 0
    verifiedAppliedDiscounts = verifiedAppliedDiscounts.map(d => {
      if (typeof d.promotion_id !== 'string' || !d.promotion_id.startsWith('loyalty-redeem-')) return d
      const claimed = Number(d.amount_off) || 0
      const isStamp = d.promotion_id === 'loyalty-redeem-stamp'
      const cap = isStamp ? (realStampsCount >= stampsNeeded ? claimed : 0) : Math.min(claimed, maxValidPointsDiscount)
      if (cap < claimed - 0.005) {
        logger.warn('pos/sale loyalty redemption exceeded real balance — capped', {
          route: 'pos/sale', businessId: business.id, customer_id, claimed, cap, realPointsBalance, realStampsCount,
        })
        shortfall += claimed - cap
        return { ...d, amount_off: cap }
      }
      return d
    })
    if (shortfall > 0.005) {
      verifiedDiscountAmount = Math.max(0, verifiedDiscountAmount - shortfall)
      verifiedTotalAmount = verifiedTotalAmount + shortfall
    }
  }

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
    const totalDiscountAmt = preDiscountGross - actualGross + verifiedDiscountAmount
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

  const result = await createSale(supabase, {
    businessId: business.id,
    userId: user.id,
    items,
    customerId: customer_id,
    paymentMethod: payment_method,
    subtotal,
    taxAmount: tax_amount,
    discountAmount: verifiedDiscountAmount,
    totalAmount: verifiedTotalAmount,
    cashTendered: cash_tendered,
    changeGiven: change_given,
    notes,
    splitCash: split_cash,
    splitCard: split_card,
    outletId: outlet_id,
    registerId: register_id,
    servedBy: served_by,
    posUserId: pos_user_id,
    ageVerified: age_verified,
    tableId: table_id,
    orderType: order_type,
    appliedDiscounts: verifiedAppliedDiscounts,
    idempotencyKey: idempotency_key,
  })

  if (result.error) {
    logger.error('pos/sale failed', { route: 'pos/sale', businessId: business.id, error: result.error })
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  logger.info('pos/sale completed', { route: 'pos/sale', businessId: business.id, saleId: result.sale?.id, total: verifiedTotalAmount })
  return NextResponse.json({ sale: result.sale });
}

export const POST = withErrorCapture('pos/sale', _POST)
