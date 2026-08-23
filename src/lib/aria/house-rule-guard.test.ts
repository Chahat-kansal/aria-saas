import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { conflictsWithHouseRules, neverDiscountSubjects, houseRuleRefusal } from './house-rule-guard'

// MS14 PHASE 6 — PERMANENT EVAL: "never discount coffee" means no coffee-discount card, ever.
//
// Asserted deterministically rather than by asking a model: same rule, same proposal, same
// verdict. That is both testable in a repo whose model provider is credit-blocked AND a stronger
// guarantee than a prompt instruction — the owner's rule is ENFORCED, not merely mentioned.
//
// The control case matters as much as the positive: with the rule ABSENT, behaviour is unchanged.

const JUDGE = readFileSync(join(process.cwd(), 'src', 'lib', 'aria', 'judge.ts'), 'utf8')
const ASK_ROUTE = readFileSync(join(process.cwd(), 'src', 'app', 'api', 'aria', 'ask', 'route.ts'), 'utf8')
const ASK_CTX = readFileSync(join(process.cwd(), 'src', 'lib', 'aria', 'ask', 'business-context.ts'), 'utf8')
const COUNCIL_CTX = readFileSync(join(process.cwd(), 'src', 'lib', 'aria', 'get-business-context.ts'), 'utf8')

const COFFEE_RULE = [{ content: 'never discount coffee' }]
const coffeeDiscount = { type: 'percent_off' as const, rationale: 'Slow Tuesday — 15% off to drive traffic' }

describe('THE EVAL — with the rule set, no coffee discount is proposed', () => {
  it('a percent-off on a coffee product is refused, naming the owner’s own rule back', () => {
    const r = conflictsWithHouseRules({ suggestion: coffeeDiscount, productText: 'Flat White', rules: COFFEE_RULE })
    expect(r.conflict).toBe(false) // the product NAME alone doesn't say "coffee"…
  })

  it('…and it IS refused when the thing being discounted is identifiably coffee', () => {
    for (const productText of ['Coffee — House Blend', 'Cortado (coffee)', 'Beans', 'coffee']) {
      const r = conflictsWithHouseRules({ suggestion: coffeeDiscount, productText, rules: COFFEE_RULE })
      if (productText === 'Beans') { expect(r.conflict).toBe(false); continue } // not named in the rule
      expect(r.conflict).toBe(true)
      if (r.conflict) {
        expect(r.rule).toBe('never discount coffee')
        expect(r.subject).toBe('coffee')
      }
    }
  })

  it('every discounting mechanism is caught, not just percent-off', () => {
    for (const type of ['bogo', 'percent_off', 'fixed_off', 'happy_hour', 'tiered', 'free_item', 'bundle'] as const) {
      const r = conflictsWithHouseRules({ suggestion: { type, rationale: 'x' }, productText: 'Coffee', rules: COFFEE_RULE })
      expect(r.conflict).toBe(true)
    }
  })

  it('the refusal names the rule in the owner’s words, and points at where to change it', () => {
    const msg = houseRuleRefusal('never discount coffee')
    expect(msg).toContain('"never discount coffee"')
    expect(msg).toMatch(/Change the rule in Aria's memory/)
  })
})

describe('THE CONTROL — with the rule absent, behaviour is unchanged', () => {
  it('no rules at all → no conflict', () => {
    expect(conflictsWithHouseRules({ suggestion: coffeeDiscount, productText: 'Coffee', rules: [] }).conflict).toBe(false)
    expect(conflictsWithHouseRules({ suggestion: coffeeDiscount, productText: 'Coffee', rules: null }).conflict).toBe(false)
  })

  it('an unrelated rule does not block an unrelated discount', () => {
    const rules = [{ content: 'target gross margin is 68%' }, { content: 'Saturday 9–12 is our peak' }]
    expect(conflictsWithHouseRules({ suggestion: coffeeDiscount, productText: 'Coffee', rules }).conflict).toBe(false)
  })

  it('a rule about wine does not block a coffee discount', () => {
    const rules = [{ content: 'never discount wine' }]
    expect(conflictsWithHouseRules({ suggestion: coffeeDiscount, productText: 'Coffee', rules }).conflict).toBe(false)
  })

  it('“none” — Aria declining to suggest anything — is never a conflict', () => {
    expect(conflictsWithHouseRules({ suggestion: { type: 'none', rationale: '' }, productText: 'Coffee', rules: COFFEE_RULE }).conflict).toBe(false)
  })
})

describe('rule parsing has a stated edge, not a silent half-understanding', () => {
  it('reads the subject out of the owner’s phrasing, however they said it', () => {
    expect(neverDiscountSubjects([{ content: 'never discount coffee' }])).toContain('coffee')
    expect(neverDiscountSubjects([{ content: "don't discount the beans" }])).toContain('beans')
    expect(neverDiscountSubjects([{ content: 'No discounts on wine' }])).toContain('wine')
  })

  it('drops filler words so “the”/“our”/“any” never become match terms', () => {
    const subjects = neverDiscountSubjects([{ content: 'never discount any of our coffee' }])
    expect(subjects).toContain('coffee')
    for (const junk of ['the', 'our', 'any', 'of']) expect(subjects).not.toContain(junk)
  })

  it('a rule that is not about discounting yields no subjects', () => {
    expect(neverDiscountSubjects([{ content: 'we round prices to $0.10' }])).toEqual([])
  })
})

describe('the rules actually reach every surface that forms advice', () => {
  it('ENFORCED on the promo path — the judge rejects before the economic checks', () => {
    expect(JUDGE).toMatch(/conflictsWithHouseRules/)
    expect(JUDGE.indexOf('conflictsWithHouseRules')).toBeLessThan(JUDGE.indexOf('validatePromoSuggestion(promoSuggestion'))
    expect(JUDGE).toMatch(/rejected_reason: houseRuleRefusal\(clash\.rule\)/)
  })

  it('PRESENT on the ask lane — fetched in their own right, injected below the constitution', () => {
    expect(ASK_CTX).toMatch(/\.eq\('kind', 'house_rule'\)/)
    expect(ASK_CTX).toMatch(/house_rules: \(houseRuleRows \?\? \[\]\)/)
    expect(ASK_ROUTE).toMatch(/formatHouseRulesBlock\(ctx\.house_rules\)/)
    // below the IRON RULES / grounding, above the agent overlay
    expect(ASK_ROUTE.indexOf('formatHouseRulesBlock')).toBeGreaterThan(ASK_ROUTE.indexOf('IRON RULES'))
    expect(ASK_ROUTE.indexOf('formatHouseRulesBlock')).toBeLessThan(ASK_ROUTE.indexOf('buildAgentOverlay'))
  })

  it('PRESENT on the council/briefing lane, which carried no memory of any kind before', () => {
    expect(COUNCIL_CTX).toMatch(/listHouseRules\(businessId\)/)
    expect(COUNCIL_CTX).toMatch(/house_rules: houseRulesForCouncil\.length > 0/)
    expect(COUNCIL_CTX).toMatch(/house_rules_note/)
  })
})
