import { describe, it, expect } from 'vitest'
import { normalisePhone, toE164AU, normaliseCustomerPhone, isNormalisedAuPhone } from '@/lib/phone'

// ARIA-PHONE-NORMALISE-1 — one algorithm, one behaviour.
//
// Two functions used to normalise phone numbers differently. normalisePhone blanket-prefixed '+61'
// onto ANYTHING not already '+' or '0'-led, so `234567u8io` became `+61234567u8io`: a value that
// looks canonical, cannot exist, and was then matched against as though it were real. That is how
// one person becomes two loyalty identities, and how an SMS is "sent" to a number that can never
// receive it.
//
// normalisePhone now delegates to toE164AU. These tests pin the shared behaviour so the two cannot
// drift apart again.

const CASES: Array<[label: string, input: string, expected: string | null]> = [
  // ── the forms a customer actually types ──────────────────────────────────────────────────────
  ['04xx mobile',              '0412345678',        '+61412345678'],
  ['04xx with spaces',         '0412 345 678',      '+61412345678'],
  ['04xx with hyphens',        '0412-345-678',      '+61412345678'],
  ['already E.164',            '+61412345678',      '+61412345678'],
  ['E.164 with spaces',        '+61 412 345 678',   '+61412345678'],
  ['61-led, no plus',          '61412345678',       '+61412345678'],
  ['bare 9 digits',            '412345678',         '+61412345678'],
  ['landline 03',              '0398765432',        '+61398765432'],
  ['landline with parens',     '(03) 9876 5432',    '+61398765432'],
  ['leading/trailing spaces',  '  0412345678  ',    '+61412345678'],

  // ── unresolvable: NULL, never a fabricated +61 ───────────────────────────────────────────────
  ['empty string',             '',                  null],
  ['whitespace only',          '   ',               null],
  ['letters',                  'not a phone',       null],
  ['too short',                '12345',             null],
  ['international non-AU',     '+14155552671',      null],
  ['UK number',                '+447911123456',     null],

  // ── the EXACT junk found in production (pos_customers / pos_online_orders) ────────────────────
  ['junk: 234567u8io',         '234567u8io',        null],
  ['junk: 11855885',           '11855885',          null],
  ['junk: 1234567878',         '1234567878',        null],
  ['junk: 1234567890',         '1234567890',        null],
  ['junk: 45678906789',        '45678906789',       null],
  ['junk: 34567890-',          '34567890-',         null],
  ['junk: 09876543276',        '09876543276',       null],
]

describe('toE164AU — the single algorithm', () => {
  for (const [label, input, expected] of CASES) {
    it(label + ' -> ' + String(expected), () => {
      expect(toE164AU(input)).toBe(expected)
    })
  }

  it('null and undefined are handled without throwing', () => {
    expect(toE164AU(null)).toBeNull()
    expect(toE164AU(undefined)).toBeNull()
  })

  it('NEVER returns a +61 value that is not exactly +61 plus nine digits', () => {
    // The whole class of bug: a fabricated number that LOOKS canonical. If any input can produce
    // one, matching and SMS both break silently.
    for (const [, input] of CASES) {
      const out = toE164AU(input)
      if (out !== null) expect(out).toMatch(/^\+61\d{9}$/)
    }
  })
})

describe('normalisePhone — now identical to toE164AU', () => {
  it('agrees with toE164AU on every case, including the junk', () => {
    // This is the assertion the sprint exists for. Before, these two disagreed on exactly the
    // malformed inputs — which is where the damage was.
    for (const [, input] of CASES) {
      expect(normalisePhone(input)).toBe(toE164AU(input))
    }
  })

  it('no longer fabricates a +61 for junk input', () => {
    // The old behaviour, named so a regression is unmistakable:
    //   '234567u8io'  -> '+61234567u8io'
    //   '1234567878'  -> '+611234567878'
    expect(normalisePhone('234567u8io')).toBeNull()
    expect(normalisePhone('1234567878')).toBeNull()
    expect(normalisePhone('61419579975')).toBe('+61419579975')  // was double-prefixed to +6161…
  })
})

describe('normaliseCustomerPhone — the "keep the raw" wrapper', () => {
  it('canonicalises what it can', () => {
    expect(normaliseCustomerPhone('0412 345 678')).toBe('+61412345678')
  })

  it('returns the trimmed RAW input when unresolvable — never null, never fabricated', () => {
    // Deliberately different from normalisePhone: storage keeps what the user typed rather than
    // losing it. The number is obviously bad, which is the point — it is not disguised as valid.
    expect(normaliseCustomerPhone('234567u8io')).toBe('234567u8io')
    expect(normaliseCustomerPhone('  11855885 ')).toBe('11855885')
    expect(normaliseCustomerPhone('')).toBe('')
    expect(normaliseCustomerPhone(null)).toBe('')
  })
})

describe('isNormalisedAuPhone', () => {
  it('accepts canonical mobiles and landlines, rejects the rest', () => {
    expect(isNormalisedAuPhone('+61412345678')).toBe(true)
    expect(isNormalisedAuPhone('+61398765432')).toBe(true)
    expect(isNormalisedAuPhone('0412345678')).toBe(false)
    expect(isNormalisedAuPhone('+61234567u8io')).toBe(false)
    expect(isNormalisedAuPhone(null)).toBe(false)
  })
})
