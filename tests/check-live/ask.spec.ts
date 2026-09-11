import { test, expect, type Page } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { OWNER_STATE } from './global-setup'
import { assertSafeTestBusiness } from '../../src/lib/testing/test-business'

/**
 * S6 PHASE 2 — ONE REAL QUESTION.
 *
 * Every assertion below maps to a failure that SHIPPED past tsc, vitest, ESLint, `next build` and
 * the canon rail. The name of each test says which one.
 *
 * ⚠️ The question is deliberately strategic ("…what should I focus on?"). `ask/route.ts:654` routes
 * on `/should|recommend|best|…/`, and **only the strategic path builds `turnProvenance`** — the
 * anchors assertion 3 needs. A data-lookup question would legitimately produce no anchors, and
 * asserting on it would fail for the wrong reason.
 */
test.use({ storageState: OWNER_STATE })

const QUESTION = 'How is the business doing this week, and what should I focus on?'

function db(): SupabaseClient {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  return createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY ?? '', { auth: { persistSession: false } })
}
const BID = () => assertSafeTestBusiness(process.env.CHECK_LIVE_BUSINESS_ID, 'assert against')

/** Shared across the serial tests: what the one live turn produced. */
const turn: {
  askRequestFired: boolean
  askStatus: number | null
  answerText: string
  storedContent: string | null
  storedProvenance: { anchors?: number[]; anchorLabels?: Record<string, string> } | null
  conversationId: string | null
  askedAt: string
} = {
  askRequestFired: false, askStatus: null, answerText: '', storedContent: null,
  storedProvenance: null, conversationId: null, askedAt: new Date().toISOString(),
}

test.describe.configure({ mode: 'serial' })

/**
 * ⚠️ A RUN THAT CHECKED NOTHING MUST EXIT NON-ZERO.
 *
 * Playwright exits 0 when every test skips, and a green `check:live` that verified nothing is
 * precisely the habit this command exists to break — it is the seven-row table in one command.
 * This assertion is deliberately OUTSIDE the skip guard: when the run is blocked it fails, names
 * the reason, and takes the exit code with it.
 */
test('0. the run was able to check anything at all', () => {
  expect(
    process.env.CHECK_LIVE_BLOCKED ?? '',
    '⊘ COULD NOT CHECK — ' + (process.env.CHECK_LIVE_BLOCKED ?? '')
    + ' Every assertion below is SKIPPED, not passed.',
  ).toBe('')
})

test.describe('check:live · one real question', () => {
  // ⊘ — THE THIRD STATE. A run that could not sign in verified nothing, and reporting that as a
  // pass is the exact habit this command exists to break. Every assertion below skips with the
  // reason rather than going green on an empty page.
  test.beforeEach(() => {
    test.skip(!!process.env.CHECK_LIVE_BLOCKED, process.env.CHECK_LIVE_BLOCKED ?? '')
  })

  // ⚠️ ONE PAGE FOR THE WHOLE BLOCK. Playwright gives each test a fresh page, so asserting "the
  // request fired" in one test and "the answer settled" in the next threw the answer away between
  // them — the second re-navigated to an empty Ask Aria and failed on a bubble that had never
  // rendered there. The interaction is one turn; it needs one page.
  let shared: Page
  test.beforeAll(async ({ browser, baseURL }) => {
    // baseURL must be passed explicitly: a context created by hand does NOT inherit `use.baseURL`,
    // so every relative goto() below would resolve against nothing.
    const ctx = await browser.newContext({ storageState: OWNER_STATE, baseURL })
    shared = await ctx.newPage()
  })
  test.afterAll(async () => { await shared?.context().close() })

  test('1. the request LEFT the client and reached the route — M12: the chat POST never fired', async () => {
    const page = shared
    turn.askedAt = new Date().toISOString()
    await page.goto('/dashboard/ask-aria')
    // The dashboard shell is client-rendered: a bare goto returns with <main> still empty, and the
    // first version of this waited 30s on an input that had not been created yet. Wait for the app
    // to stop fetching, THEN for the composer.
    await page.waitForLoadState('networkidle', { timeout: 90_000 }).catch(() => {})

    const input = page.locator('textarea, input[type="text"]').first()
    await input.waitFor({ state: 'visible', timeout: 90_000 })

    // Watch the wire, not the screen. M12 shipped a surface whose send button never issued a POST;
    // every static gate passed and the page looked fine.
    const askResponse = page.waitForResponse(
      r => /\/api\/aria\/(ask|ask-sse)/.test(r.url()) && r.request().method() === 'POST',
      { timeout: 120_000 },
    )
    await input.fill(QUESTION)
    await input.press('Enter')

    const res = await askResponse
    turn.askRequestFired = true
    turn.askStatus = res.status()
    expect(turn.askStatus, 'the ask route answered with a non-2xx').toBeLessThan(400)
  })

  test('2. the answer STREAMED and SETTLED — M4: the watchdog', async () => {
    test.skip(!turn.askRequestFired, 'no request was made, so there is nothing to settle')
    const page = shared

    // WARNING - READ THE WHOLE CONVERSATION REGION, NOT A BUBBLE CLASS. My first version waited on
    // `.msg-reveal` and timed out while a perfectly good answer sat on the page: the surface had
    // moved on and the selector had not. Asserting on a class name is asserting on markup; asserting
    // that the answer TEXT arrived and stopped changing is asserting on the thing that matters.
    const region = page.locator('main').first()
    await expect(region, 'the Ask Aria surface never rendered').toBeVisible({ timeout: 60_000 })

    // Settled, not merely present: poll until the text stops growing. A region that is visible
    // mid-stream is not an answer that arrived, and M4's watchdog exists because a turn that never
    // settles looks identical to one that did.
    let previous = ''
    let stable = 0
    const deadline = Date.now() + 150_000
    while (Date.now() < deadline && stable < 3) {
      const text = (await region.innerText().catch(() => '')).replace(/\s+/g, ' ').trim()
      stable = text.length > 0 && text === previous ? stable + 1 : 0
      previous = text
      await page.waitForTimeout(2000)
    }

    // The answer must be more than the question echoed back at us.
    const afterQuestion = previous.split(QUESTION).pop() ?? ''
    turn.answerText = afterQuestion.trim()
    expect(previous, 'the surface never showed the question that was asked').toContain(QUESTION.slice(0, 40))
    expect(
      turn.answerText.length,
      'the turn never produced an answer beyond the question itself. Settled text: ' + previous.slice(-300),
    ).toBeGreaterThan(60)
  })

  test('3. the STORED TURN carries provenance anchors — M3: 0 of 288 conversations did', async () => {
    const client = db()
    const { data, error } = await client
      .from('aria_conversations')
      .select('id, messages, last_message_at')
      .eq('business_id', BID())
      .order('last_message_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    expect(error, 'could not read the stored conversation: ' + (error?.message ?? '')).toBeNull()
    expect(data, 'no conversation was stored at all — the /ax failure: a rendered answer that persisted nothing').not.toBeNull()

    const messages = (data?.messages ?? []) as Array<Record<string, unknown>>
    const assistant = [...messages].reverse().find(m => m.role === 'assistant')
    expect(assistant, 'the conversation stored no assistant turn').toBeTruthy()

    turn.conversationId = (data?.id as string) ?? null
    turn.storedContent = String(assistant?.content ?? '')
    turn.storedProvenance = (assistant?.provenance as typeof turn.storedProvenance) ?? null

    expect(turn.storedProvenance, 'the stored turn carries no provenance — every figure in it renders unanchored').not.toBeNull()
    expect(Array.isArray(turn.storedProvenance?.anchors), 'provenance.anchors is not an array').toBe(true)
    expect(turn.storedProvenance!.anchors!.length, 'provenance carried zero anchors').toBeGreaterThan(0)
  })

  test('4. an anchored figure RESOLVES TO REAL ROWS — the moat', async () => {
    test.skip(!turn.storedProvenance?.anchors?.length, 'no anchors to verify')
    const client = db()
    const anchors = turn.storedProvenance!.anchors!
    const labels = turn.storedProvenance!.anchorLabels ?? {}

    // Every anchor is a real value the route measured. An anchor that does not resolve is worse
    // than no anchor, because it is a number wearing a badge of truth.
    //
    // ⚠️ NO HAND-ROLLED REVENUE SUM HERE, and the canon rail was right to flag my first version.
    // `[ad-hoc-revenue-sum]` exists because 120 places in this repo added up `total_amount` their
    // own way and drifted. Summing was also the WEAKER assertion: it re-implements what the app
    // computed and then congratulates itself when the two agree. Matching an anchor to the RAW ROW
    // VALUES it must have come from is both independent and free of the pattern.
    const { data: sales, error } = await client
      .from('pos_sales').select('total_amount')
      .eq('business_id', BID()).eq('status', 'completed')
    expect(error, 'could not re-read the sale rows: ' + (error?.message ?? '')).toBeNull()

    const rows = (sales ?? []).map(r => Number(r.total_amount) || 0)
    const anchorValues = anchors.map(a => Number(a))

    // An anchor resolves if it is a value that exists in the rows, or the number of rows itself —
    // both facts about the database that no amount of model fluency could produce by accident.
    const resolvable = new Set<number>([...rows, rows.length])
    const reproducible = anchorValues.some(v => [...resolvable].some(r => Math.abs(v - r) < 0.005))
    expect(
      reproducible,
      'no anchor resolved to a real row value. anchors=' + JSON.stringify(anchorValues)
      + ' labels=' + JSON.stringify(labels)
      + ' · row totals=' + JSON.stringify(rows) + ' · row count=' + rows.length,
    ).toBe(true)
  })

  test('5. the answer was CONSTITUTION-GOVERNED — M12: the bathroom answer', async () => {
    const client = db()
    const { data, error } = await client
      .from('aria_ai_calls')
      .select('agent_key, provider, created_at')
      .eq('business_id', BID())
      .gte('created_at', turn.askedAt)
      .order('created_at', { ascending: false })
      .limit(20)
    expect(error, 'could not read aria_ai_calls: ' + (error?.message ?? '')).toBeNull()

    const keys = (data ?? []).map(r => String(r.agent_key))
    test.skip(keys.length === 0, 'no model call was logged for this turn, so which lane served it is unknowable')

    // ⚠️ WHICH LANE SERVED THIS TURN DECIDES WHETHER A CONSTITUTION WAS CARRIED, and the two are
    // mutually exclusive in this codebase today:
    //   assembleAriaPrompt() has exactly two production callers — ask/route.ts:872 (the GENERAL
    //   lane, which runs BEFORE business context exists) and slim-context.ts.
    //   answer-council.ts contains ZERO references to the constitution (M13B measured this and it
    //   is still true).
    // So a business question answered by the council is NOT constitution-governed. This assertion
    // reports that as the failure it is, rather than passing on a proxy.
    const servedByCouncil = keys.some(k => k.startsWith('council_'))
    expect(
      servedByCouncil,
      'this turn was served by the ANSWER COUNCIL (agent keys: ' + keys.join(', ') + '), and '
      + 'answer-council.ts carries no constitution — assembleAriaPrompt() is called only by the '
      + 'general lane (ask/route.ts:872) and slim-context.ts. The lane that answers business '
      + 'questions is not constitution-governed. See RUN-S6.md phase 2.',
    ).toBe(false)
  })

  test('6. the ledger records WHICH PROVIDER served it — M8/M13B', async () => {
    const client = db()
    const { data, error } = await client
      .from('aria_ai_calls')
      .select('agent_key, provider, success, input_tokens, output_tokens')
      .eq('business_id', BID())
      .gte('created_at', turn.askedAt)
      .order('created_at', { ascending: false })
      .limit(20)
    expect(error, 'could not read aria_ai_calls: ' + (error?.message ?? '')).toBeNull()

    const rows = data ?? []
    expect(
      rows.length,
      'the turn produced NO aria_ai_calls row — a model call that cost money and appears nowhere. '
      + 'That is exactly how intent_classifier ran twice a turn across 412 turns with zero rows.',
    ).toBeGreaterThan(0)

    const providers = [...new Set(rows.map(r => String(r.provider)))]
    // The token TOTAL is deliberately not summed here. canon-rail-guard flagged the reduce as
    // [ad-hoc-revenue-sum] — a false positive on its face, since these are tokens rather than
    // dollars, but the rule is not loosened for a log line that nothing asserts on. The per-call
    // rows carry the counts for anyone who wants them.
    console.log('[check:live] served by ' + providers.join('/') + ' · ' + rows.length + ' call(s)'
      + ' · keys: ' + [...new Set(rows.map(r => String(r.agent_key)))].join(', '))
    expect(providers.some(p => p === 'anthropic' || p === 'google'), 'no real provider is recorded').toBe(true)
  })
})
