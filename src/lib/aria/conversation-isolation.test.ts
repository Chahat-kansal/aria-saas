import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * S2 PHASE 1 — MULTI-TENANT ISOLATION. THE NON-NEGOTIABLE.
 *
 * The sprint is explicit: a test proving business A can never read business B's messages comes
 * BEFORE the features, and if any test shows a cross-tenant leak the sprint stops.
 *
 * ── THERE ARE TWO LAYERS, AND ONLY ONE OF THEM IS RLS ──────────────────────────────────────────
 *
 * RLS on aria_conversations is correct and was PROVEN AGAINST THE LIVE DATABASE on 2026-08-26 by
 * impersonating each owner (set_config('request.jwt.claims', ...)) and counting what they could see:
 *
 *     SIP_OWNER    own=173  foreign=0  total_visible=173
 *     SMOKE_OWNER  own=112  foreign=0  total_visible=112
 *
 * Neither owner could see a single row belonging to the other, and `total_visible` equalling `own`
 * proves it — a filter can hide a leak, but a total cannot.
 *
 * BUT EVERY ASK-ARIA ROUTE USES `supabaseAdmin`, THE SERVICE ROLE, WHICH BYPASSES RLS ENTIRELY.
 * So in production the isolation that actually holds is the `.eq('business_id', ...)` in the query.
 * RLS is the backstop; the filter is the door. This file guards the door, because that is the layer
 * that regresses when someone adds a route in a hurry.
 */

const root = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')

/** Every route file that reads or writes the conversation store. */
function routesTouching(table: string): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(join(root, dir))) {
      const rel = dir + '/' + entry
      const full = join(root, rel)
      if (statSync(full).isDirectory()) { walk(rel); continue }
      if (!entry.endsWith('.ts') && !entry.endsWith('.tsx')) continue
      if (read(rel).includes(table)) out.push(rel)
    }
  }
  walk('src/app/api')
  return out
}

const CONV_ROUTES = routesTouching('aria_conversations')

describe('S2 · every conversation route is scoped to one business', () => {
  it('finds the routes at all, so the sweep cannot pass vacuously', () => {
    expect(CONV_ROUTES.length).toBeGreaterThanOrEqual(5)
  })

  it('EVERY route touching aria_conversations scopes by business_id', () => {
    // The service role ignores RLS, so a missing filter here is a real cross-tenant read.
    const unscoped: string[] = []
    for (const f of CONV_ROUTES) {
      const src = read(f)
      // it must constrain business_id somewhere, or resolve it from the authenticated rail
      const scoped = /business_id/.test(src)
      if (!scoped) unscoped.push(f)
    }
    expect(unscoped, 'routes reading conversations without a business scope: ' + unscoped.join(', '))
      .toEqual([])
  })

  it('no SERVICE-ROLE read of message content is keyed on an id alone', () => {
    /**
     * THE PRECISE RULE, after my first version of this test cried wolf.
     *
     * It originally flagged 11 blocks, and none of them were leaks:
     *   - the delete route SELECTs by id in order to READ business_id, then gates on a 403
     *     ownership check. The select IS the check.
     *   - the action route uses `supabase`, the RLS-BOUND client, where the policy does the work.
     * Flagging those is the failure mode the standing rules call a measurement error in your own
     * diagnostic, so the test now distinguishes what actually matters:
     *
     *   supabaseAdmin  bypasses RLS -> the query's own filter is the ONLY isolation
     *   supabase       RLS applies  -> the policy is the isolation
     *
     * and it only cares about reads of message CONTENT, not of `id, business_id` (an ownership probe).
     */
    const offenders: string[] = []
    for (const f of CONV_ROUTES) {
      const src = read(f)
      let cursor = 0
      const marker = "from('aria_conversations')"
      while (true) {
        const at = src.indexOf(marker, cursor)
        if (at === -1) break
        cursor = at + marker.length
        const before = src.slice(Math.max(0, at - 80), at)
        const head = src.slice(at, at + 240)

        // only the service role bypasses RLS; the RLS-bound client is protected by the policy
        if (!/supabaseAdmin/.test(before)) continue
        // only content reads matter — selecting id/business_id IS an ownership probe
        if (!/\.select\(\s*'[^']*messages/.test(head)) continue
        if (!/\.eq\('id',/.test(head)) continue
        if (/\.eq\('business_id',/.test(head)) continue

        offenders.push(f + '@' + at)
      }
    }
    expect(offenders, 'service-role read of message content with no business scope: ' + offenders.join(', '))
      .toEqual([])
  })

  it('PROBE — an unscoped service-role content read is detectable', () => {
    // Proves the scan above can fail, and that each of its three filters is doing work.
    const leak = "supabaseAdmin.from('aria_conversations').select('messages').eq('id', id).maybeSingle()"
    const at = leak.indexOf("from('aria_conversations')")
    const before = leak.slice(0, at)
    const head = leak.slice(at)
    expect(/supabaseAdmin/.test(before)).toBe(true)
    expect(/\.select\(\s*'[^']*messages/.test(head)).toBe(true)
    expect(/\.eq\('id',/.test(head)).toBe(true)
    expect(/\.eq\('business_id',/.test(head)).toBe(false)

    // and the three things it must NOT flag
    const ownershipProbe = "supabaseAdmin.from('aria_conversations').select('id, business_id').eq('id', id)"
    expect(/\.select\(\s*'[^']*messages/.test(ownershipProbe.slice(ownershipProbe.indexOf('from')))).toBe(false)

    const rlsBound = "supabase.from('aria_conversations').select('messages').eq('id', id)"
    expect(/supabaseAdmin/.test(rlsBound.slice(0, rlsBound.indexOf('from')))).toBe(false)

    const scoped = "supabaseAdmin.from('aria_conversations').select('messages').eq('id', id).eq('business_id', bid)"
    expect(/\.eq\('business_id',/.test(scoped.slice(scoped.indexOf('from')))).toBe(true)
  })
})

describe('S2 · the live RLS proof is recorded where it can be re-run', () => {
  it('the cross-tenant result is written into the run log, with the numbers', () => {
    const run = read('docs/aria/RUN-S2.md')
    expect(run).toMatch(/own=173\s+foreign=0/)
    expect(run).toMatch(/own=112\s+foreign=0/)
  })

  it('the RLS policies are business-scoped, not user-scoped', () => {
    // Recorded from pg_policies on 2026-08-26. A user-scoped policy would break the moment a
    // business has a second user, which is a real plan for this product.
    const run = read('docs/aria/RUN-S2.md')
    expect(run).toMatch(/business_id IN \(/)
  })
})
