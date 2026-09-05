import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')
const EXEC = read('src/lib/agents/council-executor.ts')
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const EXEC_CODE = code(EXEC)

/**
 * M13 PHASE 2 — THE WRITES THAT WOULD FAIL SILENTLY THE DAY THIS PATH GOES LIVE.
 *
 * ⚠️ A PREMISE CORRECTED, INCLUDING MY OWN. `proposal_id` is non-null on 0 of 854
 * `aria_autopilot_actions` rows, and both the M13 brief and **my own RUN-M11.md** read that as an
 * insert that has never landed because its error was swallowed.
 *
 * **It is wrong.** Attempting that exact insert against production inside a rolled-back `DO` block
 * SUCCEEDS — the database accepts it. Measured alongside it:
 *
 *   agent_council_proposals   2 rows ever · 0 executed · 0 with a council_decision
 *   aria_campaigns            0 rows      (the sibling write in the same file)
 *   aria_autopilot_actions    0 with outcome_data · 0 with executed_at
 *
 * `executeProposal` has NEVER RUN in production. The column is empty because the function was never
 * called, not because the write was rejected. The unread error is real and is fixed here, but it is
 * a LATENT defect — and the day the executor does run is precisely the day nobody would notice it.
 */
describe('M13 phase 2 · every write in the council executor reads its error', () => {
  it('ANTI-VACUITY — the file was read and still has its writes', () => {
    expect(EXEC.length).toBeGreaterThan(5000)
    expect((EXEC_CODE.match(/\.insert\(\{/g) ?? []).length).toBeGreaterThanOrEqual(6)
  })

  it('the audit insert destructures its error and logs it', () => {
    expect(EXEC_CODE).toContain('const { error: auditErr } = await supabase.from(\'aria_autopilot_actions\').insert({')
    expect(EXEC_CODE).toContain("console.error('[council-executor] audit insert REJECTED:'")
    // Still non-fatal: it must never block a real execution from completing.
    expect(EXEC_CODE).toContain('audit insert threw (non-fatal)')
  })

  it('THE EXPLICIT BOTH-OUTCOME SWALLOWS ARE GONE', () => {
    // `.then(onOk, onErr)` with two empty bodies discards success AND failure on purpose. There
    // were three, on the campaign, staff-SMS and review-request records — each of which is what
    // tells the owner the thing was queued.
    const swallow = ['}).then(() => {}, ', '() => {})'].join('')
    expect(EXEC_CODE).not.toContain(swallow)
  })

  it('all three queued-record writes now read their error', () => {
    for (const [table, v] of [
      ['aria_campaigns', 'campErr'],
      ['labour_optimisation_actions', 'labourErr'],
      ['review_requests', 'reviewErr'],
    ] as const) {
      expect(EXEC_CODE, table).toContain('const { error: ' + v + ' } = await supabase.from(\'' + table + '\').insert({')
      expect(EXEC_CODE, table).toContain('if (' + v + ') console.error(')
    }
  })

  it('behaviour is unchanged — nothing became fatal', () => {
    // Every fix logs and continues. A write failure must not start throwing out of an executor
    // that is mid-way through real changes: that would turn a silent bug into a louder one.
    expect(EXEC_CODE).not.toMatch(/if \((?:auditErr|campErr|labourErr|reviewErr)\)\s*throw/)
    expect(EXEC_CODE).not.toMatch(/if \((?:auditErr|campErr|labourErr|reviewErr)\)\s*return/)
  })

  it('MUTATION — re-silencing the audit insert is detectable', () => {
    const mutated = EXEC.replace(
      "const { error: auditErr } = await supabase.from('aria_autopilot_actions').insert({",
      "await supabase.from('aria_autopilot_actions').insert({",
    )
    expect(mutated).not.toBe(EXEC)
    expect(code(mutated)).not.toContain('const { error: auditErr }')
    // And the W6 rail would catch it as a new violation — the rule that exists for this shape.
    const guard = read('scripts/canon-rail-guard.ts')
    expect(guard).toContain('supabase-write-result-discarded')
    expect(guard).toContain('supabase-error-not-read')
  })
})

describe('M13 phase 2 · the empty catches, judged one at a time', () => {
  it('the three that cost something now log, and stay non-fatal', () => {
    const tracking = code(read('src/app/menu/[slug]/order/[orderNumber]/OrderTrackingClient.tsx'))
    const settings = code(read('src/app/pos/(fullscreen)/menu/tabs/SettingsTab.tsx'))
    const orders = code(read('src/app/pos/online-orders/page.tsx'))
    expect(tracking).toContain("console.error('[order-tracking] poll failed:'")
    expect(settings).toContain("console.error('[pos/settings] save failed:'")
    expect(orders).toContain("console.error('[online-orders] status update failed:'")
    // The cosmetic one too — silence is never correct, even when the cost is small.
    expect(orders).toContain("console.error('[online-orders] badge/beep refresh failed:'")
  })

  it('none of the five swallow silently any more', () => {
    for (const p of [
      'src/app/menu/[slug]/order/[orderNumber]/OrderTrackingClient.tsx',
      'src/app/pos/(fullscreen)/menu/tabs/SettingsTab.tsx',
      'src/app/pos/online-orders/page.tsx',
    ]) {
      expect(code(read(p)), p).not.toMatch(/catch\s*\(_\)\s*\{\s*\}/)
    }
  })

  it('the EIGHT in layout.tsx are deliberately left alone, and this records why', () => {
    // They are not Supabase writes and not app code: they sit inside an inline browser <script>
    // guarding `serviceWorker`, `caches` and `sessionStorage` — APIs that legitimately do not exist
    // in some browsers, where a throw is the expected control flow rather than a failure. Counting
    // them as W6 violations was the audit conflating "empty catch" with "unread database error".
    const layout = read('src/app/layout.tsx')
    expect((layout.match(/catch\s*\(?e?\)?\s*\{\s*\}/g) ?? []).length).toBeGreaterThanOrEqual(6)
    for (const api of ['serviceWorker', 'caches', 'sessionStorage']) {
      expect(layout, api).toContain(api)
    }
    // And they are genuinely NOT database calls — the property that makes leaving them correct.
    // Comments stripped: the file mentions supabase once, in a comment explaining that the layouts
    // gate on supabase.auth.getUser() elsewhere. Scanning the raw file matches that prose. (It did.)
    expect(code(layout)).not.toContain('supabase')
  })
})
