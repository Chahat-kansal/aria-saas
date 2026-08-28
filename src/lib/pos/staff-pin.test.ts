import { describe, it, expect, afterEach } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import {
  hashStaffPin, verifyStaffPin, isValidStaffPin, staffPinColumns, isDuplicatePinError,
} from '@/lib/pos/staff-pin'

// SEC-PIN-2 §4 — the guard for the pattern that produced this sprint.
//
// SEC-PIN-1 introduced verifyStaffPin and six routes adopted it. Two did not, and one of the two
// was the MANAGER OVERRIDE gate — the check that authorises voids, discounts and price overrides.
// The fix landed on six files and the sibling sweep stopped one short.

describe('verifyStaffPin', () => {
  it('accepts the correct PIN against its hash', async () => {
    const hash = await hashStaffPin('4821')
    expect(await verifyStaffPin('4821', hash)).toBe(true)
  })

  it('rejects a wrong PIN', async () => {
    const hash = await hashStaffPin('4821')
    expect(await verifyStaffPin('4822', hash)).toBe(false)
  })

  it('rejects a null/undefined/empty hash rather than throwing', async () => {
    // A row that has not been upgraded must fail closed here; the CALLER decides whether to try
    // the legacy plaintext branch. Returning false (not throwing) is what makes that possible.
    expect(await verifyStaffPin('4821', null)).toBe(false)
    expect(await verifyStaffPin('4821', undefined)).toBe(false)
    expect(await verifyStaffPin('4821', '')).toBe(false)
  })

  it('rejects a malformed hash without throwing', async () => {
    expect(await verifyStaffPin('4821', 'not-a-bcrypt-hash')).toBe(false)
  })

  it('is salted — the same PIN hashes differently, and both verify', async () => {
    const a = await hashStaffPin('4821')
    const b = await hashStaffPin('4821')
    expect(a).not.toBe(b)
    expect(await verifyStaffPin('4821', a)).toBe(true)
    expect(await verifyStaffPin('4821', b)).toBe(true)
  })

  it('uses bcrypt, whose compare does not short-circuit on first mismatch', async () => {
    // The timing property is INHERENT to bcrypt.compare — it compares full digests, unlike `===`
    // on a string, which returns as soon as two characters differ and leaks the shared prefix.
    // Asserting the hash format is how we assert the constant-time path is the one in use.
    const hash = await hashStaffPin('4821')
    expect(hash).toMatch(/^\$2[aby]\$\d{2}\$/)      // bcrypt, not a plaintext or a fast digest
    // A PIN sharing a long prefix with the real one must be no more acceptable than a random one.
    expect(await verifyStaffPin('4820', hash)).toBe(false)
    expect(await verifyStaffPin('9999', hash)).toBe(false)
  })
})

describe('isValidStaffPin', () => {
  it('accepts 4-6 digits', () => {
    expect(isValidStaffPin('4821')).toBe(true)
    expect(isValidStaffPin('482193')).toBe(true)
  })
  it('rejects weak and malformed PINs', () => {
    expect(isValidStaffPin('1234')).toBe(false)   // sequential
    expect(isValidStaffPin('0000')).toBe(false)   // repeated
    expect(isValidStaffPin('482')).toBe(false)    // too short
    expect(isValidStaffPin('12a4')).toBe(false)   // non-digit
    expect(isValidStaffPin(4821)).toBe(false)     // non-string
  })
})

// ── THE STATIC GUARD — this is the one that would have caught SEC-PIN-2 existing ────────────────
// A plaintext `.pin ===` comparison anywhere outside staff-pin.ts and the documented legacy
// fallbacks is the exact defect this sprint fixed. Grep is what found it; grep is what pins it.
function walkUncached(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) walkUncached(p, out)
    else if (p.endsWith('.ts') || p.endsWith('.tsx')) out.push(p)
  }
  return out
}

/**
 * S5 — CACHED. This walk stats several thousand files, and two tests in this file called it
 * independently. Under disk contention the second one alone took 7,267ms and blew vitest's default
 * 5s timeout, failing a SECURITY rail for reasons that had nothing to do with security. The tree
 * cannot change mid-run, so walking it twice was pure cost.
 *
 * The sibling test at :109 was given an explicit 30s timeout for exactly this reason and this one
 * was missed. Caching fixes the cause; the timeout below covers the first (uncached) call, which
 * still pays the full cost.
 */
const walkCache = new Map<string, string[]>()
function walk(dir: string): string[] {
  const hit = walkCache.get(dir)
  if (hit) return hit
  const out = walkUncached(dir)
  walkCache.set(dir, out)
  return out
}

describe('no route compares a PIN in plaintext', () => {
  it('the only === / !== comparisons on .pin are documented legacy fallbacks', () => {
    const offenders: string[] = []
    for (const file of walk('src')) {
      if (file.includes('staff-pin')) continue          // the helper itself
      const text = readFileSync(file, 'utf8')
      text.split('\n').forEach((line, i) => {
        if (!/\.pin\s*(===|!==)/.test(line)) return
        // The legacy branch is permitted ONLY where it is the documented fallback for a row with
        // no hash yet — which always reads `X.pin_hash ? verifyStaffPin(...) : X.pin === pin`.
        if (/pin_hash/.test(text.slice(Math.max(0, text.indexOf(line) - 400), text.indexOf(line)))) return
        offenders.push(file.replace(/\\/g, '/') + ':' + (i + 1))
      })
    }
    expect(offenders, 'plaintext PIN comparison outside the helper: ' + offenders.join(', ')).toEqual([])
    // MS16C — explicit timeout, NOT a weaker assertion. This test walks every file under src/,
    // reads each one, and runs an indexOf over the whole file per matching line, so it is slow by
    // construction. Under vitest's 5s default it times out intermittently when the disk is busy —
    // it blocked two pushes during MS16C while the tree was being built and screenshotted, and the
    // first time it did, the failure was mistaken for a mystery flake because the hook output was
    // truncated before the test name appeared.
    //
    // The check itself is unchanged: same walk, same pattern, same offenders list, same expectation.
    // Only the time budget moves. A security rail that fails randomly under load is a rail people
    // learn to push past with --no-verify, which is exactly how this guard would stop working.
  }, 30_000)

  // ── SEC-PIN-3 — THE BLIND SPOT IN THE GUARD ABOVE ─────────────────────────────────────────────
  // The pattern `\.pin (===|!==)` cannot match `m.manager_pin === manager_pin`, because the
  // character before `pin` there is `_`, not `.`. So the SEC-PIN-2 sweep was structurally incapable
  // of seeing pos_users.manager_pin — a SECOND plaintext PIN column, feeding a THIRD manager-override
  // path (/api/pos/manager-override, alongside manager-verify and users/verify-override), compared
  // with `===` and readable from a database dump. Found by SEC-PIN-3's §3 sweep, not by this file.
  //
  // Not fixed here: hashing it needs its own column, migration and UI change, and this sprint has
  // already grown from three writers to four. It is SEC-PIN-4. Live state as of 2026-08-07:
  // manager_pin is set on 0 of 1 pos_users rows, so the path is dormant — the dashboard page can
  // still set one, which is what makes it worth a guard rather than a note in a report.
  //
  // The allowlist holds the ONE known site. Anything new fails the build; and if that site is
  // edited, its entry stops matching and someone has to look at it deliberately.
  const KNOWN_MANAGER_PIN_SITES = ['src/app/api/pos/manager-override/route.ts']

  it('no NEW route compares manager_pin in plaintext (SEC-PIN-4 tracks the one that does)', () => {
    const offenders: string[] = []
    for (const file of walk('src')) {
      const norm = file.replace(/\\/g, '/')
      if (norm.includes('staff-pin')) continue      // this file states the pattern; it is not a site
      if (KNOWN_MANAGER_PIN_SITES.includes(norm)) continue
      if (/\.manager_pin\s*(===|!==)/.test(readFileSync(file, 'utf8'))) offenders.push(norm)
    }
    expect(offenders, 'new plaintext manager_pin comparison: ' + offenders.join(', ')).toEqual([])
  }, 30_000)

  it('POSITIVE CONTROL — the allowlisted site really does still contain the defect', () => {
    // Without this the allowlist would quietly become a list of files that no longer matter, and the
    // test above would pass forever while the real comparison moved somewhere unwatched.
    for (const f of KNOWN_MANAGER_PIN_SITES) {
      expect(/\.manager_pin\s*(===|!==)/.test(readFileSync(f, 'utf8')),
        f + ' no longer compares manager_pin — remove it from KNOWN_MANAGER_PIN_SITES').toBe(true)
    }
  })
})

// ── SEC-PIN-3 §1 ────────────────────────────────────────────────────────────────────────────────

describe('staffPinColumns — the one place that decides what a PIN write stores', () => {
  const saved = process.env.STAFF_PIN_PEPPER
  afterEach(() => {
    if (saved === undefined) delete process.env.STAFF_PIN_PEPPER
    else process.env.STAFF_PIN_PEPPER = saved
  })

  it('with the pepper set: writes hash + lookup, and NO plaintext', async () => {
    process.env.STAFF_PIN_PEPPER = 'test-pepper'
    const cols = await staffPinColumns('biz-1', '4821')
    expect(cols.pin_hash).toMatch(/^\$2[aby]\$\d{2}\$/)
    expect(cols.pin_lookup).toMatch(/^[0-9a-f]{64}$/)
    // The deliverable of the whole sprint, in one assertion.
    expect('pin' in cols).toBe(false)
    expect(await verifyStaffPin('4821', cols.pin_hash)).toBe(true)
  })

  it('the lookup is business-scoped — the same PIN at two cafés is two different values', async () => {
    process.env.STAFF_PIN_PEPPER = 'test-pepper'
    const a = await staffPinColumns('biz-1', '4821')
    const b = await staffPinColumns('biz-2', '4821')
    expect(a.pin_lookup).not.toBe(b.pin_lookup)
    // ...but deterministic within one business, which is what makes it indexable at all.
    expect((await staffPinColumns('biz-1', '4821')).pin_lookup).toBe(a.pin_lookup)
  })

  it('with the pepper UNSET: degrades to today’s behaviour rather than writing an unfindable row', async () => {
    // DELIBERATE DEVIATION, guarded so it stays deliberate. A row with a hash but no lookup and no
    // plaintext can log in (verify-pin knows the id) but can NEVER be found by verify-override,
    // clock-in/out or canopy-pin, which identify a person from the PIN alone. Half-broken and
    // invisible until someone reaches for the till. Keeping plaintext here is exactly the
    // pre-sprint behaviour, so it is a no-op, not a regression — and §2's precondition query
    // (`pin is not null and pin_lookup is null` must be 0) is what detects it.
    delete process.env.STAFF_PIN_PEPPER
    const cols = await staffPinColumns('biz-1', '4821')
    expect(cols.pin_hash).toMatch(/^\$2[aby]\$\d{2}\$/)
    expect(cols.pin_lookup).toBeUndefined()
    expect(cols.pin).toBe('4821')
  })

  it('always produces a fresh salt — two calls for the same PIN differ', async () => {
    process.env.STAFF_PIN_PEPPER = 'test-pepper'
    const a = await staffPinColumns('biz-1', '4821')
    const b = await staffPinColumns('biz-1', '4821')
    expect(a.pin_hash).not.toBe(b.pin_hash)      // bcrypt, salted
    expect(a.pin_lookup).toBe(b.pin_lookup)      // HMAC, deterministic — that is the whole point
  })
})

describe('isDuplicatePinError', () => {
  it('recognises the unique-violation on (business_id, pin_lookup)', () => {
    expect(isDuplicatePinError({ code: '23505', message: 'duplicate key' })).toBe(true)
    expect(isDuplicatePinError({ message: 'pos_users_pin_lookup_uniq violated' })).toBe(true)
  })
  it('does not swallow unrelated errors — those must still surface as 500', () => {
    expect(isDuplicatePinError({ code: '42703', message: 'column does not exist' })).toBe(false)
    expect(isDuplicatePinError(null)).toBe(false)
    expect(isDuplicatePinError(undefined)).toBe(false)
  })
})

// ── THE ALLOWLIST GUARD ─────────────────────────────────────────────────────────────────────────
// SEC-PIN-2 was told about two writers and found three. SEC-PIN-3 was told about three and found
// FOUR — pos/staff/route.ts, which spread `pin` through its allowlist and wrote neither pin_hash
// nor pin_lookup, so every staff member added from the inventory-team page was created
// plaintext-only. Naming writers in a brief does not find them; this does.
const STAFF_TABLE = /from\('(pos_users|pos_staff)'\)/

/**
 * The text of every `.insert(...)` / `.update(...)` argument in a file, paren-balanced.
 *
 * A bare regex over whole lines is NOT good enough here and the first draft of this guard proved it:
 * it flagged five files over `rateLimit('pin:mgr:' + id)`, `const { pin: _pin, ...rest } =`, and
 * owner/access returning the generated PIN in its RESPONSE body — none of which write a column. A
 * guard that cries wolf gets deleted, and then it guards nothing. So: look only where a column value
 * can actually be written.
 */
function dbPayloads(text: string): string[] {
  const out: string[] = []
  const call = /\.(insert|update|upsert)\(/g
  let m: RegExpExecArray | null
  while ((m = call.exec(text))) {
    let depth = 1
    let i = m.index + m[0].length
    for (; i < text.length && depth > 0; i++) {
      if (text[i] === '(') depth++
      else if (text[i] === ')') depth--
    }
    out.push(text.slice(m.index + m[0].length, i - 1))
  }
  return out
}

const HASH_KEY = /\bpin_hash\s*:\s*(?!null)/   // building the column, not clearing it
const PIN_KEY  = /\bpin\s*[,:]\s*(?!null)/     // writing plaintext, not clearing it

describe('no route writes a staff PIN itself', () => {
  const apiFiles = walk('src/app/api').filter(f => STAFF_TABLE.test(readFileSync(f, 'utf8')))

  it('POSITIVE CONTROL — the walker actually reaches the writer files', () => {
    // Without this, a wrong path or a changed query style makes every assertion below pass on an
    // empty list. Two suites in this repo have already shipped green against an empty fixture.
    const norm = apiFiles.map(f => f.replace(/\\/g, '/'))
    expect(norm).toContain('src/app/api/pos/staff/route.ts')
    expect(norm).toContain('src/app/api/pos/users/route.ts')
    expect(norm).toContain('src/app/api/owner/access/route.ts')
    expect(norm.length).toBeGreaterThanOrEqual(6)
  })

  it('POSITIVE CONTROL — the payload extractor finds real writes to look inside', () => {
    // If dbPayloads() silently returned [] the two assertions below would pass on nothing.
    const payloads = apiFiles.flatMap(f => dbPayloads(readFileSync(f, 'utf8')))
    expect(payloads.length).toBeGreaterThan(5)
    expect(payloads.some(p => /pin_hash/.test(p) || /staffPinColumns/.test(p)),
      'no payload mentions a PIN column at all — the extractor is not seeing the writers').toBe(true)
  })

  it('only staff-pin.ts constructs pin_hash / pin_lookup values for the staff tables', () => {
    const offenders = apiFiles.filter(f => dbPayloads(readFileSync(f, 'utf8')).some(p => HASH_KEY.test(p)))
    expect(offenders.map(f => f.replace(/\\/g, '/')), 'builds pin_hash inline instead of calling staffPinColumns()').toEqual([])
  })

  it('no route writes a plaintext pin value', () => {
    const offenders = apiFiles.filter(f => dbPayloads(readFileSync(f, 'utf8')).some(p => PIN_KEY.test(p)))
    expect(offenders.map(f => f.replace(/\\/g, '/')), 'writes plaintext pin').toEqual([])
  })

  it('the pos_staff field allowlist does not contain pin', () => {
    // The literal thing that made pos/staff the fourth writer: `pin` sat in STAFF_FIELDS and was
    // spread verbatim into the insert.
    const src = readFileSync('src/app/api/pos/staff/route.ts', 'utf8')
    const m = src.match(/const STAFF_FIELDS = \[([^\]]*)\]/)
    expect(m, 'STAFF_FIELDS allowlist not found — it was renamed or removed').toBeTruthy()
    const fields = (m as RegExpMatchArray)[1].split(',').map(s => s.trim().replace(/'/g, '')).filter(Boolean)
    expect(fields).not.toContain('pin')
    expect(fields).toContain('name')            // positive control: parsed a real list, not ''
    expect(src).toContain('staffPinColumns(')   // ...and the PIN is still handled, just properly
  })
})
