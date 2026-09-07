import { describe, it, expect } from 'vitest'
import {
  assessCardCost,
  blendedInterchangePct,
  isUsableMix,
  SURCHARGE_BAN_FACTS,
  type CardMix,
  type CardCostInputs,
} from './card-cost'

/**
 * M14 PHASE 1 — WHAT DOES THIS VENUE ACTUALLY PAY?
 *
 * ⚠️ Every assertion here CALLS the engine and reads the value it returns. Nothing greps a source
 * file — the standing rule since M13's presence test passed for weeks over a function that never
 * worked.
 */
const base: CardCostInputs = {
  surcharge_enabled: false,
  surcharge_pct: null,
  card_share_pct: null,
  card_share_coverage: null,
  mix: null,
  avg_card_txn_dollars: null,
}
const ok = (i: Partial<CardCostInputs> = {}) => {
  const r = assessCardCost({ ...base, ...i })
  if (!r.ok) throw new Error('expected an assessment, got: ' + r.reason)
  return r
}

describe('M14 phase 1 · the RBA facts are the ones the RBA published', () => {
  it('the caps match the Conclusions Paper exactly', () => {
    const c = SURCHARGE_BAN_FACTS.caps
    expect(c.domestic_debit).toEqual({ cents: 8, pct: 0.16, from: '2026-10-01' })
    expect(c.domestic_consumer_credit.pct).toBe(0.3)
    expect(c.foreign).toEqual({ pct: 1.0, from: '2027-04-01' })
    // ⚠️ Commercial credit is UNCHANGED at 0.8% — the paste omits it, and a venue taking business
    // cards saves far less than one on consumer debit.
    expect(c.domestic_commercial_credit.pct).toBe(0.8)
    expect(SURCHARGE_BAN_FACTS.previous_caps.domestic_consumer_credit.pct).toBe(0.8)
    expect(SURCHARGE_BAN_FACTS.previous_caps.domestic_debit).toEqual({ cents: 10, pct: 0.2 })
    // Foreign cards were UNREGULATED before. Modelling a "before" would be inventing one.
    expect(SURCHARGE_BAN_FACTS.previous_caps.foreign).toBeNull()
  })

  it('⚠️ the mechanism sentence never says surcharging becomes illegal', () => {
    // The RBA lifts its prohibition on no-surcharge RULES; the schemes are then expected to forbid
    // it. "Illegal" would be legal advice, and wrong.
    const m = SURCHARGE_BAN_FACTS.mechanism.toLowerCase()
    expect(m).toContain('lifts its prohibition')
    expect(m).toContain('scheme rules')
    for (const forbidden of ['illegal', 'unlawful', 'banned by law', 'against the law']) {
      expect(m, forbidden).not.toContain(forbidden)
    }
  })
})

describe('M14 phase 1 · blended interchange, when the mix is actually known', () => {
  const mix: CardMix = { debit: 0.7, consumer_credit: 0.25, commercial_credit: 0.05, foreign: 0 }
  const after = {
    debit: SURCHARGE_BAN_FACTS.caps.domestic_debit,
    consumer: SURCHARGE_BAN_FACTS.caps.domestic_consumer_credit.pct,
    commercial: SURCHARGE_BAN_FACTS.caps.domestic_commercial_credit.pct,
    foreign: SURCHARGE_BAN_FACTS.caps.foreign.pct,
  }

  it('a 70/25/5 venue lands where the arithmetic says, not where a default says', () => {
    // 0.7×0.16 + 0.25×0.30 + 0.05×0.80 = 0.112 + 0.075 + 0.040 = 0.227 → 0.23
    expect(blendedInterchangePct(mix, after, null)).toBe(0.23)
  })

  it('⚠️ TICKET SIZE CHANGES THE DEBIT CAP, and modelling it flat overstates a café', () => {
    // Debit is capped at 8c OR 0.16%, whichever binds. On a $4 coffee, 8c is 2% and the 0.16% cap
    // is what binds; on a $100 tab, 0.16% is 16c and the 8c cap binds.
    const allDebit: CardMix = { debit: 1, consumer_credit: 0, commercial_credit: 0, foreign: 0 }
    expect(blendedInterchangePct(allDebit, after, 4)).toBe(0.16)     // percent cap binds
    expect(blendedInterchangePct(allDebit, after, 100)).toBe(0.08)   // 8c cap binds
    // The merchant never pays more than either cap — so the modelled rate never exceeds 0.16%.
    for (const ticket of [1, 4, 8.07, 50, 100, 500]) {
      expect(blendedInterchangePct(allDebit, after, ticket), String(ticket)).toBeLessThanOrEqual(0.16)
    }
  })

  it('before and after are both computed, and after is lower for a consumer-card venue', () => {
    const r = ok({ mix, avg_card_txn_dollars: 8.07 })
    expect(r.data.interchange_before).not.toBeNull()
    expect(r.data.interchange_after).not.toBeNull()
    expect(r.data.interchange_after!.pct).toBeLessThan(r.data.interchange_before!.pct)
    expect(r.data.interchange_tier).toBe('derived')
    // No range when the real thing is known.
    expect(r.data.interchange_after_range).toBeNull()
  })

  it('a mix that does not add up is a broken feed, not a quiet zero', () => {
    expect(isUsableMix({ debit: 0.5, consumer_credit: 0.2, commercial_credit: 0, foreign: 0 })).toBe(false)
    expect(isUsableMix({ debit: 1, consumer_credit: 0, commercial_credit: 0, foreign: 0 })).toBe(true)
    expect(isUsableMix(null)).toBe(false)
    expect(isUsableMix({ debit: -1, consumer_credit: 2, commercial_credit: 0, foreign: 0 })).toBe(false)
  })
})

describe('M14 phase 1 · ⚠️ with no mix it gives a RANGE, never an assumed rate', () => {
  it('the range is bounded by real caps at both ends, and 1.5% is nowhere in it', () => {
    const r = ok({ avg_card_txn_dollars: 8.07 })
    expect(r.data.interchange_after).toBeNull()
    expect(r.data.interchange_tier).toBe('not_connected')
    const range = r.data.interchange_after_range!
    expect(range.low.pct).toBe(0.16)    // all debit, at a café ticket
    expect(range.high.pct).toBe(0.8)    // all commercial credit
    expect(range.low.basis).toContain('debit')
    expect(range.high.basis).toContain('business credit')
  })

  it('MUTATION — assuming 1.5% is exactly what goes red', () => {
    // The decision table's rule: "The venue's actual card cost is unknown → say so. Do not assume
    // 1.5%." A version that filled the gap would return a number here.
    const r = ok()
    expect(r.data.merchant_service_fee_pct).toBeNull()
    expect(r.data.merchant_service_fee_tier).toBe('not_connected')
    expect(r.data.interchange_after).toBeNull()
    // And the assumed-rate version, reproduced, is a different answer:
    const assumed = { ...r.data, merchant_service_fee_pct: 1.5, merchant_service_fee_tier: 'estimated' as const }
    expect(assumed).not.toEqual(r.data)
  })

  it('⚠️ the merchant service fee is NEVER presented, mix known or not', () => {
    // Interchange is the issuer's slice. What the café pays also includes scheme fees and the
    // acquirer's margin. Presenting 0.3% as "your card cost" is the mistake that misprices a menu.
    for (const mix of [null, { debit: 0.7, consumer_credit: 0.3, commercial_credit: 0, foreign: 0 }]) {
      const r = ok({ mix })
      expect(r.data.merchant_service_fee_pct).toBeNull()
      expect(r.data.merchant_service_fee_tier).toBe('not_connected')
      expect(r.data.unknowns.join(' ')).toContain('merchant service fee')
    }
  })
})

describe('M14 phase 1 · the tiers tell the truth about each figure', () => {
  it('SIP, exactly as recorded: does not surcharge, so 1 October takes nothing away', () => {
    // surcharge_enabled=false, card_surcharge_percent=0.00 — read from pos_settings.
    const r = ok({ card_share_pct: 88.2, card_share_coverage: { sales_with_payments: 54, sales_total: 1802 } })
    expect(r.data.surcharge_today_pct).toBe(0)
    expect(r.data.surcharge_tier).toBe('verified')      // "we don't surcharge" is a read setting
    expect(r.data.action_required).toBe(false)
  })

  it('⚠️ a card share measured over 3% of sales is ESTIMATED, and says so in words', () => {
    const r = ok({ card_share_pct: 88.2, card_share_coverage: { sales_with_payments: 54, sales_total: 1802 } })
    expect(r.data.card_share_tier).toBe('estimated')
    expect(r.data.unknowns.join(' ')).toContain('54 of 1802 sales')
    // Full coverage earns 'verified'; nothing else does.
    const full = ok({ card_share_pct: 88.2, card_share_coverage: { sales_with_payments: 1802, sales_total: 1802 } })
    expect(full.data.card_share_tier).toBe('verified')
  })

  it('a venue that DOES surcharge is action_required, and an unrecorded rate is not_connected', () => {
    const s = ok({ surcharge_enabled: true, surcharge_pct: 1.5 })
    expect(s.data.action_required).toBe(true)
    expect(s.data.surcharge_tier).toBe('stated')        // the owner typed it; nothing verified it
    expect(s.data.surcharge_today_pct).toBe(1.5)

    const missing = ok({ surcharge_enabled: true, surcharge_pct: null })
    expect(missing.data.surcharge_tier).toBe('not_connected')
    expect(missing.data.unknowns.join(' ')).toContain('no rate is recorded')
  })

  it('least-cost routing is not_connected — Aria has no acquirer integration to read it from', () => {
    expect(ok().data.least_cost_routing).toBe('not_connected')
    expect(ok().data.unknowns.join(' ')).toContain('Least-cost routing')
  })

  it('ANTI-VACUITY — the unknowns list is real, and it shrinks as inputs improve', () => {
    const blind = ok()
    const informed = ok({
      mix: { debit: 0.7, consumer_credit: 0.3, commercial_credit: 0, foreign: 0 },
      avg_card_txn_dollars: 8.07,
      card_share_pct: 88.2,
      card_share_coverage: { sales_with_payments: 1802, sales_total: 1802 },
    })
    expect(blind.data.unknowns.length).toBeGreaterThan(informed.data.unknowns.length)
    // But the two that can never be answered from POS data alone always remain.
    expect(informed.data.unknowns.join(' ')).toContain('merchant service fee')
    expect(informed.data.unknowns.join(' ')).toContain('Least-cost routing')
    expect(informed.data.unknowns.length).toBe(2)
  })

  it('the provenance names the rule and never claims verified when the mix was guessed', () => {
    expect(ok().provenance.grounding).toBe('estimated')
    expect(ok({ mix: { debit: 1, consumer_credit: 0, commercial_credit: 0, foreign: 0 } }).provenance.grounding).toBe('derived')
    expect(ok().provenance.function).toBe('assessCardCost')
    expect(ok().provenance.rule).toContain('never presented as the merchant service fee')
  })
})
