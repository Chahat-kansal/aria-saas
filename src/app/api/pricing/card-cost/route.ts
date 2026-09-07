export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture'
import { assessCardCost, SURCHARGE_BAN_FACTS, type CardCostInputs, type CardMix } from '@/lib/aria/compute/card-cost'

/**
 * M14 PHASE 1 — the venue's real card position, assembled from what is actually recorded.
 *
 * This route reads and computes. It writes nothing and proposes nothing; the price proposal is
 * phase 3's job and goes through `bulk_price_update`, which is `propose_only`.
 *
 * ⚠️ Every input here is either read from a row or left null. Nothing is defaulted to a
 * plausible-looking number — the whole point of the assessment is that it can say "I cannot see
 * this", and a default at this layer would silently take that ability away.
 */
async function _GET(_req: Request, _ctx: unknown, { supabase, businessId }: BusinessContext) {
  // ── the venue's own surcharge settings ─────────────────────────────────────────────────────────
  const { data: settings, error: settingsErr } = await supabase
    .from('pos_settings')
    .select('surcharge_enabled, surcharge_type, surcharge_value, card_surcharge_percent, accept_card')
    .eq('business_id', businessId)
    .maybeSingle()
  if (settingsErr) console.error('[card-cost] pos_settings read failed:', settingsErr.message)

  // A percent surcharge is the only shape this assessment can express as a rate. A flat-dollar
  // surcharge is real but is not a percent, so it is reported as unknown rather than converted
  // with an assumed basket size.
  const isPercent = (settings?.surcharge_type ?? 'percent') === 'percent'
  const rawRate = Number(settings?.surcharge_value ?? settings?.card_surcharge_percent ?? 0)
  const surchargePct = settings?.surcharge_enabled && isPercent && rawRate > 0 ? rawRate : null

  // ── card share of takings, and how much of the history it was measured over ────────────────────
  const { data: payRows, error: payErr } = await supabase
    .from('pos_sale_payments')
    .select('method, amount_cents, sale_id, pos_sales!inner(business_id, status)')
    .eq('pos_sales.business_id', businessId)
    .eq('pos_sales.status', 'completed')
    .limit(20000)
  if (payErr) console.error('[card-cost] pos_sale_payments read failed:', payErr.message)

  const { count: completedCount, error: countErr } = await supabase
    .from('pos_sales')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', businessId)
    .eq('status', 'completed')
  if (countErr) console.error('[card-cost] pos_sales count failed:', countErr.message)

  const rows = payRows ?? []
  const cardCents = rows.filter(r => r.method === 'card').reduce((s, r) => s + (Number(r.amount_cents) || 0), 0)
  const allCents = rows.reduce((s, r) => s + (Number(r.amount_cents) || 0), 0)
  const cardTxns = rows.filter(r => r.method === 'card').length
  const salesWithPayments = new Set(rows.map(r => r.sale_id)).size

  const cardSharePct = allCents > 0 ? Math.round((cardCents / allCents) * 1000) / 10 : null
  const avgCardTxnDollars = cardTxns > 0 ? Math.round((cardCents / cardTxns)) / 100 : null

  /**
   * ⚠️ THE CARD MIX IS NOT AVAILABLE AND THIS IS WHERE THAT IS DECIDED.
   *
   * `pos_sale_payments.method` records `card`, `cash` or `other`. There is no debit/credit/foreign
   * split in the schema, and there is no settlement or acquirer table anywhere in this database —
   * so there is nothing to read it from. Passing `null` is what makes the assessment return a
   * RANGE rather than a blended rate. Inventing a "typical Australian café mix" here is precisely
   * the failure this sprint exists to avoid.
   */
  const mix: CardMix | null = null

  const inputs: CardCostInputs = {
    surcharge_enabled: Boolean(settings?.surcharge_enabled),
    surcharge_pct: surchargePct,
    card_share_pct: cardSharePct,
    card_share_coverage: completedCount != null
      ? { sales_with_payments: salesWithPayments, sales_total: completedCount }
      : null,
    mix,
    avg_card_txn_dollars: avgCardTxnDollars,
  }

  const result = assessCardCost(inputs)
  if (!result.ok) {
    return NextResponse.json({ ok: false, reason: result.reason, provenance: result.provenance }, { status: 200 })
  }

  return NextResponse.json({
    ok: true,
    facts: SURCHARGE_BAN_FACTS,
    inputs_used: inputs,
    assessment: result.data,
    provenance: result.provenance,
    /** So a reader can see the surcharge shape we could not express, rather than a silent null. */
    notes: !isPercent && settings?.surcharge_enabled
      ? ['This venue charges a flat-dollar surcharge, not a percentage. It is real, but it cannot be shown as a rate without assuming an average basket, so it is left unstated.']
      : [],
  })
}

export const GET = withBusinessContext('pricing/card-cost', _GET)
