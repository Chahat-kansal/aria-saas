import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')
const GUARD = read('scripts/canon-rail-guard.ts')

function allowlist(): string[] {
  const at = GUARD.indexOf('const MODEL_GATEWAY_ALLOWLIST = [')
  // Closed on a `]` at the START OF A LINE, not the first `]` in the slice. Next.js route segments
  // put brackets INSIDE the paths — 'src/app/api/customers/[id]/aria-insight/route.ts' — so
  // indexOf(']') stops 95 entries early and silently. My first version did exactly that and the
  // anti-vacuity assertion below is what caught it.
  const end = GUARD.indexOf(String.fromCharCode(10) + ']', at)
  return (GUARD.slice(at, end).match(/'src\/[^']+'/g) ?? []).map(s => s.slice(1, -1))
}

/**
 * WALL 1 (M13 phase 4) — THE ALLOW-LIST IS THE BACKLOG, AND IT CAN ONLY SHRINK.
 *
 * 177 files construct a provider client or call a model directly. Every one is its own decision
 * about failover (there is none), its own cost logging (the ledger undercounts by roughly half),
 * and its own idea of what Aria is. They are grandfathered so the guard can ship today; this test
 * is what stops "grandfathered" turning into "permanent".
 *
 * ⚠️ **THE CEILING BELOW IS A RATCHET.** When you migrate a file onto `callModel()`, remove it from
 * the list and lower this number. It must never be raised — raising it is adding a file that is
 * allowed to bypass the gateway, which is the wall coming down one brick at a time.
 */
const CEILING = 177

describe('M13 phase 4 · the W1 allow-list ratchets down, never up', () => {
  it('ANTI-VACUITY — the list is real and was actually parsed', () => {
    const list = allowlist()
    expect(list.length).toBeGreaterThan(100)
    expect(list.every(p => p.startsWith('src/'))).toBe(true)
    // A few that must be on it, so a parse returning junk cannot pass.
    // Two real entries, so a parse returning junk cannot pass. gemini.ts is deliberately NOT one
    // of them: it calls the Gemini REST API directly rather than through GoogleGenerativeAI, so it
    // never matched the scan. My first version asserted it WAS on the list and was wrong.
    expect(list).toContain('src/app/api/agent/route.ts')
    expect(list).toContain('src/app/api/aria/autopilot/route.ts')
  })

  it('IT HAS NOT GROWN', () => {
    const n = allowlist().length
    expect(n, 'the W1 allow-list grew from ' + CEILING + ' to ' + n
      + ' — a file was added that is allowed to bypass the gateway').toBeLessThanOrEqual(CEILING)
  })

  it('no duplicates — a double entry hides a file that was never migrated', () => {
    const list = allowlist()
    expect(new Set(list).size).toBe(list.length)
  })

  it('the gateway itself is NOT on the list — it is a home, not an exception', () => {
    // src/lib/ai/ and src/lib/aria/providers/ are exempt by PATH. If the gateway were also
    // allow-listed, deleting the homes would silently keep it working and hide the regression.
    const list = allowlist()
    expect(list).not.toContain('src/lib/ai/gateway.ts')
    expect(GUARD).toContain("'src/lib/ai/'")
    expect(GUARD).toContain("'src/lib/aria/providers/'")
  })

  it('the rule is wired, and catches what the older SDK rule does not', () => {
    // Rule 8 (MS15) already blocked `new Anthropic(`. This one also blocks .messages.create(,
    // GoogleGenerativeAI and generateContent( — PROVEN by probe: a new file calling
    // `.messages.create(` produced exactly one violation, [model-call-outside-gateway], with rule 8
    // silent. Both directions were observed and the probe removed.
    expect(GUARD).toContain('model-call-outside-gateway')
    expect(GUARD).toContain('MODEL_GATEWAY_HOMES')
    expect(GUARD).toMatch(/messages\\\.create/)
    expect(GUARD).toContain('GoogleGenerativeAI')
    expect(GUARD).toContain('callModel() from src/lib/ai/gateway.ts')
  })
})
