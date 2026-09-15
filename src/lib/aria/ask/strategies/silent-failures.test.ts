import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * M17B PHASE 1 — THE SIX SILENT FAILURES, EACH WITH A TEST THAT FAILS WITHOUT THE FIX.
 *
 * ⚠️ A DISCARDED SUPABASE ERROR IS INVISIBLE BY NATURE. Supabase RESOLVES with `{ data, error }` and
 * never throws, so `const { data } = await …` drops the failure before anyone can look at it. There
 * is no stack trace, no 500, no red anywhere — the feature simply does the wrong thing quietly. A
 * fix with no test is a fix that comes back, because nothing about the code LOOKS different.
 *
 * So each of these six drives the real strategy function with a client that returns `{ error }`, and
 * asserts the failure is REPORTED. Re-discard the error and the assertion fails. That is the whole
 * contract.
 *
 * ⚠️ None of these assert on an import. Every one calls the exported strategy.
 */

// ── a Supabase query builder that is thenable, like the real one ─────────────────────────────────
type Res = { data?: unknown; error?: { message: string } | null; count?: number | null }

interface Plan { select?: Res; update?: Res; insert?: Res }

function builder(plan: Plan, log: string[]) {
  let op: 'select' | 'update' | 'insert' = 'select'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const self: any = {
    select: () => self,
    insert: () => { op = 'insert'; log.push('insert'); return self },
    update: () => { op = 'update'; log.push('update'); return self },
    eq: () => self, in: () => self, gte: () => self, lt: () => self, neq: () => self,
    ilike: () => self, order: () => self, limit: () => self,
    maybeSingle: () => self, single: () => self,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    then: (res: any, rej: any) => Promise.resolve(plan[op] ?? { data: null, error: null }).then(res, rej),
  }
  return self
}

function fakeClient(plan: Plan, log: string[] = []) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { from: () => builder(plan, log) } as any
}

// ── module mocks ─────────────────────────────────────────────────────────────────────────────────
const adminPlan: { current: Plan } = { current: {} }
const adminLog: string[] = []

vi.mock('@/lib/supabase-admin', () => ({
  get supabaseAdmin() { return fakeClient(adminPlan.current, adminLog) },
}))

const executeAction = vi.fn()
vi.mock('@/lib/aria/ask/action-executor', () => ({
  executeAction: (...a: unknown[]) => executeAction(...a) as unknown,
}))

vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: async () => ({ ok: true }) }))
vi.mock('@/lib/aria-cost-guard', () => ({ checkCostCeiling: async () => ({ ok: true, spent: 0, ceiling: 5 }) }))
vi.mock('@/lib/aria/cost-guard', () => ({
  checkSpendAllowed: async () => ({ allowed: true, reason: '', current_spend_cents: 0, daily_limit_cents: 100 }),
  trackSpend: async () => {},
}))
vi.mock('@/lib/ai-router', () => ({ ariaChatWithProvider: async () => ({ text: 'T' }) }))

const { pendingActionStrategy } = await import('./pending-action')
const { savePlanStrategy } = await import('./save-plan')
const { admit } = await import('../pipeline/admission')
const { upsertConversation } = await import('../pipeline/turn-persistence')

// ── harness ──────────────────────────────────────────────────────────────────────────────────────
let errors: string[] = []
let spy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  errors = []
  spy = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { errors.push(a.map(String).join(' ')) })
  executeAction.mockReset()
  adminPlan.current = {}
  adminLog.length = 0
})
afterEach(() => { spy.mockRestore() })

const said = (needle: string) => errors.some(e => e.includes(needle))

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CTX = (supabase: any, message = 'yes') => ({
  input: {
    req: new Request('http://localhost/'), bid: 'b1', userId: 'u1', supabase,
    message, conversationId: 'c1', attachments: [], clientMessages: [],
    noticeRef: null, branchIntent: { mode: 'append' as const },
  },
  understanding: {
    message, intent: { type: 'question', complexity: 'simple' }, ariaIntent: { intent_type: 'action' },
    outputFmt: {}, features: {}, firedFeatures: [], hasAttachments: false, hasImages: false,
    hasConversation: true,
  },
  grounding: { kind: 'none' as const },
  strategy: { name: 'pending_action' as const, reason: 'r', firedFeatures: [] },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as any

const PENDING_ROW = {
  pending_action: { type: 'bulk_price_update', title: 'Raise prices', payload: {} },
  pending_action_expires_at: new Date(Date.now() + 60_000).toISOString(),
}

describe('M17B phase 1 · the six silent failures', () => {
  /* ────────────────────────────────────────────────────────────────────────────────────────────
   * 1 · ⚠️ THE INJECTION BACKSTOP'S OWN WRITE
   * ──────────────────────────────────────────────────────────────────────────────────────────── */
  describe('⚠️ 1 — the mass-confirm re-stage. The gate looks present and cannot close.', () => {
    /**
     * `bulk_price_update` is propose-only with gate reason `money`. When the executor refuses an
     * unconfirmed mass mutation it comes back `requires_mass_confirm`, and the lane RE-STAGES the
     * action with `confirm_mass: true` and asks the owner to reply "confirm".
     *
     * ⚠️ IF THAT RE-STAGE WRITE IS REJECTED AND THE ERROR IS DISCARDED, the owner is asked to
     * confirm against something that was never stored — so the second confirmation the whole
     * mass-mutation gate depends on CAN NEVER ARRIVE. The gate is present, visible, and unable to
     * close. Nothing anywhere reports it.
     */
    it('REPORTS a rejected re-stage — the assertion that fails if the error is re-discarded', async () => {
      executeAction.mockResolvedValue({ ok: false, requires_mass_confirm: true, affected_preview: 412, error: 'This affects 412 items.' })
      const supabase = fakeClient({
        select: { data: PENDING_ROW, error: null },
        update: { data: null, error: { message: 'new row violates row-level security policy' } },
      })

      const out = await pendingActionStrategy(CTX(supabase))

      expect(said('mass-confirm re-stage FAILED'), 'the re-stage error was discarded — see this test\'s doc comment').toBe(true)
      expect(said('new row violates row-level security policy')).toBe(true)
      // The owner is still asked to confirm — behaviour is unchanged, only the silence is gone.
      expect(out?.text).toContain('Reply "confirm" to proceed')
      expect(out?.lane).toBe('pending_action')
    })

    it('says NOTHING when the re-stage succeeds — the test is not just asserting "some error"', async () => {
      // Anti-vacuity: if this passed too, the assertion above would prove nothing.
      executeAction.mockResolvedValue({ ok: false, requires_mass_confirm: true, affected_preview: 412 })
      const supabase = fakeClient({ select: { data: PENDING_ROW, error: null }, update: { data: null, error: null } })
      await pendingActionStrategy(CTX(supabase))
      expect(said('mass-confirm re-stage FAILED')).toBe(false)
    })

    it('⚠️ and the money gate still HOLDS — nothing was executed', async () => {
      executeAction.mockResolvedValue({ ok: false, requires_mass_confirm: true, affected_preview: 412 })
      const supabase = fakeClient({
        select: { data: PENDING_ROW, error: null },
        update: { data: null, error: { message: 'denied' } },
      })
      const out = await pendingActionStrategy(CTX(supabase))
      // A refused re-stage must never become an execution. The action is re-proposed, not run.
      expect(JSON.stringify(out?.action)).toContain('mass_confirm')
      expect(JSON.stringify(out?.action)).not.toContain('execution_result')
    })
  })

  /* ────────────────────────────────────────────────────────────────────────────────────────────
   * 2 · the pending-action read
   * ──────────────────────────────────────────────────────────────────────────────────────────── */
  it('⚠️ 2 — REPORTS a lost pending-action read, which otherwise reads as "no pending action" and silently drops an approved action', async () => {
    const supabase = fakeClient({ select: { data: null, error: { message: 'connection terminated' } } })
    const out = await pendingActionStrategy(CTX(supabase, 'yes'))
    expect(said('pending_action read failed')).toBe(true)
    expect(said('connection terminated')).toBe(true)
    // Behaviour unchanged: with no row the lane still DECLINES and the spine offers the next lane.
    expect(out).toBeNull()
  })

  /* ────────────────────────────────────────────────────────────────────────────────────────────
   * 3 · the clear-after-execute
   * ──────────────────────────────────────────────────────────────────────────────────────────── */
  it('⚠️ 3 — REPORTS a failed clear AFTER the action already executed, which otherwise lets the next "yes" re-run a write that already happened', async () => {
    executeAction.mockResolvedValue({ ok: true, affected_count: 3, rollback_available: false })
    const supabase = fakeClient({
      select: { data: PENDING_ROW, error: null },
      update: { data: null, error: { message: 'deadlock detected' } },
    })
    const out = await pendingActionStrategy(CTX(supabase))
    expect(said('pending_action clear FAILED after execution')).toBe(true)
    expect(said('deadlock detected')).toBe(true)
    // The owner is still told it is done, because it IS done. That is the point of the log.
    expect(out?.intent).toBe('action_executed')
  })

  /* ────────────────────────────────────────────────────────────────────────────────────────────
   * 4 · save-plan's aria_actions INSERT
   * ──────────────────────────────────────────────────────────────────────────────────────────── */
  it('⚠️ 4 — REPORTS a rejected aria_actions INSERT, which otherwise tells the owner "Plan saved" while the dashboard stays empty', async () => {
    adminPlan.current = {
      select: { data: { pending_action: { title: 'Cut coffee 10%', description: 'd', risk: 'low', estimated_impact: '$50' } }, error: null },
      insert: { data: null, error: { message: 'violates check constraint "aria_actions_status_check"' } },
      update: { data: null, error: null },
    }
    const out = await savePlanStrategy(CTX(fakeClient({}), '[ARIA_SAVE_PLAN]'))
    expect(said('save-plan aria_actions INSERT failed')).toBe(true)
    expect(said('aria_actions_status_check')).toBe(true)
    expect(out?.intent).toBe('plan_saved')
  })

  /* ────────────────────────────────────────────────────────────────────────────────────────────
   * 5 · upsertConversation's existing-thread read
   * ──────────────────────────────────────────────────────────────────────────────────────────── */
  it('⚠️ 5 — REPORTS a failed existing-thread read, which otherwise falls through to INSERT and creates a SECOND conversation', async () => {
    adminPlan.current = {
      select: { data: null, error: { message: 'statement timeout' } },
      insert: { data: { id: 'brand-new' }, error: null },
    }
    const id = await upsertConversation('b1', 'u1', 'c1', 'q', 'a', 'question')
    expect(said('existing-thread read failed')).toBe(true)
    expect(said('statement timeout')).toBe(true)
    // ⚠️ AND THE CONSEQUENCE IS VISIBLE: a NEW id came back, not the one passed in. That is the
    // duplicate thread, demonstrated rather than described.
    expect(id).toBe('brand-new')
    expect(id).not.toBe('c1')
  })

  /* ────────────────────────────────────────────────────────────────────────────────────────────
   * 6 · the per-minute rate-limit COUNT
   * ──────────────────────────────────────────────────────────────────────────────────────────── */
  it('⚠️ 6 — REPORTS a failed rate-limit COUNT, which otherwise returns null, reads as "no calls this minute", and lets the limit through', async () => {
    adminPlan.current = { select: { count: null, data: null, error: { message: 'canceling statement due to statement timeout' } } }
    const out = await admit({ bid: 'b1', userId: 'u1', message: 'hi', attachmentCount: 0 })
    expect(said('per-minute rate-limit count failed')).toBe(true)
    expect(said('statement timeout')).toBe(true)
    // Behaviour unchanged — the turn is still ADMITTED, exactly as before. Only the silence is gone.
    expect(out).toBeNull()
  })

  /* ────────────────────────────────────────────────────────────────────────────────────────────
   * anti-vacuity for the whole file
   * ──────────────────────────────────────────────────────────────────────────────────────────── */
  it('⚠️ the harness can tell silence from noise — a clean run reports NOTHING', async () => {
    // If console.error were captured wrongly (or always), every assertion above would pass for the
    // wrong reason. This proves the six tests are reading a real signal.
    adminPlan.current = { select: { count: 0, data: null, error: null } }
    const out = await admit({ bid: 'b1', userId: 'u1', message: 'hi', attachmentCount: 0 })
    expect(out).toBeNull()
    expect(errors, 'a clean admission must log nothing at all').toEqual([])
  })
})
