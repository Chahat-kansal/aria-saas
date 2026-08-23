import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { deriveHouseRules, buildReadback, HOUSE_RULE_QUESTIONS } from './onboarding-house-rules'

// MS14 PHASE 5 — ONBOARDING ASKS, ARIA READS IT BACK.
//
// The rule that governs this whole phase: an unanswered question produces NOTHING. Not a default,
// not a guess, not the placeholder we showed them. An unstated house rule is not a house rule.

const PAGE = readFileSync(join(process.cwd(), 'src', 'app', 'onboarding', 'page.tsx'), 'utf8')
const PROVISION = readFileSync(join(process.cwd(), 'src', 'app', 'api', 'onboarding', 'provision', 'route.ts'), 'utf8')

describe('completing onboarding produces house rules — in the owner’s words', () => {
  it('every answered question becomes exactly one rule', () => {
    const rules = deriveHouseRules({
      hr_margin_target: '68%',
      hr_never_discount: 'never discount coffee',
      hr_peak_times: 'Saturday 9–12 is our peak',
      hr_pricing_style: 'we round prices to $0.10',
      hr_non_negotiable: 'we never run out of oat milk',
    })
    expect(rules.length).toBe(5)
    // Free-text answers are stored VERBATIM — Aria does not rewrite the owner.
    expect(rules.map(r => r.content)).toContain('never discount coffee')
    expect(rules.map(r => r.content)).toContain('we round prices to $0.10')
    // The one numeric answer gets the owner's number in a plain sentence, nothing invented.
    expect(rules.map(r => r.content)).toContain('Target gross margin is 68%')
  })

  it('unrelated onboarding fields never become rules', () => {
    const rules = deriveHouseRules({ legal_name: 'Sip Pty Ltd', abn: '123', monthly_revenue: '$25k–$50k' })
    expect(rules).toEqual([])
  })
})

describe('a skipped question produces NO rule', () => {
  it('absent, blank and whitespace answers are all skipped', () => {
    const rules = deriveHouseRules({
      hr_margin_target: '68%',
      hr_never_discount: '',
      hr_peak_times: '   ',
      // hr_pricing_style absent entirely
      hr_non_negotiable: null as unknown as string,
    })
    expect(rules.length).toBe(1)
    expect(rules[0].question_id).toBe('hr_margin_target')
  })

  it('skipping EVERY question produces no rules at all — and no default is substituted', () => {
    expect(deriveHouseRules({})).toEqual([])
    expect(deriveHouseRules(null)).toEqual([])
    expect(deriveHouseRules(undefined)).toEqual([])
  })

  it('the placeholder echoed back is not treated as an answer', () => {
    const q = HOUSE_RULE_QUESTIONS.find(x => x.id === 'hr_never_discount')!
    expect(deriveHouseRules({ hr_never_discount: q.placeholder })).toEqual([])
  })
})

describe('Aria states what it now knows — and admits when it knows nothing', () => {
  it('reads back exactly the stated rules, nothing more', () => {
    const rules = deriveHouseRules({ hr_never_discount: 'never discount coffee', hr_margin_target: '68%' })
    const text = buildReadback('Sip Café', rules)
    expect(text).toContain("Here's what I now know about how Sip Café runs:")
    expect(text).toContain('• never discount coffee')
    expect(text).toContain('• Target gross margin is 68%')
  })

  it('with no answers it says so plainly instead of inventing a warm summary of nothing', () => {
    const text = buildReadback('Sip Café', [])
    expect(text).toContain("haven't been told any house rules")
    expect(text).not.toContain('•')
  })

  it('singular and plural read naturally', () => {
    const one = buildReadback('Sip', deriveHouseRules({ hr_margin_target: '68%' }))
    expect(one).toContain("I'll apply this everywhere")
    const many = buildReadback('Sip', deriveHouseRules({ hr_margin_target: '68%', hr_peak_times: 'Sat 9-12' }))
    expect(many).toContain("I'll apply these everywhere")
  })
})

describe('the flow is additive — no existing business is forced back through onboarding', () => {
  it("'rules' is appended LAST, so every existing step keeps its index", () => {
    expect(PAGE).toMatch(/VISUAL_STEPS = \['welcome', 'details', 'features', 'products', 'rules'\]/)
  })

  it('every house-rule question is skippable — the step never blocks Next', () => {
    expect(PAGE).toMatch(/if \(step === 'rules'\) return true;/)
  })

  it('the wizard renders the step and reads back through the SAME pure functions the server uses', () => {
    expect(PAGE).toContain('HouseRulesScreen')
    expect(PAGE).toMatch(/import \{ HOUSE_RULE_QUESTIONS, deriveHouseRules, buildReadback \}/)
  })
})

describe('persistence happens once, server-side, and can never fail provisioning', () => {
  it('provisioning derives and creates the rules', () => {
    expect(PROVISION).toMatch(/deriveHouseRules\(\(onb\?\.step_data as Record<string, unknown>\) \?\? \{\}\)/)
    expect(PROVISION).toMatch(/createHouseRule\(\{ businessId: biz\.id/)
    expect(PROVISION).toMatch(/sourceType: 'onboarding'/)
  })

  it('a retry does not duplicate rules', () => {
    expect(PROVISION).toMatch(/const seen = new Set\(existing\.map/)
    expect(PROVISION).toMatch(/if \(seen\.has\(rule\.content\.trim\(\)\.toLowerCase\(\)\)\) continue/)
  })

  it('a failed memory write never fails provisioning', () => {
    expect(PROVISION).toMatch(/catch \(hrErr\)[\s\S]{0,120}house rules non-fatal/)
  })
})
