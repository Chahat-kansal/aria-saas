import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ClassifiedIntent } from '@/lib/aria/ask/intent'
import type { AriaIntent } from '@/lib/aria/ask/aria-intent'

/**
 * M19 · PHASE 4 — LANE DETERMINISM.
 *
 * ⚠️ WHERE THE VARIANCE WAS, measured in Phase 2 rather than guessed. `decide()` is a **pure
 * function** of `Understanding` (`run-turn.ts:160`). Its only non-deterministic inputs were the two
 * classifier model calls, which ran at the provider's **default sampling temperature** — which is why
 * M17B watched *"Tidy up before the weekend"* route general, general, general, question on identical
 * code. The message never changed; the classification did.
 *
 * ⚠️ WHAT THESE TESTS CAN AND CANNOT PROVE, stated up front because the difference matters.
 *
 * They CAN prove: the decision layer is deterministic for a fixed classification, and all four
 * classifier call sites pin `temperature: 0` with the value reaching the provider request.
 *
 * They CANNOT prove: that a provider at temperature 0 is bit-for-bit deterministic. No unit test can —
 * it needs real calls, which WALL 11 blocks and which cost money. **Temperature 0 is the available
 * lever, not a mathematical guarantee**, and the run log says so.
 */

const classifyIntentFn = vi.fn()
const classifyAriaIntentFn = vi.fn()

vi.mock('@/lib/aria/ask/intent', () => ({
  classifyIntent: (...a: unknown[]) => classifyIntentFn(...a) as unknown,
  detectOutputFormat: () => ({ wants_download: false, wants_chart: false, wants_table: false, wants_comparison: false }),
}))
vi.mock('@/lib/aria/ask/aria-intent', () => ({
  classifyAriaIntent: (...a: unknown[]) => classifyAriaIntentFn(...a) as unknown,
}))
vi.mock('./anchors', async orig => ({
  ...(await orig<typeof import('./anchors')>()),
  loadAnchorSet: async () => ({ figures: [], queries: [], emptyReason: 'stubbed for determinism tests' }),
}))

const { understand, decide } = await import('./run-turn')

const INTENT = (over: Partial<ClassifiedIntent> = {}) =>
  ({ type: 'general', complexity: 'simple', confidence: 0.9, ...over }) as ClassifiedIntent
const ARIA = (over: Partial<AriaIntent> = {}) =>
  ({ intent_type: 'general', comparison_period: null, routing_reason: 'r', ...over }) as AriaIntent

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const INPUT = (message: string) => ({
  req: new Request('http://localhost/api/aria/ask', { method: 'POST' }),
  bid: 'ff5055a0-c351-4ada-817a-1804961035f3', userId: 'u1', supabase: {} as never,
  message, conversationId: null, attachments: [], clientMessages: [],
  noticeRef: null, branchIntent: { mode: 'append' as const },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as any

/** Runs the real understand() + decide() and returns the lane order it chose. */
async function lanesFor(message: string): Promise<string> {
  const u = await understand(INPUT(message))
  return decide(u, INPUT(message)).map(s => s.name).join(' > ')
}

beforeEach(() => {
  classifyIntentFn.mockReset()
  classifyAriaIntentFn.mockReset()
})

describe('M19 phase 4 · the same message with the same state picks the same lane', () => {
  /**
   * The brief: *"Tidy up before the weekend run 20 times against fixed state, asserting one lane 20
   * times"* — plus one question and one general message.
   */
  const CASES: Array<[string, string, ClassifiedIntent, AriaIntent]> = [
    ['M17B’s own counter-example', 'Tidy up before the weekend', INTENT({ type: 'general' }), ARIA({ intent_type: 'general' })],
    ['a question', 'how are we doing this week?', INTENT({ type: 'question', complexity: 'complex' }), ARIA({ intent_type: 'analytical' })],
    ['a general message', 'thanks, that helps', INTENT({ type: 'general' }), ARIA({ intent_type: 'smalltalk' })],
  ]

  for (const [label, message, intent, aria] of CASES) {
    it(`⚠️ ${label} — "${message}" picks ONE lane, 20 runs out of 20`, async () => {
      classifyIntentFn.mockResolvedValue(intent)
      classifyAriaIntentFn.mockResolvedValue(aria)

      const seen = new Set<string>()
      for (let i = 0; i < 20; i++) seen.add(await lanesFor(message))

      // ⚠️ ONE distinct outcome across 20 runs. A Set of size 1 is the assertion; a count of 20 would
      // pass even if every run differed.
      expect(
        [...seen],
        'the same message with the same classification produced more than one lane order',
      ).toHaveLength(1)
      expect(classifyIntentFn).toHaveBeenCalledTimes(20)   // it really ran 20 times
    })
  }

  it('⚠️ A DIFFERENT CLASSIFICATION STILL PICKS A DIFFERENT LANE — anti-vacuity', async () => {
    // Without this, a `decide()` that returned a constant would pass all three tests above and have
    // destroyed routing. The SAME message must route differently when the classifier disagrees —
    // which is also precisely the variance temperature 0 exists to remove.
    classifyIntentFn.mockResolvedValue(INTENT({ type: 'general' }))
    classifyAriaIntentFn.mockResolvedValue(ARIA({ intent_type: 'general' }))
    const asGeneral = await lanesFor('Tidy up before the weekend')

    classifyIntentFn.mockResolvedValue(INTENT({ type: 'question', complexity: 'complex' }))
    classifyAriaIntentFn.mockResolvedValue(ARIA({ intent_type: 'analytical' }))
    const asQuestion = await lanesFor('Tidy up before the weekend')

    expect(asGeneral).not.toBe(asQuestion)
    expect(asGeneral).toContain('general')
    expect(asQuestion).toContain('council')
  })

  it('decide() is pure — the same Understanding twice gives the identical array', async () => {
    classifyIntentFn.mockResolvedValue(INTENT({ type: 'question', complexity: 'complex' }))
    classifyAriaIntentFn.mockResolvedValue(ARIA({ intent_type: 'analytical' }))
    const u = await understand(INPUT('how are we doing this week?'))
    expect(decide(u, INPUT('x')).map(s => s.name)).toEqual(decide(u, INPUT('x')).map(s => s.name))
  })
})

describe('M19 phase 4 · every classifier call site pins the temperature', () => {
  // src/lib/aria/ask/pipeline -> ask -> aria -> lib -> src -> repo root. Five, not four: my first
  // version used four and all three scans below failed on a path, not on the code they were checking.
  const root = join(__dirname, '..', '..', '..', '..', '..')
  /** Comments stripped: a scan that reads its own prose as code gets loosened until it stops firing. */
  const code = (p: string) =>
    readFileSync(join(root, p), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

  const CLASSIFIERS = ['src/lib/aria/ask/intent.ts', 'src/lib/aria/ask/aria-intent.ts']

  it('⚠️ BOTH CLASSIFIERS PIN temperature: 0 ON BOTH OF THEIR CALL SITES', () => {
    // Two each: the gateway call, and the direct-Gemini fallback that BYPASSES the gateway. Pinning
    // only the first would leave the fallback sampling — and with Anthropic at 0 successes since
    // 21 Sep, the fallback is the path that actually runs.
    for (const f of CLASSIFIERS) {
      const n = (code(f).match(/temperature:\s*0\b/g) ?? []).length
      expect(n, f + ' pins temperature on ' + n + ' call site(s), expected 2').toBe(2)
    }
  })

  it('⚠️ THE GEMINI PROVIDER HONOURS A PASSED 0 RATHER THAN COLLAPSING IT TO ITS DEFAULT', () => {
    // `params.temperature ?? 0.2`, never `||`. With `||`, a deliberate 0 becomes 0.2 and this whole
    // phase is a silent no-op on the live path. That one character is the phase.
    const g = code('src/lib/aria/providers/gemini.ts')
    expect(g).toMatch(/temperature:\s*params\.temperature\s*\?\?\s*0\.2/)
    expect(g).not.toMatch(/temperature:\s*params\.temperature\s*\|\|/)
  })

  it('⚠️ THE FALLBACK FORWARDS IT — it was dropped here, which is why pinning alone was not enough', () => {
    /**
     * ⚠️ SCOPED TO `tryGeminiFallback`, and my first version was not. It matched
     * `/temperature:\s*params\.temperature/` anywhere in the file — which hit the PRE-EXISTING
     * `...(params.temperature !== undefined ? { temperature: params.temperature } : {})` at
     * anthropic.ts:225. So deleting the forwarding line I added left the test green: it was reading a
     * line that had always been there. The mutation check caught it.
     */
    const a = code('src/lib/aria/providers/anthropic.ts')
    const start = a.indexOf('async function tryGeminiFallback')
    expect(start, 'tryGeminiFallback not found').toBeGreaterThan(-1)
    const body = a.slice(start, a.indexOf('\n}', start))
    expect(body).toContain('callGemini(')
    expect(body, 'tryGeminiFallback does not forward the temperature to callGemini').toMatch(/temperature:\s*params\.temperature/)
  })
})
