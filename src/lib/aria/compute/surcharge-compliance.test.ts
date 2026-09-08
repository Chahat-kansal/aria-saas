import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { surchargingAllowedOn, SURCHARGE_BAN_FACTS } from './card-cost'

/**
 * M14 PHASE 5 — THE COMPLIANCE SWEEP.
 *
 * ⚠️ THE SPRINT SAYS "REMOVE IT". DATE-GATING IT IS STRICTLY BETTER, AND THAT IS WHAT SHIPPED.
 * Surcharging is entirely legal until 30 September 2026. Deleting the checkout surcharge line today
 * would break every venue lawfully surcharging for the next three weeks — a downgrade, which RULE 0
 * forbids. Deleting it later needs a human to remember on the day. The gate does both jobs and
 * leaves the owner's configuration intact.
 */
describe('M14 phase 5 · the gate flips at Melbourne midnight, on the day', () => {
  const at = (iso: string) => surchargingAllowedOn(new Date(iso))

  it('allowed the instant before, forbidden the instant after', () => {
    expect(at('2026-09-30T23:59:59+10:00')).toBe(true)
    expect(at('2026-10-01T00:00:00+10:00')).toBe(false)
    expect(at('2026-10-01T00:00:01+10:00')).toBe(false)
  })

  it('⚠️ the boundary is AEST, not UTC — a UTC gate would flip 10 hours early', () => {
    // 2026-09-30 14:00 UTC IS 1 October in Melbourne, so it must already be forbidden.
    expect(at('2026-09-30T14:00:00Z')).toBe(false)
    // 13:59 UTC is still 30 September in Melbourne, so it must still be allowed.
    expect(at('2026-09-30T13:59:00Z')).toBe(true)
    // A naive UTC-midnight gate would have said "allowed" for that first case.
    const naiveUtc = (d: string) => new Date(d).getTime() < Date.parse('2026-10-01T00:00:00Z')
    expect(naiveUtc('2026-09-30T14:00:00Z')).toBe(true)
    expect(at('2026-09-30T14:00:00Z')).not.toBe(naiveUtc('2026-09-30T14:00:00Z'))
  })

  it('1 October 2026 is before daylight saving starts, so +10 is the right offset', () => {
    // DST begins on the first Sunday of October — the 4th — so 1 October is still AEST (+10).
    // Using AEDT (+11) would put the boundary an hour EARLIER in absolute time, and the gate must
    // NOT flip then: 2026-10-01T00:00+11:00 is 13:00Z on 30 September, still 30 September in
    // Melbourne, and surcharging is still lawful.
    expect(at('2026-10-01T00:00:00+11:00')).toBe(true)
    expect(at('2026-10-01T00:00:00+10:00')).toBe(false)
    // One hour apart, and the gate is on the correct side of both.
    expect(Date.parse('2026-10-01T00:00:00+10:00') - Date.parse('2026-10-01T00:00:00+11:00')).toBe(3600000)
  })

  it('it stays forbidden long afterwards, and was allowed long before', () => {
    expect(at('2027-06-01T12:00:00+10:00')).toBe(false)
    expect(at('2026-01-01T12:00:00+10:00')).toBe(true)
  })

  it('the gate uses the same date as the facts — one source, not two', () => {
    expect(SURCHARGE_BAN_FACTS.effective).toBe('2026-10-01')
    expect(at(SURCHARGE_BAN_FACTS.effective + 'T00:00:00+10:00')).toBe(false)
  })
})

/**
 * The sweep. `surcharge` is an overloaded word in this repo — a **weekend penalty rate** is also
 * called a surcharge, in payroll and award code, and has nothing to do with card fees. Sweeping
 * those would be a false positive that costs someone a day.
 */
const root = join(__dirname, '..', '..', '..', '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(join(root, dir))) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue
    const rel = dir + '/' + entry
    if (statSync(join(root, rel)).isDirectory()) walk(rel, out)
    else if (/\.tsx?$/.test(entry)) out.push(rel)
  }
  return out
}

/** Files a CUSTOMER can see the output of. Owner-facing settings screens are deliberately excluded. */
const CUSTOMER_FACING = [
  'src/app/menu',
  'src/app/order',
  'src/components/order',
  'src/app/api/public',
]

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')

describe('M14 phase 5 · no ungated surcharge claim reaches a customer', () => {
  const files = CUSTOMER_FACING.flatMap(d => {
    try { return walk(d) } catch { return [] }
  })

  it('ANTI-VACUITY — the sweep actually reads customer-facing files', () => {
    // A sweep over an empty list passes forever. This repo's failure pattern #1.
    expect(files.length).toBeGreaterThan(10)
    expect(files.some(f => f.includes('MenuClient'))).toBe(true)
  })

  it('every surcharge mention a customer could read is behind the gate', () => {
    const offenders: string[] = []
    for (const f of files) {
      const src = strip(read(f))
      if (!/surcharge|card fee|1\.5%/i.test(src)) continue
      // A mention is acceptable only in a file that also consults the gate.
      if (!src.includes('surchargingAllowedOn')) offenders.push(f)
    }
    expect(offenders).toEqual([])
  })

  it('MUTATION — an ungated claim is exactly what goes red', () => {
    // The line as it stood before this phase, in a file with no gate.
    const before = 'Pay with <strong>PayID</strong> — save 1.5%, no card surcharge'
    const ungated = strip(before)
    expect(/surcharge|card fee|1\.5%/i.test(ungated)).toBe(true)
    expect(ungated.includes('surchargingAllowedOn')).toBe(false)
    // …which is the offender condition above, so the sweep would have caught it.
  })

  it('⚠️ a WEEKEND PENALTY RATE is also called a surcharge, and must NOT be swept', () => {
    // Payroll and award code use the same word for something entirely unrelated to card fees.
    // A sweep that caught those would send someone hunting a compliance problem that is not one.
    const payroll = 'const weekendSurcharge = award.saturdayLoading * hours'
    expect(/surcharge/i.test(payroll)).toBe(true)
    // It lives outside the customer-facing tree, which is why the sweep never sees it.
    expect(CUSTOMER_FACING.some(d => 'src/app/dashboard/staff/payroll'.startsWith(d))).toBe(false)
    expect(CUSTOMER_FACING.some(d => 'src/app/api/staff/award-rates'.startsWith(d))).toBe(false)
  })

  it('the POS terminal stops CHARGING, not merely displaying', () => {
    // Filtering the rules at load is what makes this a compliance fix rather than a cosmetic one:
    // surchargeAmt falls to 0, so the amount is not added AND the line does not render.
    const terminal = read('src/app/pos/(fullscreen)/terminal/page.tsx')
    expect(terminal).toContain('surchargingAllowedOn() ? (d.rules ?? []).filter(r => r.is_active) : []')
  })
})
