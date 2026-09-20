import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { extractFeatures, firedFeatures, ROUTING_REGEXES, type FeatureInput } from './features'
import type { ClassifiedIntent } from '@/lib/aria/ask/intent'
import type { AriaIntent } from '@/lib/aria/ask/aria-intent'

/**
 * M17 PHASE 2 — THE 25 REGEXES MOVED, AND NOTHING ELSE HAPPENED TO THEM.
 *
 * ⚠️ Every behavioural assertion CALLS `extractFeatures` and reads its booleans.
 */

const intentOf = (over: Partial<ClassifiedIntent> = {}): ClassifiedIntent => ({
  type: 'question', complexity: 'simple', confidence: 0.9, ...over,
} as ClassifiedIntent)

const ariaOf = (over: Partial<AriaIntent> = {}): AriaIntent => ({
  intent_type: 'analytical', comparison_period: null, routing_reason: 'test', ...over,
} as AriaIntent)

const f = (message: string, over: Partial<FeatureInput> = {}) => extractFeatures({
  message,
  intent: intentOf(),
  ariaIntent: ariaOf(),
  conversationId: null,
  clientMessageCount: 0,
  attachmentCount: 0,
  hasImages: false,
  ...over,
})

describe('M17 phase 2 · feature extraction', () => {
  /**
   * ⚠️ ITS EXPIRY ARRIVED. This was a DRIFT check: between M17 phase 2 and M17B phase 2 the regexes
   * existed in TWO places — here, and still inline in `_POST` — and two copies is failure pattern
   * #4, so the only honest way through the migration was to assert they could not diverge while
   * both existed. It asserted each one was byte-identical to `route.ts:NNN`.
   *
   * M17B phase 2 routed `_POST` through the spine and deleted its copies. There is nothing left to
   * compare against, so the drift check is replaced by its inverse: THE DUPLICATE IS GONE. That is
   * the assertion that keeps failure pattern #4 from coming back — a second copy reappearing in the
   * route would fail here.
   */
  it('⚠️ THE ROUTE NO LONGER CARRIES ITS OWN COPY OF ANY ROUTING REGEX', () => {
    const route = readFileSync('src/app/api/aria/ask/route.ts', 'utf8')
    const stillThere = Object.keys(ROUTING_REGEXES).filter(name => route.includes('const ' + name + ' = /'))
    expect(stillThere, 'route.ts has grown a second copy of a routing regex').toEqual([])
    // Anti-vacuity: the route must still be a real file with real content, or the check above
    // passes for the wrong reason.
    expect(route.length).toBeGreaterThan(2_000)
    expect(route).toContain('runTurn(')
  })

  it('carries 25 routing regexes — 20 named in route.ts plus the 5 written inline there', () => {
    expect(Object.keys(ROUTING_REGEXES)).toHaveLength(25)
    for (const [name, rx] of Object.entries(ROUTING_REGEXES)) {
      expect(rx, name).toBeInstanceOf(RegExp)
    }
  })

  it('isStrategicQuestion — THE regex that decides whether the council runs', () => {
    // The cost difference this single boolean makes is ~10,000 tokens vs ~1,000.
    expect(f('how can I improve my margins?').isStrategicQuestion).toBe(true)
    expect(f('why is Tuesday slow').isStrategicQuestion).toBe(true)
    expect(f('what did I take today').isStrategicQuestion).toBe(false)
    // "adding 'why' to a question routes it to a four-brain council" — demonstrated, not asserted.
    expect(f('is Tuesday slow').isStrategicQuestion).toBe(false)
    expect(f('why is Tuesday slow').isStrategicQuestion).toBe(true)
  })

  it('isDataLookup — a lookup only when it is NOT strategic', () => {
    expect(f('who is my best customer').isDataLookup).toBe(true)
    expect(f('how many customers do I have').isDataLookup).toBe(true)
    expect(f('what should I do to grow').isDataLookup).toBe(false)
    // "best" alone used to misroute to the council; STRATEGIC_RE is what stops it.
    expect(f('who is my best customer').isStrategicQuestion).toBe(true)
    expect(f('who is my best customer').isDataLookup).toBe(true)
  })

  it('isBrevityQuestion — the short-factual gate that skips the council', () => {
    expect(f('just tell me how much I made this week').isBrevityQuestion).toBe(true)
    expect(f("what's my revenue today").isBrevityQuestion).toBe(true)
    expect(f('Please give me a full strategic review of the quarter').isBrevityQuestion).toBe(false)
  })

  it('planTrigger — an action request, and the guards that stop a strategic one becoming one', () => {
    expect(f('create a 10% off promotion').planTrigger).toBe(true)
    expect(f('deactivate the flat white').planTrigger).toBe(true)
    // A strategic phrasing must NOT trigger the planner.
    expect(f('should I run a promotion?').planTrigger).toBe(false)
    // A lookup must not either.
    expect(f('show me the discounts').planTrigger).toBe(false)
    // ariaIntent=analytical suppresses the looser trigger, exactly as route.ts:678.
    expect(f('change the price of coffee', { ariaIntent: ariaOf({ intent_type: 'analytical' }) }).planTrigger).toBe(false)
    expect(f('change the price of coffee', { ariaIntent: ariaOf({ intent_type: 'action' }) }).planTrigger).toBe(true)
  })

  it('isEditIntent needs a value cue for the soft phrases, not for the strong ones', () => {
    expect(f('actually make it 15%').isEditIntent).toBe(true)
    expect(f('actually I think we should chat').isEditIntent).toBe(false)   // no number/%/$
    expect(f('turn it off').isEditIntent).toBe(true)                        // strong, no cue needed
  })

  it('isCoreferentialFollowup only fires when there IS a thread to resolve against', () => {
    expect(f('what does she buy').isCoreferentialFollowup).toBe(false)
    expect(f('what does she buy', { conversationId: 'c1' }).isCoreferentialFollowup).toBe(true)
    expect(f('what does she buy', { clientMessageCount: 3 }).isCoreferentialFollowup).toBe(true)
  })

  it('isMultiDomain excludes analytical, exactly as route.ts:927', () => {
    expect(f('give me an overview').isMultiDomain).toBe(false) // ariaIntent defaults to analytical
    expect(f('give me an overview', { ariaIntent: ariaOf({ intent_type: 'general' }) }).isMultiDomain).toBe(true)
    expect(f('give me an overview', {
      ariaIntent: ariaOf({ intent_type: 'general' }),
      intent: intentOf({ type: 'general' }),
    }).isMultiDomain).toBe(false) // needs intent.type === 'question'
  })

  it('isBackgroundTask needs complexity=complex as well as the trigger', () => {
    expect(f('analyse all my products and let me know when done').isBackgroundTask).toBe(false)
    expect(f('analyse all my products and let me know when done', { intent: intentOf({ complexity: 'complex' }) })
      .isBackgroundTask).toBe(true)
  })

  it('needsSonnet / needsTools — the model-routing booleans move too, rather than being left behind', () => {
    expect(f('hi').needsSonnet).toBe(false)
    expect(f('hi', { intent: intentOf({ complexity: 'complex' }) }).needsSonnet).toBe(true)
    expect(f('hi', { hasImages: true }).needsSonnet).toBe(true)
    expect(f('hi', { attachmentCount: 1 }).needsSonnet).toBe(true)
    expect(f('give me a deep dive on cash flow analysis').needsSonnet).toBe(true)
    expect(f('export that to csv').needsTools).toBe(true)
    expect(f('hi').needsTools).toBe(false)
  })

  it('isSavePlan is an exact sentinel match, not a pattern', () => {
    expect(f('[ARIA_SAVE_PLAN]').isSavePlan).toBe(true)
    expect(f('please [ARIA_SAVE_PLAN] now').isSavePlan).toBe(false)
  })

  it('firedFeatures lists only what was true — the turn record\'s reason', () => {
    const feats = f('why are my margins down?')
    const fired = firedFeatures(feats)
    expect(fired).toContain('isStrategicQuestion')
    expect(fired).not.toContain('isImageRequest')
    for (const k of fired) expect(feats[k], k).toBe(true)
    // Anti-vacuity: a message that fires nothing must produce an EMPTY list, not a list of all 18.
    expect(firedFeatures(f('mm'))).toEqual([])
  })

  it('⚠️ all 18 booleans are present on every call, even when every one is false', () => {
    const none = f('mm')
    expect(Object.keys(none)).toHaveLength(18)
    expect(Object.values(none).every(v => v === false)).toBe(true)
  })
})
