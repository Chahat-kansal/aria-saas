import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { hashStaffPin, verifyStaffPin, isValidStaffPin } from '@/lib/pos/staff-pin'

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
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (p.endsWith('.ts') || p.endsWith('.tsx')) out.push(p)
  }
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
  })
})
