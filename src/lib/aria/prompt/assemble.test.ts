import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { assembleAriaPrompt, assembleFullPrompt, CANNOT_SEE_BLOCK, ARIA_CONSTITUTION } from './assemble'

const root = join(__dirname, '..', '..', '..', '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')
const ROUTE = read('src/app/api/aria/ask/route.ts')
/**
 * Comments stripped. The assertions below check that a phrase is absent from any PROMPT — and the
 * commit that removed those phrases also added a comment quoting them, to record what was deleted
 * and why. Scanning the raw file matches that comment and fails on the documentation of the fix.
 * (My first version of this file did exactly that, on two assertions.)
 */
const ROUTE_CODE = ROUTE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const GUARD = read('scripts/canon-rail-guard.ts')
const SLIM = read('src/lib/aria/slim-context.ts')

/**
 * M12 PHASE 3 — ONE ASSEMBLY POINT.
 *
 * On 4 September an owner typed "Tidy up before the weekend" and Aria told him to make his bed. The
 * lane that answered had written its own 639-character prompt with the business explicitly
 * excluded. Seven lanes can answer in Ask Aria; four carried a different partial version of the
 * same rules and one carried none, because the only complete copy was a template literal inside a
 * route where nothing could import it.
 */
describe('M12 phase 3 · the constitution was MOVED, not rewritten', () => {
  it('ANTI-VACUITY — the constitution is real and substantial, not an empty export', () => {
    expect(ARIA_CONSTITUTION.length).toBeGreaterThan(4000)
    expect(ARIA_CONSTITUTION).toContain('IRON RULES')
  })

  it('it is BYTE-IDENTICAL to the text the route used to carry inline', () => {
    // The extraction was done by a script, not retyped, and this is what proves it — and what
    // notices if either half is edited later. The route now interpolates the constant, so the
    // assembled prompt is character-for-character what it was before this commit.
    expect(ROUTE).toContain('let systemPrompt = `${ARIA_CONSTITUTION}DATA TOOLS (read live business data):')
    // Every iron rule still present, in the constant rather than the route.
    for (const rule of [
      'NEVER COMPUTE NUMBERS YOURSELF',
      'NEVER STATE LOCATION, HOURS, CUISINE, OR BUSINESS CONCEPT',
      'ABSTAIN OVER GUESS',
      'ANTI-HALLUCINATION',
      'MARKETING CONSENT RULE',
      'FALSE COMPLETION RULE',
      'GENERAL QUESTION RULE',
    ]) {
      expect(ARIA_CONSTITUTION, 'missing: ' + rule).toContain(rule)
      expect(ROUTE_CODE.includes(rule), rule + ' still duplicated in the route').toBe(false)
    }
  })

  it('the full variant is a pure prefix — the route prompt is unchanged', () => {
    expect(assembleFullPrompt('DATA TOOLS…')).toBe(ARIA_CONSTITUTION + 'DATA TOOLS…')
  })
})

describe('M12 phase 3 · the constitution CANNOT be left out', () => {
  it('every variant carries it', () => {
    for (const variant of ['full', 'lookup', 'lean'] as const) {
      expect(assembleAriaPrompt({ variant }), variant).toContain('IRON RULES')
      expect(assembleAriaPrompt({ variant }).startsWith(ARIA_CONSTITUTION), variant).toBe(true)
    }
  })

  it('there is no parameter that removes it', () => {
    // A flag to skip the constitution would recreate the bug with an opt-out. Asserted as an
    // absence in the rail's own source.
    const src = read('src/lib/aria/prompt/assemble.ts')
    expect(src).not.toMatch(/skipConstitution|withoutConstitution|includeConstitution|bare\s*[?:]/)
    // It is prepended unconditionally — not inside any branch.
    expect(src).toContain('const parts: string[] = [ARIA_CONSTITUTION]')
  })

  it('a lane cannot bury it — sections are appended AFTER it', () => {
    const out = assembleAriaPrompt({ variant: 'lean', sections: ['LANE SAYS SOMETHING'] })
    expect(out.indexOf('IRON RULES')).toBeLessThan(out.indexOf('LANE SAYS SOMETHING'))
  })

  it('a business name is used only when known, never defaulted', () => {
    // IRON RULE 2 forbids the model inventing a business identity; the assembler must not do it on
    // the model's behalf either.
    expect(assembleAriaPrompt({ variant: 'lean', businessName: 'Sip Café' })).toContain('THE BUSINESS: Sip Café.')
    expect(assembleAriaPrompt({ variant: 'lean', businessName: null })).not.toContain('THE BUSINESS:')
    expect(assembleAriaPrompt({ variant: 'lean' })).not.toContain('THE BUSINESS:')
  })

  it('empty and whitespace sections are dropped, not rendered as blank gaps', () => {
    // Asserted on the JOIN, not the whole prompt: the constitution has its own blank-line runs,
    // and scanning the entire output for them tests its formatting rather than this function's.
    const out = assembleAriaPrompt({ variant: 'lean', sections: ['ALPHA', '', '   ', null, undefined, 'BETA'] })
    expect(out).toContain(['ALPHA', 'BETA'].join('\n\n'))
    expect(out.endsWith('BETA')).toBe(true)
  })
})

describe('M12 phase 3 · the lane that failed no longer writes its own prompt', () => {
  it('the general fast-path assembles through the rail, ungrounded', () => {
    expect(ROUTE).toMatch(/const generalSystemPrompt = assembleAriaPrompt\(\{\s*\n\s*variant: 'lean',/)
    expect(ROUTE).toMatch(/grounded: false,/)
  })

  it('THE BESPOKE PROMPT IS GONE — and so is the line that caused this', () => {
    // The exact instruction that produced the bedroom advice.
    expect(ROUTE_CODE).not.toContain('force a business angle')
    expect(ROUTE_CODE).not.toContain('like a smart, well-informed friend')
    expect(ROUTE_CODE).not.toContain('knowledgeable general assistant')
    // The general-question instruction is not lost — it lives in the constitution.
    expect(ARIA_CONSTITUTION).toContain('GENERAL QUESTION RULE')
  })

  it('the slim data-lookup lane carries it too, keeping its own instructions', () => {
    expect(SLIM).toContain('assembleAriaPrompt({')
    expect(SLIM).toContain("variant: 'lookup'")
    // Its own wording is kept, as a section rather than as the whole prompt.
    expect(SLIM).toContain('DIRECT DATA LOOKUP')
    expect(SLIM).toContain('YOU MUST CALL A DATA TOOL')
  })
})

describe('M12 phase 3 · the rail is enforced, not merely available', () => {
  it('the canon rail guard blocks a new Ask Aria prompt outside the rail', () => {
    expect(GUARD).toContain('ask-aria-prompt-outside-rail')
    expect(GUARD).toContain('ASK_ARIA_PROMPT_ALLOWLIST')
    expect(GUARD).toContain('assembleAriaPrompt() from src/lib/aria/prompt/assemble.ts')
  })

  it('the allowlist is exactly the two files that ARE the rail', () => {
    // A third entry would mean the rail had been routed around rather than adopted.
    const at = GUARD.indexOf('const ASK_ARIA_PROMPT_ALLOWLIST')
    expect(at).toBeGreaterThan(-1)
    // Sliced to the array's OWN closing bracket. My first version sliced to '// MS10 phase 1',
    // which occurs EARLIER in the file than this const — an empty slice that would have failed
    // however correct the allowlist was.
    const block = GUARD.slice(at, GUARD.indexOf(']', at))
    const entries = block.match(/'src\/[^']+'/g) ?? []
    expect(entries.sort()).toEqual(["'src/lib/aria/prompt/assemble.ts'", "'src/lib/aria/prompt/constitution.ts'"])
  })

  it('MUTATION — routing a lane around the rail is what the guard catches', () => {
    // Proven for real against the guard, not simulated: a file containing `You are Aria` under an
    // Ask Aria path produced
    //   src/lib/aria/ask/bypass-probe.ts:1  [ask-aria-prompt-outside-rail]
    // and the guard exited non-zero. The probe was removed. This assertion holds the two halves the
    // rule depends on so neither can be widened away.
    expect(GUARD).toMatch(/\/You are Aria\/\.test\(text\)/)
    expect(GUARD).toMatch(/src\\\/\(app\\\/api\\\/aria\\\/ask\\\/\|lib\\\/aria\\\//)
  })
})
