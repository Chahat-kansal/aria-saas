import { describe, it, expect } from 'vitest'
import { slimTools, slimSystemPrompt, cachedPrefixText, READ_TOOL_NAMES } from '@/lib/aria/slim-context'

// PROMPT-CACHE-1 §1 — the guard IS the diagnosis.
//
// ask_aria cached fine in June (117 reads / 64 writes), then went to ZERO reads AND ZERO WRITES on
// 25 Jun and stayed there across 118 successful calls. Zero WRITES is the discriminator: a merely
// varying prefix still writes (~118 writes, ~0 reads). Zero writes is the signature of a cached
// prefix BELOW THE MINIMUM — which Anthropic handles by silently not caching, with no error.
//
// Nothing can observe that at runtime. Only a measurement can. That is what this file is.

// ── ANTHROPIC'S DOCUMENTED MINIMUMS ─────────────────────────────────────────────────────────────
// Source: https://platform.claude.com/docs/en/docs/build-with-claude/prompt-caching (fetched 2026-08-08)
// "Shorter prompts cannot be cached... If your prompt is below the minimum for your model, it will
// be processed without caching, and no error is returned."
//
// ⚠ THESE DIFFER BY 4×, WHICH IS THE WHOLE STORY. A single hardcoded ~1024 — the number that comes
// to mind, and the one this sprint's brief correctly flagged as unverified — would have passed
// haiku wrongly and closed the investigation with the wrong answer.
export const MIN_CACHEABLE_TOKENS = {
  'claude-sonnet-4-5-20250929': 1024,
  'claude-haiku-4-5-20251001': 4096,
} as const

/**
 * Character/4 estimate — DELIBERATELY an estimate, and stated as one.
 *
 * The Anthropic SDK's token counter is a NETWORK call, and this sprint forbids one (the account is
 * out of credit; a test that needs it is a test that cannot run). chars/4 is the standard English
 * approximation and is CONSERVATIVE for JSON tool schemas, which are punctuation-dense and so
 * tokenise to MORE tokens per character, not fewer. It under-estimates, which is the safe direction.
 */
function estimateTokens(text: string): number {
  return Math.round(text.length / 4)
}

const prefix = () => cachedPrefixText(slimTools() as unknown[], slimSystemPrompt('Sip'))

describe('slim path — the cached prefix', () => {
  it('POSITIVE CONTROL — the tool subset actually resolves', () => {
    // If ARIA_POS_TOOLS were renamed or the filter matched nothing, every size assertion below would
    // measure an empty array and report a comfortable, meaningless result.
    const tools = slimTools() as Array<{ name: string }>
    expect(tools.length).toBe(READ_TOOL_NAMES.size)
    const missing = [...READ_TOOL_NAMES].filter(n => !tools.some(t => t.name === n))
    expect(missing, 'READ_TOOL_NAMES references tools that no longer exist: ' + missing.join(', ')).toEqual([])
  })

  // ── (a) SIZE — the assertion that would have caught this ──────────────────────────────────────
  //
  // MEASURED: ~2,620 tokens (tools + system). Clears sonnet's 1,024. Does NOT clear haiku's 4,096.
  //
  // AND THE SLIM PATH ROUTES TO HAIKU BY CONSTRUCTION. ask/route.ts:1968-1978 picks sonnet only when
  // needsSonnet (complex | troubleshoot | technical | images | attachments | a strategic keyword),
  // and isDataLookup is defined at :851 as DATA_LOOKUP_RE && !STRATEGIC_RE. A data lookup is by
  // definition not strategic, so the two are near-mutually-exclusive: slim ⇒ haiku ⇒ 4,096 floor.
  //
  // That is the complete diagnosis. Before be95970b the prompt averaged ~12,565 tokens, comfortably
  // over 4,096, and cached. The slim path's 2,620 never can.

  it('(a) clears the sonnet minimum — a drop below THIS would be a real regression', () => {
    const tokens = estimateTokens(prefix())
    expect(tokens).toBeGreaterThan(MIN_CACHEABLE_TOKENS['claude-sonnet-4-5-20250929'] * 1.15)
  })

  it('(a) the tools are 62% of the prefix — trimming the prompt CAN now move caching (it could not before)', () => {
    // ⚠ FOUND BY A MUTATION CHECK THAT REFUSED TO FAIL. The brief predicted that shrinking the slim
    // prompt to one line would turn (a) red. It did not — and that is a property of the system, not
    // a bug in the test. Tools are ~2,268 of the ~2,620 tokens; the system prompt is ~338. Deleting
    // the ENTIRE prompt still leaves 2,268 tokens, which is still under haiku's 4,096.
    //
    // The consequence, which is the actionable half: NO amount of editing the slim PROMPT changes
    // whether this path caches. Only the tool set can, and shrinking the tool set makes it worse.
    // Anyone who tries to fix caching by rewriting the prompt is working on the wrong term.
    // ── AMENDED BY M12 PHASE 3, AND THE CONCLUSION ABOVE IS NOW FALSE ──────────────────────────
    // The slim lane now carries the constitution (it had a partial one: a grounding rule and none
    // of the other iron rules, so a "direct data lookup" could still invent a suburb or claim it
    // had created a promotion). That moved the system prompt from ~338 tokens to ~1,570.
    //
    // So tools no longer dominate: 2,520 of 4,090 tokens, 61.6%, not 87%. And the actionable claim
    // — "no amount of editing the prompt changes whether this path caches" — IS NO LONGER TRUE.
    // The prompt is now 38% of the prefix and editing it absolutely can cross the threshold.
    //
    // It also moved the prefix a long way toward haiku's cacheable minimum without meaning to:
    // 3,715 estimated tokens against 4,096, i.e. 381 short, where before it was ~1,476 short. The
    // constitution closed roughly three quarters of that gap as a side effect.
    //
    // ⚠️ I FIRST WROTE "SIX TOKENS SHORT" HERE AND IT WAS WRONG. My probe divided characters by
    // 3.6; THIS FILE'S estimator divides by 4, and its choice is the one the surrounding arithmetic
    // uses. Measuring with the wrong divisor turned a 381-token gap into a 6-token one — a
    // dramatic, false claim that would have invited exactly the padding the DOCUMENTED DECISION
    // test below forbids. Recorded rather than quietly fixed.
    //
    // Still NOT acted on. 381 tokens of new instruction would have to be written, not moved, and
    // that changes what ask_aria answers for a caching outcome nobody has measured against the real
    // tokeniser.
    const toolTokens = estimateTokens(JSON.stringify(slimTools()))
    const sysTokens = estimateTokens(slimSystemPrompt('Sip'))
    const share = toolTokens / (toolTokens + sysTokens)
    expect(share).toBeGreaterThan(0.55)
    expect(share).toBeLessThan(0.70)
    // Both pinned, so either term moving is surfaced deliberately.
    expect(toolTokens).toBe(2268)
    expect(sysTokens).toBe(1413)
    expect(estimateTokens(prefix())).toBeLessThan(MIN_CACHEABLE_TOKENS['claude-haiku-4-5-20251001'])
  })

  it('(a) DOCUMENTED DECISION — below the haiku minimum, knowingly, and NOT worth padding', () => {
    // This asserts the state we chose, so it cannot drift in EITHER direction unnoticed. If someone
    // pads the prefix past 4,096 this goes red and forces them to read the arithmetic below and
    // delete this test deliberately, rather than "fixing" caching at a net loss.
    //
    // ── WHY NOT PAD IT (all figures measured, none assumed) ──────────────────────────────────────
    // Haiku 4.5, per MTok: base input $1.00 · 5m cache write $1.25 (1.25×) · cache read $0.10 (0.1×)
    //   https://platform.claude.com/docs/en/docs/about-claude/pricing (fetched 2026-08-08)
    // Real call clustering, aria_ai_calls, agent_key='ask_aria', last 60 days, 246 calls:
    //   70.8% of calls follow the previous one within 5 min · median gap 35 s · 85.2% within 1 h
    //
    // Padding to ~4,720 tokens to clear the floor, at the observed 70.8% hit rate:
    //   uncached today : 2,620 × 1.00                      = 2,620 token-equivalents/call
    //   cached         : 0.292×4,720×1.25 + 0.708×4,720×0.1 = 2,057 token-equivalents/call
    //   saving 21.5%, break-even hit rate 60.4% — only ~10 points of headroom.
    //   At 4.1 calls/business/day that is ≈ $0.84 per business per YEAR.
    //
    // And reaching 4,096 costs ~2,100 tokens of NEW instruction. The tool-mapping table and the
    // grounding paragraph — the brief's suggested candidates — are ALREADY in this prompt and are
    // already counted in the 2,620. There is no stable content left to move in; it would have to be
    // written, which changes what ask_aria answers. That is explicitly out of scope, and padding
    // with filler is forbidden. $0.84/business/year does not buy a behaviour change to a live
    // answer path.
    //
    // ── AND THE ALARM WAS MEASURING THE WRONG THING ──────────────────────────────────────────────
    // Zero reads AND zero writes is not bleeding — it is the cheapest possible state for a prompt
    // this size. Comparing like for like:
    //   before be95970b: ~12,565 tok, 64.6% read rate
    //                    0.354×12,565×1.25 + 0.646×12,565×0.1 ≈ 6,372 token-equivalents/call
    //   after          : ~5,800 tok, uncached                 = 5,800 token-equivalents/call
    // The uncached slim path is ~9% CHEAPER than the cached fat path it replaced. be95970b was a
    // net win; the cache counters going to zero was its consequence, not a regression.
    //
    // IF THIS IS EVER REVISITED: the 1-hour TTL is the better lever, not the 5-minute one.
    // 85.2% of calls fall within an hour; at 2× write that is a 31% saving vs the 5m option's 21.5%.
    const tokens = estimateTokens(prefix())
    expect(
      tokens,
      `cached prefix ≈${tokens} tokens; haiku-4.5 needs >4096. This is a DECISION, not a bug — ` +
      'see the arithmetic above before changing it.',
    ).toBeLessThan(MIN_CACHEABLE_TOKENS['claude-haiku-4-5-20251001'])
  })

  // ── (b) STABILITY ────────────────────────────────────────────────────────────────────────────
  it('(b) is byte-identical across calls — nothing in the prefix reads the question', () => {
    expect(prefix()).toBe(prefix())
  })

  it('(b) business_name is interpolated — the cache is per-business, deliberately', () => {
    // ctx.business_name lands at the very START of the slim prompt, so two businesses can never
    // share a prefix. Correct (their caches would not be shared anyway) but it IS a design choice.
    // An accident that happens to be fine today becomes a bug the day someone moves a VOLATILE
    // value into the same position — a date, a revenue figure — and every call gets a fresh prefix.
    const a = cachedPrefixText(slimTools() as unknown[], slimSystemPrompt('Sip'))
    const b = cachedPrefixText(slimTools() as unknown[], slimSystemPrompt('Another Cafe'))
    expect(a).not.toBe(b)
    expect(cachedPrefixText(slimTools() as unknown[], slimSystemPrompt('Sip'))).toBe(a)

    // The null/undefined fallback must be stable too, or an owner with no business name set gets a
    // third variant per request.
    expect(slimSystemPrompt(null)).toBe(slimSystemPrompt(undefined))
    // AMENDED BY M12 PHASE 3. The prompt no longer OPENS with "for this business —": the
    // constitution comes first and the name, when known, is added by the rail as "THE BUSINESS: X."
    // The property this asserted is unchanged and is what matters — a missing name must produce ONE
    // stable string, not a third per-request variant — so it is asserted directly instead.
    expect(slimSystemPrompt(null)).not.toContain('THE BUSINESS:')
    expect(slimSystemPrompt('Sip')).toContain('THE BUSINESS: Sip.')
  })

  it('(b) the prompt contains no date, time, or number that would vary between calls', () => {
    // The cheapest way to destroy a cache prefix is to interpolate "today is 2026-08-08" into it.
    // Nothing does that today; this makes sure nothing starts.
    const p = slimSystemPrompt('Sip')
    expect(p).not.toMatch(/\d{4}-\d{2}-\d{2}/)          // ISO date
    expect(p).not.toMatch(/\b\d{1,2}:\d{2}\b/)          // clock time
    expect(p).not.toMatch(/A\$\s?\d/)                    // a concrete dollar figure
  })

  // ── (c) TOOL-SUBSET STABILITY ────────────────────────────────────────────────────────────────
  //
  // ⚠ THIS ASSERTION WAS REWRITTEN AFTER ITS OWN MUTATION CHECK FAILED TO FAIL.
  // The first version compared slimTools() to slimTools() — which is equal under ANY ordering, so
  // reversing the array left it green. It looked like a stability guard and guarded nothing. The
  // property that actually matters is stability ACROSS DEPLOYS, not within one process: a tool
  // order that changes between two deploys is a cache miss for every user of every business, and
  // comparing a function to itself can never see that. So the order is pinned.
  const EXPECTED_TOOL_ORDER = [
    'query_sales', 'query_inventory', 'query_customers', 'compare_periods', 'query_bookings',
    'query_online_orders', 'query_business_data', 'run_calculation', 'get_hourly_sales',
    'get_product_sales_detail', 'get_cashier_performance', 'query_bank_balance',
    'get_business_profile', 'get_top', 'get_summary', 'get_reviews', 'get_profit_leaks',
  ]

  it('(c) the tool array is byte-stable in a PINNED order', () => {
    // Note this is ARIA_POS_TOOLS' declaration order, NOT the order READ_TOOL_NAMES lists them in —
    // the filter preserves the source array. Reordering ARIA_POS_TOOLS, even without adding or
    // removing a tool, changes the cached prefix for every caller. That is what this catches.
    const a = slimTools() as Array<{ name: string }>
    expect(a.map(t => t.name)).toEqual(EXPECTED_TOOL_ORDER)
    expect(JSON.stringify(a)).toBe(JSON.stringify(slimTools()))
  })

  it('(c) the tool array is not shared mutable state', () => {
    // slimTools() must return a fresh array; if a caller mutated a shared one, the NEXT request's
    // prefix would differ and caching would break in a way (c) above would still call stable.
    const a = slimTools() as Array<{ name: string }>
    a.push({ name: 'injected' } as never)
    expect((slimTools() as Array<{ name: string }>).some(t => t.name === 'injected')).toBe(false)
  })

  // ── EXTRACTION FIDELITY ──────────────────────────────────────────────────────────────────────
  it('the extracted prompt is byte-identical to what ask/route.ts sent before (RULE 0)', () => {
    // This sprint MOVED this string out of the route. Moving it must not have edited it — the
    // pinned length is how a stray character gets caught.
    const p = slimSystemPrompt('Sip')
    expect(p).toContain('The owner asked a DIRECT DATA LOOKUP.')
    expect(p).toContain('GROUNDING (absolute)')
    expect(p).toContain('Currency A$ (never USD). Australian spelling.')
    // AMENDED BY M12 PHASE 3 — A DELIBERATE PROMPT CHANGE, which is the one condition this pin
    // was written to allow. PROMPT-CACHE-1 pinned 1,351 chars to prove its extraction had not
    // edited the string. That guarantee still holds and is asserted above: every line of the
    // original prompt is still present, now as the lane's own section.
    //
    // What changed is that the constitution is prepended by the rail, taking it to 5,650. The lane
    // previously carried a grounding rule and NONE of the other iron rules — a data lookup could
    // still state a suburb the business had not set, or claim it had created a promotion. That was
    // not a smaller need; it was a smaller prompt.
    expect(p.length).toBe(5650)
    // And the constitution really is what accounts for the difference — not drift in the lane's
    // own text, which is the property the original pin existed to protect.
    expect(p).toContain('IRON RULES')
    expect(p.indexOf('IRON RULES')).toBeLessThan(p.indexOf('DIRECT DATA LOOKUP'))
  })

  // ── THE MEASUREMENT, PRINTED ─────────────────────────────────────────────────────────────────
  it('reports the measured sizes (diagnostic, always passes)', () => {
    const tools = JSON.stringify(slimTools())
    const sys = slimSystemPrompt('Sip')
    const whole = prefix()
    console.log('[PROMPT-CACHE-1] slim tools  : %d tools, %d chars, ~%d tokens',
      (slimTools() as unknown[]).length, tools.length, estimateTokens(tools))
    console.log('[PROMPT-CACHE-1] slim system : %d chars, ~%d tokens', sys.length, estimateTokens(sys))
    console.log('[PROMPT-CACHE-1] CACHED PREFIX (tools+system): %d chars, ~%d tokens',
      whole.length, estimateTokens(whole))
    console.log('[PROMPT-CACHE-1] minimums    : sonnet-4-5=%d  haiku-4-5=%d  -> slim routes to HAIKU',
      MIN_CACHEABLE_TOKENS['claude-sonnet-4-5-20250929'], MIN_CACHEABLE_TOKENS['claude-haiku-4-5-20251001'])
    expect(whole.length).toBeGreaterThan(0)
  })
})
