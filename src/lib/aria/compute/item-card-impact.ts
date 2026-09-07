import { makeProvenance, type ComputeResult } from './provenance'
import { looksBackCalculatedCost, COST_SOURCE_LABEL, type ResolvedCost } from '@/lib/inventory/resolve-cost'
import type { CardCostTier } from './card-cost'

/**
 * M14 PHASE 2 — THE MARGIN HIT, PER ITEM.
 *
 * ── ⚠️ THE INSIGHT THAT MAKES THIS WORK WITHOUT COST DATA ──────────────────────────────────────
 * A venue that surcharges today is about to stop collecting that surcharge. The revenue it loses is
 *
 *     surcharge rate × share of takings on card
 *
 * and **the price rise that recovers it exactly is the same figure.** A 1.5% surcharge on a venue
 * where 88% of takings are on card is a 1.32% hole, and a 1.32% price rise fills it.
 *
 * **None of that needs a cost price.** It is arithmetic over the venue's own settings and its own
 * sales. So the most useful number in this whole sprint is fully grounded even though Sip's cost
 * data is worthless — which is the opposite of what the brief assumed, and much better news.
 *
 * ── WHAT STILL NEEDS COST, AND THEREFORE CANNOT BE SHOWN ───────────────────────────────────────
 * "What percentage of this item's MARGIN does the card cost eat?" needs a real cost. Sip has 74
 * products, 72 carry a `cost_price`, and **all 72 are exactly `price × 0.4`** — the fabricated
 * back-calculation `looksBackCalculatedCost()` exists to catch. So margin is `not_connected` here,
 * and a naive engine reading the column would have produced 72 confident, wrong margins.
 */

export interface ItemInput {
  id: string
  name: string
  /** Shelf price in dollars. */
  price: number
  /** Units sold in the window. 0 is a real answer; null means we did not look. */
  units_sold: number | null
  /** From resolveCostBatch(). Never read `cost_price` directly. */
  resolved_cost: ResolvedCost | null
}

export interface ItemImpact {
  id: string
  name: string
  price: number
  units_sold: number | null
  /** price × units over the window. */
  revenue: number | null
  revenue_tier: CardCostTier
  /** Surcharge revenue this item currently produces, and therefore what stops on 1 October. */
  surcharge_revenue_lost: number | null
  /** The per-item price that recovers it exactly, rounded to the cent. */
  recovering_price: number | null
  /** Unit margin — only when a real cost exists. */
  margin_dollars: number | null
  margin_tier: CardCostTier
  /** Why the margin figure is what it is, in the owner's words. */
  cost_note: string
}

export interface ItemImpactSummary {
  /** The rise that exactly recovers the lost surcharge, as a percent of price. */
  recovery_pct: number
  recovery_tier: CardCostTier
  /** Total surcharge revenue that stops, over the window. */
  total_surcharge_lost: number | null
  items: ItemImpact[]
  /** Counts behind the margin verdict, so the owner sees why it says what it says. */
  cost_quality: { total: number; usable: number; back_calculated: number; missing: number }
  unknowns: string[]
}

export interface ItemImpactInputs {
  items: ItemInput[]
  /** The venue's surcharge today, percent. 0 or null when it does not surcharge. */
  surcharge_pct: number | null
  /** Share of takings on card, 0–100. */
  card_share_pct: number | null
  /** How the card share was established — carried straight through to the recovery tier. */
  card_share_tier: CardCostTier
}

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * The price rise that exactly replaces a surcharge that is going away.
 *
 * Deliberately NOT margin-aware: this recovers the lost REVENUE, which is the thing that actually
 * stops on 1 October. A margin-preserving rise would be a different (larger) number and would need
 * cost data this venue does not have.
 */
export function recoveryPct(surchargePct: number | null, cardSharePct: number | null): number | null {
  if (surchargePct == null || cardSharePct == null) return null
  if (surchargePct <= 0) return 0
  return Math.round(surchargePct * (cardSharePct / 100) * 1000) / 1000
}

/**
 * ⚠️ THE GROUNDING RAIL. A cost is usable for a margin claim only if it is real.
 *
 * `catalogue` is the weakest resolver tier and is where a back-calculated `cost_price` lands. When
 * the value ALSO matches the price × 0.4 signature, it is not a weak estimate — it is a number
 * nobody ever measured, and a margin computed from it is fiction with a decimal point.
 */
export function isCostUsableForMargin(price: number, resolved: ResolvedCost | null): boolean {
  if (!resolved || resolved.cost == null || resolved.cost <= 0) return false
  if (resolved.source === 'catalogue' && looksBackCalculatedCost(price, resolved.cost)) return false
  return true
}

export function computeItemImpact(input: ItemImpactInputs): ComputeResult<ItemImpactSummary> {
  const prov = (rule: string, g: 'verified' | 'derived' | 'estimated') =>
    makeProvenance('computeItemImpact', '1.0.0',
      { items: input.items.length, surcharge_pct: input.surcharge_pct, card_share_pct: input.card_share_pct },
      rule, g)

  if (input.items.length === 0) {
    return {
      ok: false,
      reason: 'No active products to model. Nothing is hidden — there is nothing to price.',
      provenance: prov('no items supplied', 'verified'),
    }
  }

  const rec = recoveryPct(input.surcharge_pct, input.card_share_pct)
  const unknowns: string[] = []
  let usable = 0, backCalc = 0, missing = 0

  const items: ItemImpact[] = input.items.map(it => {
    const units = it.units_sold
    const revenue = units == null ? null : round2(it.price * units)
    const costOk = isCostUsableForMargin(it.price, it.resolved_cost)

    if (!it.resolved_cost || it.resolved_cost.cost == null) missing++
    else if (!costOk) backCalc++
    else usable++

    const lost = rec == null || revenue == null ? null : round2(revenue * (rec / 100))
    const newPrice = rec == null ? null : round2(it.price * (1 + rec / 100))

    return {
      id: it.id,
      name: it.name,
      price: it.price,
      units_sold: units,
      revenue,
      revenue_tier: units == null ? 'not_connected' : 'verified',
      surcharge_revenue_lost: lost,
      recovering_price: newPrice,
      // ⚠️ null, not a plausible number, whenever the cost cannot carry a margin claim.
      margin_dollars: costOk ? round2(it.price - (it.resolved_cost!.cost as number)) : null,
      margin_tier: costOk
        ? ((it.resolved_cost!.grounding ?? 'estimated') as CardCostTier)
        : 'not_connected',
      cost_note: !it.resolved_cost || it.resolved_cost.cost == null
        ? COST_SOURCE_LABEL.unknown
        : costOk
          ? COST_SOURCE_LABEL[it.resolved_cost.source]
          : 'looks back-calculated from the price, so we will not compute a margin from it',
    }
  })

  if (backCalc > 0) {
    unknowns.push(
      backCalc + ' of ' + items.length + ' products have a cost that is exactly 40% of the price — '
      + 'the signature of a number that was derived from the price rather than recorded. We will not '
      + 'compute a margin from those.',
    )
  }
  if (missing > 0) unknowns.push(missing + ' products have no cost recorded at all.')
  if (input.card_share_pct == null) unknowns.push('Without a card share we cannot say how much of your takings the surcharge touched.')
  if (input.surcharge_pct == null) unknowns.push('No surcharge rate is recorded, so we cannot say what stops on 1 October.')

  const totalLost = items.every(i => i.surcharge_revenue_lost == null)
    ? null
    : round2(items.reduce((s, i) => s + (i.surcharge_revenue_lost ?? 0), 0))

  return {
    ok: true,
    data: {
      recovery_pct: rec ?? 0,
      // The recovery figure is only as good as the card share it is built on.
      recovery_tier: rec == null ? 'not_connected' : input.card_share_tier,
      total_surcharge_lost: totalLost,
      items,
      cost_quality: { total: items.length, usable, back_calculated: backCalc, missing },
      unknowns,
    },
    provenance: prov(
      'recovery = surcharge rate x card share, over the venue\'s own sales; margin computed only '
      + 'where a cost survives the back-calculation check',
      usable > 0 ? 'derived' : 'estimated',
    ),
  }
}
