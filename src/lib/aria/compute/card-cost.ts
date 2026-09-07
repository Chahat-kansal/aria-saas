import { makeProvenance, type ComputeResult, type Grounding } from './provenance'

/**
 * M14 PHASE 1 — WHAT DOES THIS VENUE ACTUALLY PAY TO TAKE A CARD?
 *
 * ── THE DEADLINE ───────────────────────────────────────────────────────────────────────────────
 * On 1 October 2026 the RBA lifts its prohibition on 'no-surcharge' rules, and the interchange caps
 * on domestic-issued cards fall on the same day. A café that adds a card fee at the terminal today
 * has to fold it into shelf prices or absorb it — and the cost it is folding in is SMALLER than the
 * surcharge was. Most owners will over-price or under-price that. This module is the arithmetic.
 *
 * ── ⚠️ THE CORRECTION THAT MATTERS MOST, AND IT IS NOT IN THE BRIEF ────────────────────────────
 * **AN INTERCHANGE CAP IS NOT WHAT A MERCHANT PAYS.** Interchange is the issuer's slice. What the
 * café actually pays is a merchant service fee: interchange PLUS scheme fees PLUS the acquirer's
 * margin. Telling an owner "your card cost is now 0.3%" would be wrong by a factor that varies by
 * acquirer, and it is exactly the mistake that produces a badly-priced menu.
 *
 * So this module computes what it can honestly compute — **how much the INTERCHANGE COMPONENT
 * falls** — and refuses to present that as the merchant's cost. The pass-through to the merchant
 * depends on the acquirer's contract, which Aria cannot see unless settlement data is connected.
 *
 * ── ⚠️ AND THE LEGAL MECHANISM, WHICH GOVERNS EVERY SENTENCE WE SHOW ───────────────────────────
 * The RBA does NOT ban merchants from surcharging. It lifts its own prohibition on the card
 * networks' 'no-surcharge' rules, and the networks are then expected to impose them. Aria must
 * never tell a merchant that surcharging becomes illegal — it becomes prohibited by scheme rule.
 * `SURCHARGE_BAN_FACTS.mechanism` is the one place that sentence is written.
 */

/**
 * The RBA's decisions, verified against the Conclusions Paper (March 2026) on 7 September 2026 —
 * read from the RBA's own pages rather than copied from a sprint brief.
 *
 * Every figure a proposal shows traces back to this object. Nothing here is rounded, inferred or
 * remembered.
 */
export const SURCHARGE_BAN_FACTS = {
  source: 'https://www.rba.gov.au/payments-and-infrastructure/review-of-retail-payments-regulation/2026-03/conclusions-paper/',
  verified_on: '2026-09-07',
  /** The date the no-surcharge prohibition is lifted and the domestic caps change. */
  effective: '2026-10-01',
  /** Foreign-issued card cap and the transparency measures. */
  effective_foreign: '2027-04-01',
  /**
   * ⚠️ Say it this way, or do not say it. "Surcharging becomes illegal" is legal advice and it is
   * wrong: the RBA removes its own barrier and the schemes are expected to forbid it by rule.
   */
  mechanism:
    'From 1 October 2026 the Reserve Bank lifts its prohibition on card networks enforcing '
    + 'no-surcharge rules. eftpos, Mastercard and Visa are expected to forbid surcharging under '
    + 'their own scheme rules from that date.',
  caps: {
    /** Domestic debit and prepaid: whichever is lower in effect — 8c flat or 0.16% ad valorem. */
    domestic_debit: { cents: 8, pct: 0.16, from: '2026-10-01' },
    domestic_consumer_credit: { pct: 0.3, from: '2026-10-01' },
    /** ⚠️ UNCHANGED at 0.8%. Only its weighted-average benchmark is abolished. A venue taking many
     *  business cards saves far less than one on consumer debit, and a model that ignores this
     *  overstates the saving. */
    domestic_commercial_credit: { pct: 0.8, from: '2026-10-01' },
    /** Previously unregulated. */
    foreign: { pct: 1.0, from: '2027-04-01' },
  },
  previous_caps: {
    domestic_debit: { cents: 10, pct: 0.2 },
    domestic_consumer_credit: { pct: 0.8 },
    domestic_commercial_credit: { pct: 0.8 },
    /** No cap existed. Modelling a "before" for foreign cards would be inventing one. */
    foreign: null,
  },
} as const

/**
 * How well a figure is known.
 *
 * ⚠️ Built ON `Grounding`, not beside it. The compute module already speaks
 * verified/derived/estimated and a fourth vocabulary for the same idea is how N-copies drift
 * starts. Two states are added because this domain genuinely has them:
 *
 *   stated         — the owner typed it. Not verified against anything, but not a guess either.
 *   not_connected  — Aria cannot see this at all. NOT zero, NOT a default. The proposal must say so.
 */
export type CardCostTier = Grounding | 'stated' | 'not_connected'

/** Shares of card VALUE by card type. Must sum to ~1. `null` anywhere means the split is unknown. */
export interface CardMix {
  debit: number
  consumer_credit: number
  commercial_credit: number
  foreign: number
}

export interface CardCostInputs {
  /** From pos_settings. */
  surcharge_enabled: boolean
  /** The rate the venue charges today, as a percent (1.5 means 1.5%). Owner-stated. */
  surcharge_pct: number | null
  /** Share of takings paid by card, 0–100. */
  card_share_pct: number | null
  /** How much of the sales history that share was measured over — the honesty of the number above. */
  card_share_coverage: { sales_with_payments: number; sales_total: number } | null
  /** The debit/credit/foreign split. `null` when no settlement feed is connected — the usual case. */
  mix: CardMix | null
  /** Average card transaction in dollars, for the 8c-vs-0.16% comparison. */
  avg_card_txn_dollars: number | null
}

export interface InterchangeBand {
  /** Blended interchange as a percent of card turnover. */
  pct: number
  /** Which card type produced this bound, for the owner to read. */
  basis: string
}

export interface CardCostAssessment {
  /** What the venue charges customers today, if anything. */
  surcharge_today_pct: number | null
  surcharge_tier: CardCostTier
  card_share_pct: number | null
  card_share_tier: CardCostTier
  /** Blended interchange before and after — only when the mix is known. */
  interchange_before: InterchangeBand | null
  interchange_after: InterchangeBand | null
  /** When the mix is NOT known: the honest span, from an all-debit venue to an all-commercial one. */
  interchange_after_range: { low: InterchangeBand; high: InterchangeBand } | null
  interchange_tier: CardCostTier
  /**
   * ⚠️ Always `not_connected` until a settlement feed exists. The merchant service fee is
   * interchange plus scheme fees plus acquirer margin, and Aria cannot see the last two.
   */
  merchant_service_fee_pct: number | null
  merchant_service_fee_tier: CardCostTier
  /** Least-cost routing status. Aria has no acquirer integration, so this is `not_connected`. */
  least_cost_routing: 'on' | 'off' | 'not_connected'
  /** Everything the assessment could not see, in the owner's words. Rendered, never hidden. */
  unknowns: string[]
  /** True when the venue surcharges today and must therefore do something by 1 October. */
  action_required: boolean
}

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * Blended interchange for a known mix, as a percent of card turnover.
 *
 * Debit is capped at "8 cents OR 0.16%", so the effective percent depends on ticket size: on a $4
 * coffee 8c is 2%, and the 0.16% cap is what binds; on a $100 tab 0.16% is 16c and the 8c cap
 * binds. Modelling it as a flat 0.16% would overstate the cost of a café's typical basket, so the
 * average transaction value is used when it is known — and when it is not, the assumption is named.
 */
export function blendedInterchangePct(
  mix: CardMix,
  caps: { debit: { cents: number; pct: number }; consumer: number; commercial: number; foreign: number | null },
  avgTxnDollars: number | null,
): number {
  const debitPct = avgTxnDollars && avgTxnDollars > 0
    // The cap is the LOWER of the two in effect, so a merchant never pays more than either.
    ? Math.min(caps.debit.pct, (caps.debit.cents / 100 / avgTxnDollars) * 100)
    : caps.debit.pct
  // A foreign cap of null means "unregulated before the change" — there is no honest number to
  // blend, so foreign share is excluded and the caller is told via `unknowns`.
  const foreignPct = caps.foreign
  const parts = [
    mix.debit * debitPct,
    mix.consumer_credit * caps.consumer,
    mix.commercial_credit * caps.commercial,
    foreignPct === null ? 0 : mix.foreign * foreignPct,
  ]
  return round2(parts.reduce((a, b) => a + b, 0))
}

/** Normalises a raw mix and rejects one that cannot be a share split. */
export function isUsableMix(mix: CardMix | null): mix is CardMix {
  if (!mix) return false
  const vals = [mix.debit, mix.consumer_credit, mix.commercial_credit, mix.foreign]
  if (vals.some(v => typeof v !== 'number' || !Number.isFinite(v) || v < 0)) return false
  const total = vals.reduce((a, b) => a + b, 0)
  // A mix that does not add up is a broken feed, not a quiet 0.
  return total > 0.99 && total < 1.01
}

/**
 * The whole assessment.
 *
 * Returns `InsufficientData` only when there is genuinely nothing to say. Everything else comes
 * back with the parts that ARE known and an explicit list of the parts that are not — because an
 * owner with 25 days needs the half of the picture that exists, labelled as half.
 */
export function assessCardCost(input: CardCostInputs): ComputeResult<CardCostAssessment> {
  const inputs = { ...input } as unknown as Record<string, unknown>
  const prov = (rule: string, grounding: Grounding) =>
    makeProvenance('assessCardCost', '1.0.0', inputs, rule, grounding)

  const unknowns: string[] = []
  const F = SURCHARGE_BAN_FACTS

  // ── surcharge today ───────────────────────────────────────────────────────────────────────────
  const surchargeToday = input.surcharge_enabled ? input.surcharge_pct : 0
  const surchargeTier: CardCostTier = input.surcharge_enabled
    ? (input.surcharge_pct == null ? 'not_connected' : 'stated')
    : 'verified'   // "we do not surcharge" is a setting, read directly, with nothing assumed
  if (input.surcharge_enabled && input.surcharge_pct == null) {
    unknowns.push('Card surcharging is switched on but no rate is recorded, so we cannot say what customers pay today.')
  }

  // ── card share ────────────────────────────────────────────────────────────────────────────────
  let cardShareTier: CardCostTier = 'not_connected'
  if (input.card_share_pct != null) {
    const cov = input.card_share_coverage
    const coverage = cov && cov.sales_total > 0 ? cov.sales_with_payments / cov.sales_total : 0
    // A share measured over a sliver of the history is not verified, and saying so is the point.
    cardShareTier = coverage >= 0.8 ? 'verified' : 'estimated'
    if (cardShareTier === 'estimated' && cov) {
      unknowns.push(
        'Card share is measured from ' + cov.sales_with_payments + ' of ' + cov.sales_total
        + ' sales (' + Math.round(coverage * 1000) / 10 + '% of them), because the rest carry no payment record.',
      )
    }
  } else {
    unknowns.push('No payment records, so we cannot tell what share of your takings is on card.')
  }

  // ── interchange ───────────────────────────────────────────────────────────────────────────────
  const avg = input.avg_card_txn_dollars
  if (avg == null) {
    unknowns.push('Average card transaction is unknown, so debit is modelled at the 0.16% cap rather than the 8c one.')
  }
  let before: InterchangeBand | null = null
  let after: InterchangeBand | null = null
  let range: { low: InterchangeBand; high: InterchangeBand } | null = null
  let interchangeTier: CardCostTier

  if (isUsableMix(input.mix)) {
    before = {
      pct: blendedInterchangePct(input.mix, {
        debit: F.previous_caps.domestic_debit,
        consumer: F.previous_caps.domestic_consumer_credit.pct,
        commercial: F.previous_caps.domestic_commercial_credit.pct,
        foreign: F.previous_caps.foreign,
      }, avg),
      basis: 'your card mix, at the caps in force until 30 September',
    }
    after = {
      pct: blendedInterchangePct(input.mix, {
        debit: F.caps.domestic_debit,
        consumer: F.caps.domestic_consumer_credit.pct,
        commercial: F.caps.domestic_commercial_credit.pct,
        foreign: F.caps.foreign.pct,
      }, avg),
      basis: 'your card mix, at the caps from 1 October',
    }
    interchangeTier = 'derived'
    if (input.mix.foreign > 0) {
      unknowns.push('Foreign cards had no interchange cap before the change, so the "before" figure excludes them.')
    }
  } else {
    // ⚠️ NO MIX, SO NO BLENDED RATE. Not a 1.5% assumption, not a plausible average — the honest
    // span between an all-debit venue and an all-commercial-credit one, both bounds real caps.
    const allDebit: CardMix = { debit: 1, consumer_credit: 0, commercial_credit: 0, foreign: 0 }
    const allCommercial: CardMix = { debit: 0, consumer_credit: 0, commercial_credit: 1, foreign: 0 }
    const capsAfter = {
      debit: F.caps.domestic_debit,
      consumer: F.caps.domestic_consumer_credit.pct,
      commercial: F.caps.domestic_commercial_credit.pct,
      foreign: F.caps.foreign.pct,
    }
    range = {
      low: { pct: blendedInterchangePct(allDebit, capsAfter, avg), basis: 'if every card were debit' },
      high: { pct: blendedInterchangePct(allCommercial, capsAfter, avg), basis: 'if every card were a business credit card' },
    }
    interchangeTier = 'not_connected'
    unknowns.push('Your POS records a payment as "card" without saying debit, credit or overseas, so we cannot blend your actual rate — only the range it must fall inside.')
  }

  // ── the merchant service fee, which is the number an owner actually cares about ────────────────
  unknowns.push(
    'Interchange is only part of what you pay. Your merchant service fee also includes scheme fees '
    + 'and your acquirer\'s margin, which we cannot see without your settlement statements — so we '
    + 'cannot tell you how much of the interchange cut reaches you.',
  )
  unknowns.push('Least-cost routing is set by your acquirer and is not visible to Aria.')

  const assessment: CardCostAssessment = {
    surcharge_today_pct: surchargeToday,
    surcharge_tier: surchargeTier,
    card_share_pct: input.card_share_pct,
    card_share_tier: cardShareTier,
    interchange_before: before,
    interchange_after: after,
    interchange_after_range: range,
    interchange_tier: interchangeTier,
    merchant_service_fee_pct: null,
    merchant_service_fee_tier: 'not_connected',
    least_cost_routing: 'not_connected',
    unknowns,
    action_required: input.surcharge_enabled === true,
  }

  return {
    ok: true,
    data: assessment,
    provenance: prov(
      'RBA Conclusions Paper caps applied to the venue\'s recorded settings and payment mix; '
      + 'interchange only, never presented as the merchant service fee',
      isUsableMix(input.mix) ? 'derived' : 'estimated',
    ),
  }
}
