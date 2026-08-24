import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { computeCostCentsOrNull, computeCostCentsWithCache, isPricedModel, UNPRICED_MODELS_SEEN, PRICING } from './cost'

// MS15 PHASE 1 — AN UNPRICED CALL IS UNKNOWN, NOT FREE.
//
// Measured on the live ledger (30 days to 2026-08-23): 1,459 calls carried tokens and a recorded
// cost of zero. That is TWO faults with one symptom, and only one of them is fixable in code:
//   (a) MISSING RATE — 93 calls on gpt-4o-mini / openai/gpt-4o-mini, a model PRICING has never
//       known. Recorded as free. Fixed here: null.
//   (b) SUB-CENT ROUNDING — 1,366 calls that ARE priced correctly but cost less than one whole
//       cent (a gemini call averages 514 in / 27 out ≈ 0.006c). PARKED: needs a column.

const GUARD = readFileSync(join(process.cwd(), 'scripts', 'canon-rail-guard.ts'), 'utf8')
const ROUTER = readFileSync(join(process.cwd(), 'src', 'lib', 'aria', 'model-router.ts'), 'utf8')

describe('(a) a model we cannot price records NULL, never 0', () => {
  it('the exact models seen unpriced in production return null', () => {
    for (const model of UNPRICED_MODELS_SEEN) {
      expect(isPricedModel(model)).toBe(false)
      expect(computeCostCentsOrNull(model, 100_000, 10_000)).toBeNull()
    }
  })

  it('a priced model still returns a number', () => {
    expect(computeCostCentsOrNull('claude-sonnet-4-5-20250929', 1_000_000, 1_000_000)).toBe(1800)
    expect(computeCostCentsOrNull('claude-haiku-4-5-20251001', 1_000_000, 0)).toBe(100)
  })

  it('the OLD function still returns 0 for unknown — and that is why loggers must not use it', () => {
    // Kept deliberately: arithmetic call sites SUM costs, and a null in a sum is a worse failure
    // than a zero. The fix is that LOGGERS use the OrNull variant.
    expect(computeCostCentsWithCache('gpt-4o-mini', 100_000, 10_000)).toBe(0)
  })

  it('the gateway logs cost-or-null, not the zero-for-unknown variant', () => {
    expect(ROUTER).toMatch(/computeCostCentsOrNull\(params\.model_id/)
    expect(ROUTER).not.toMatch(/computeCostCentsWithCache\(params\.model_id/)
  })

  it('the gateway logs latency too — provider, model, tokens, latency, cost, outcome in one place', () => {
    expect(ROUTER).toMatch(/latency_ms: params\.latency_ms \?\? null/)
  })
})

describe('(b) the sub-cent fault is NAMED, not silently tolerated', () => {
  it('a real gemini-sized call is genuinely worth less than one cent', () => {
    // 514 in + 27 out at Anthropic-haiku rates is still sub-cent; the point is the granularity,
    // not the vendor. Whatever the rate, Math.round() of a sub-cent value is 0.
    const cents = computeCostCentsWithCache('claude-haiku-4-5-20251001', 514, 27)
    expect(cents).toBe(0)
  })

  it('the parked column is named in the source, so the gap is findable', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'lib', 'aria', 'cost.ts'), 'utf8')
    expect(src).toMatch(/aria_ai_calls\.cost_usd_cents is `integer`/)
    expect(src).toMatch(/numeric\(12,6\)|cost_usd_micros/)
    expect(src).toMatch(/PARKED/)
  })

  it('every model in PRICING has both a rate and a positive output rate where it charges output', () => {
    for (const [model, rate] of Object.entries(PRICING)) {
      expect(rate.input_per_m_usd).toBeGreaterThan(0)
      expect(rate.output_per_m_usd).toBeGreaterThanOrEqual(0)
      expect(typeof model).toBe('string')
    }
  })
})

describe('the gateway rail — no NEW direct provider SDK', () => {
  it('the rule exists and names the gateway', () => {
    expect(GUARD).toMatch(/rule: 'direct-model-sdk-call'/)
    expect(GUARD).toMatch(/MODEL_SDK_ALLOWLIST/)
    expect(GUARD).toMatch(/model-router\.ts/)
  })

  it('the grandfather list holds the 174 pre-existing sites — the adoption number to shrink', () => {
    const i = GUARD.indexOf('const MODEL_SDK_ALLOWLIST = [')
    const j = GUARD.indexOf('\n]', i)
    const n = (GUARD.slice(i, j).match(/^  'src\//gm) ?? []).length
    // Counted against a closing bracket on its own line — a naive indexOf(']') lands inside the
    // first [id] route path and reports 1 (the MS10 measurement bug, memorialised).
    expect(n).toBe(174)
  })

  it('the gateway itself is on the list — it MUST instantiate SDKs; that is its job', () => {
    expect(GUARD).toMatch(/'src\/lib\/aria\/model-router\.ts',/)
  })
})

// ── the live failure, classified (MS15 phase 1a) ────────────────────────────────────────────────
describe('the 60% Anthropic failure is classified, not just counted', () => {
  it('the real production error string is read as a bill to pay', async () => {
    const { classifyProviderFailure } = await import('./provider-failure')
    // Verbatim from aria_ai_calls, 2,401 occurrences, 2026-07-27 → 2026-08-23.
    const live = '400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing'
    const c = classifyProviderFailure(live)
    expect(c.klass).toBe('billing_credit')
    expect(c.action_required).toBe(true)
    expect(c.action).toMatch(/Top up the Anthropic account/)
  })

  it('classes that resolve themselves never demand a human', async () => {
    const { classifyProviderFailure } = await import('./provider-failure')
    for (const [msg, klass] of [
      ['Anthropic call timed out after 30000ms', 'timeout'],
      ['529 overloaded_error', 'overloaded'],
      ['429 rate_limit_error', 'rate_limit'],
    ] as const) {
      const c = classifyProviderFailure(msg)
      expect(c.klass).toBe(klass)
      expect(c.action_required).toBe(false)
    }
  })

  it('a key problem and a payload bug are both human-fixable, and distinct', async () => {
    const { classifyProviderFailure } = await import('./provider-failure')
    expect(classifyProviderFailure('401 unauthorized: invalid api key').klass).toBe('auth')
    expect(classifyProviderFailure('400 invalid_request: messages must not be empty').klass).toBe('bad_request')
    expect(classifyProviderFailure('401 unauthorized: invalid api key').action_required).toBe(true)
  })

  it('the summary reports the DOMINANT cause and its share, not an undifferentiated count', async () => {
    const { summariseProviderFailures } = await import('./provider-failure')
    const rows = [
      ...Array.from({ length: 9 }, () => ({ provider: 'anthropic', success: false, error_message: 'credit balance is too low', created_at: '2026-08-23T00:00:00Z' })),
      { provider: 'anthropic', success: false, error_message: 'timed out', created_at: '2026-08-20T00:00:00Z' },
      { provider: 'anthropic', success: true, error_message: null, created_at: '2026-08-23T00:00:00Z' },
    ]
    const [summary] = summariseProviderFailures(rows)
    expect(summary.failures).toBe(10)          // the successful call is not a failure
    expect(summary.dominant_class).toBe('billing_credit')
    expect(summary.dominant_share).toBe(0.9)
    expect(summary.action_required).toBe(true)
    expect(summary.last_seen).toBe('2026-08-23T00:00:00Z')
  })

  it('the admin surface leads with action_required — no other metric matters while calls are rejected', () => {
    const admin = readFileSync(join(process.cwd(), 'src', 'app', 'api', 'admin', 'ai-costs', 'route.ts'), 'utf8')
    expect(admin).toMatch(/summariseProviderFailures/)
    const body = admin.slice(admin.indexOf('return NextResponse.json({'))
    expect(body.indexOf('action_required')).toBeLessThan(body.indexOf('health,'))
  })
})
