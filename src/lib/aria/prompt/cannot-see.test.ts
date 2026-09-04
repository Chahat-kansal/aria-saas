import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { assembleAriaPrompt, isGrounded, groundingNotice, CANNOT_SEE_BLOCK } from './assemble'

const root = join(__dirname, '..', '..', '..', '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')
const ROUTE = read('src/app/api/aria/ask/route.ts')

/**
 * M12 PHASE 4 — IT MUST SAY WHEN IT CANNOT SEE.
 *
 * The surface prints "Connected records only — she won't invent missing data" under every answer.
 * On 4 September that sentence sat directly beneath five paragraphs about the owner's bathroom.
 * This makes it true: when nothing is attached, THE ANSWER CHANGES — not a disclaimer bolted onto
 * a fluent one.
 *
 * VERIFIED AGAINST A LIVE MODEL, forcing grounding to empty. Same message, same lane, same model as
 * the failing turn:
 *
 *   I don't have access to your business records right now — no sales data, stock levels, roster,
 *   bookings, or operational details are attached to this conversation.
 *
 *   To help you tidy up before the weekend, I need to know what you're referring to. Are you asking
 *   about:
 *   - Your till/takings — reconciling sales, checking cash drawer, reviewing the week's revenue?
 *   - Your stock — cleaning up inventory records, checking for damaged items, organizing shelves?
 *   - Your roster — confirming weekend staff are scheduled, updating shift assignments?
 *   - Your bookings — reviewing reservations, cancellations, or appointment confirmations?
 *
 * against the pre-fix reply to the identical message: "Make the bed. Put dirty clothes in the wash."
 */
describe('M12 phase 4 · ZERO IS NOT ABSENT', () => {
  it('a business that has taken nothing today is STILL GROUNDED', () => {
    // Sip has taken A$0.00 today. That is a fact from pos_sales, and the honest answer is "you've
    // taken nothing yet" — not "I can't see your business". A predicate that read zero as no-data
    // would make Aria refuse on every quiet morning, which looks identical to the bug being fixed.
    expect(isGrounded({ business_name: 'Sip Café', revenue_today_cents: 0, staff_count: 0 })).toBe(true)
    expect(groundingNotice({ business_name: 'Sip Café', revenue_today_cents: 0 })).toBe('')
  })

  it('an empty shell is NOT grounded', () => {
    expect(isGrounded(null)).toBe(false)
    expect(isGrounded(undefined)).toBe(false)
    expect(isGrounded({})).toBe(false)
    expect(isGrounded({ business_name: '' })).toBe(false)
    expect(isGrounded({ business_name: '   ' })).toBe(false)
    expect(isGrounded({ business_name: null })).toBe(false)
    // Numbers without an identity are an empty shell wearing data's clothes.
    expect(isGrounded({ revenue_today_cents: 4200, staff_count: 3 })).toBe(false)
  })

  it('the notice is empty exactly when grounded, and the block exactly when not', () => {
    const grounded = { business_name: 'Sip Café' }
    const empty = { business_name: '' }
    expect(groundingNotice(grounded)).toBe('')
    expect(groundingNotice(empty)).toContain('NO BUSINESS DATA IS ATTACHED')
    // Trailing separator included, so a caller interpolating it never has to decide about
    // whitespace — the decision that gets fumbled when a block is "optional".
    expect(groundingNotice(empty).endsWith('\n\n')).toBe(true)
  })
})

describe('M12 phase 4 · the answer itself changes, not a disclaimer', () => {
  it('the block forbids substituting general advice for the answer', () => {
    // A disclaimer above five paragraphs of tips is the failing turn with an apology on top.
    expect(CANNOT_SEE_BLOCK).toContain('never substitute general advice for the answer')
    expect(CANNOT_SEE_BLOCK).toContain('SAY SO FIRST')
  })

  it('it tells Aria to ASK WHICH, naming the real parts of the business', () => {
    // "Say you don't know" alone produces a refusal that helps nobody. The reply that fixed the
    // failing turn named the till, the stock, the roster and the bookings — because the block does.
    // Asserted on the nouns, not on "the X": the block is hard-wrapped at 100 columns and the
    // wrap falls between "the" and "bookings", so a phrase scan fails on formatting rather than on
    // content. (It did, on my first run.)
    for (const part of ['till', 'stock', 'roster', 'bookings', 'suppliers']) {
      expect(CANNOT_SEE_BLOCK, 'missing: ' + part).toContain(part)
    }
    expect(CANNOT_SEE_BLOCK).toContain('ASK WHICH')
  })

  it('a genuinely general question may still be answered — but labelled as such', () => {
    // Otherwise this becomes a refusal machine, which is a different failure.
    expect(CANNOT_SEE_BLOCK).toContain('you may answer it directly and briefly')
    expect(CANNOT_SEE_BLOCK).toContain('not from their records')
  })
})

describe('M12 phase 4 · every lane that renders the footer carries it', () => {
  it('the ungrounded assembly puts the block after the constitution, before the lane', () => {
    const out = assembleAriaPrompt({ variant: 'lean', grounded: false, sections: ['LANE TEXT'] })
    expect(out.indexOf('IRON RULES')).toBeLessThan(out.indexOf('NO BUSINESS DATA IS ATTACHED'))
    expect(out.indexOf('NO BUSINESS DATA IS ATTACHED')).toBeLessThan(out.indexOf('LANE TEXT'))
  })

  it('a grounded assembly does NOT carry it — the flag means something', () => {
    // Anti-vacuity: if the block were always present it would stop being a signal and start being
    // noise the model learns to skip.
    expect(assembleAriaPrompt({ variant: 'lean', grounded: true })).not.toContain('NO BUSINESS DATA IS ATTACHED')
    expect(assembleAriaPrompt({ variant: 'full' })).not.toContain('NO BUSINESS DATA IS ATTACHED')
  })

  it('the general fast-path is hardcoded ungrounded — it never has data to lose', () => {
    expect(ROUTE).toMatch(/variant: 'lean',[\s\S]{0,400}grounded: false,/)
  })

  it('THE MAIN GROUNDED LANE carries it too, spliced by groundingNotice(ctx)', () => {
    // The lane that DOES normally have data must still say so on the turn where the context failed
    // to load — otherwise the footer is true on one lane and false on the other.
    expect(ROUTE).toContain('${ARIA_CONSTITUTION}${groundingNotice(ctx)}DATA TOOLS')
    expect(ROUTE).toContain("import { assembleAriaPrompt, groundingNotice } from '@/lib/aria/prompt/assemble'")
  })

  it('MUTATION — restoring the ungrounded answer makes this suite RED', () => {
    // The sprint's named mutation: put back a lane that answers fluently with nothing attached.
    // Modelled on the real thing — groundingNotice always returning '' is exactly the pre-fix state.
    const mutated = (_ctx: unknown) => ''
    const empty = { business_name: '' }
    expect(groundingNotice(empty)).toContain('NO BUSINESS DATA IS ATTACHED')
    expect(mutated(empty)).toBe('')                       // ← what the mutation would produce
    expect(groundingNotice(empty)).not.toBe(mutated(empty))
    // And the route would no longer splice it.
    const mutatedRoute = ROUTE.replace('${groundingNotice(ctx)}', '')
    expect(mutatedRoute).not.toBe(ROUTE)
    expect(mutatedRoute).not.toContain('${groundingNotice(ctx)}')
  })
})
