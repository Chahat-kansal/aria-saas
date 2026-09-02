import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const SWEEP = 'src/app/api/cron/decision-expiry-sweep/route.ts'
const H06 = 'src/app/api/cron/dispatch/h06/route.ts'

/**
 * TS-1 PHASE 2 — THE CLOCK, as properties rather than as an instance.
 *
 * The live proof (seed 3 → 3 expired + 3 events → re-run 0 → torn down, residue 0) is in RUN-TS1.
 * This file holds the parts that would silently rot: the dispatcher ORDER, the absence of a cron
 * entry, and the three predicate arms.
 */
describe('TS-1 phase 2 · the expiry sweep', () => {
  const sweep = strip(read(SWEEP))
  const h06 = strip(read(H06))

  it('ANTI-VACUITY — both files were actually read', () => {
    // A test that greps an empty string passes while proving nothing.
    expect(sweep.length, SWEEP + ' is empty or missing').toBeGreaterThan(800)
    expect(h06.length, H06 + ' is empty or missing').toBeGreaterThan(400)
    expect(h06).toContain('runDispatcher')
  })

  it('ALL THREE PREDICATE ARMS are present — each holds back a different row', () => {
    // Proven live: dropping `expires_at < now()` claims the future-dated row; dropping
    // `expires_at is not null` claims the null-expiry row; dropping `status='pending'` re-claims
    // rows already expired. None is decorative.
    expect(sweep).toMatch(/\.eq\('status', 'pending'\)/)
    expect(sweep).toMatch(/\.not\('expires_at', 'is', null\)/)
    expect(sweep).toMatch(/\.lt\('expires_at', nowIso\)/)
  })

  it('the claim is ATOMIC — the status re-check lives in the UPDATE, not in a prior SELECT', () => {
    // select-then-update would let two dispatchers claim the same row and emit twice. The
    // `.eq('status','pending')` sits on the update chain, exactly as /api/owner/decisions does.
    const at = sweep.indexOf('.update(')
    expect(at, 'no update call found').toBeGreaterThan(-1)
    const chain = sweep.slice(at, sweep.indexOf('if (error)'))
    expect(chain).toContain(".eq('status', 'pending')")
    expect(chain).toContain('.select(CLAIM_COLUMNS)')
  })

  it('events go through recordEvent — never a raw business_events insert', () => {
    expect(sweep).toMatch(/from '@\/lib\/moat\/recordEvent'/)
    expect(sweep, 'a raw insert would bypass the ONE writer of the spine')
      .not.toMatch(/from\('business_events'\)/)
    expect(sweep).toContain("entity_type: 'decision'")
    expect(sweep).toContain("event_type: 'expired'")
    expect(sweep).toContain("actor: 'cron'")
  })

  it('it writes outcome_note and does NOT touch `outcome`', () => {
    // `outcome` carries hypothesis/outcome-learning's verdict. Overwriting it would corrupt an
    // audit path — the collision this sprint was told to avoid.
    expect(sweep).toContain('outcome_note:')
    expect(sweep, 'the sweep must not write `outcome`').not.toMatch(/^\s*outcome:/m)
  })

  it('resolved_by is left NULL — no human resolved an expiry', () => {
    expect(sweep).toContain('resolved_at:')
    expect(sweep, 'writing resolved_by would fabricate an actor').not.toMatch(/resolved_by:/)
  })

  it('COLUMNS ARE NAMED — no select(*) anywhere in the sweep', () => {
    expect(sweep).toContain('CLAIM_COLUMNS')
    expect(sweep).not.toMatch(/\.select\('\*'\)/)
  })

  it('the error is checked, never discarded into an empty result', () => {
    // A failed sweep reporting "0 expired" would look identical to a clean run. RULE 7.
    expect(sweep).toMatch(/if \(error\)/)
  })

  it('ORDER — the sweep runs BEFORE decision-notify-sweep in h06', () => {
    const expiry = h06.indexOf("name: 'decision-expiry-sweep'")
    const notify = h06.indexOf("name: 'decision-notify-sweep'")
    expect(expiry, 'the sweep is not registered in h06').toBeGreaterThan(-1)
    expect(notify, 'decision-notify-sweep vanished from h06').toBeGreaterThan(-1)
    // Expire first, then notify — so the owner is never buzzed about a decision that is stale.
    expect(expiry).toBeLessThan(notify)
  })

  it('NO NEW CRON ENTRY — vercel.json is untouched', () => {
    const vercel = read('vercel.json')
    expect(vercel).not.toContain('decision-expiry-sweep')
    // The glob that already covers it, so the tracked function count does not move.
    expect(vercel).toContain('src/app/api/cron/**/*.ts')
    const cfg = JSON.parse(vercel) as { functions?: Record<string, unknown> }
    expect(Object.keys(cfg.functions ?? {}).length, 'function entries moved').toBe(9)
  })

  it('MUTATION PROBE — reordering after decision-notify-sweep goes red', () => {
    // Prove the order assertion can fail rather than passing on two -1s.
    const swapped = h06
      .replace("  { name: 'decision-expiry-sweep', fn: decisionExpirySweep },\n", '')
      .replace("  { name: 'decision-notify-sweep', fn: decisionNotifySweep },",
               "  { name: 'decision-notify-sweep', fn: decisionNotifySweep },\n  { name: 'decision-expiry-sweep', fn: decisionExpirySweep },")
    expect(swapped, 'the mutation did not apply').not.toBe(h06)
    expect(swapped.indexOf("name: 'decision-expiry-sweep'"))
      .toBeGreaterThan(swapped.indexOf("name: 'decision-notify-sweep'"))
    // ...and the real file is the other way round.
    expect(h06.indexOf("name: 'decision-expiry-sweep'"))
      .toBeLessThan(h06.indexOf("name: 'decision-notify-sweep'"))
  })
})
