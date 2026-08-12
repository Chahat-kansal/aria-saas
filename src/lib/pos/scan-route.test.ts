import { describe, it, expect } from 'vitest'
import { routeScan, isCustomerCode, CUSTOMER_CODE_RE } from '@/lib/pos/scan-route'

// ARIA-ATTACH-CUSTOMER-1 — the disambiguation, which is the whole design.
//
// Context for anyone changing this: the last sale carrying a customer_id was 5 June. Every loyalty
// engine hangs off customerId and none had ever been handed one, because the manual attach costs
// four screen interactions and a cashier will not pay that during a rush. Scanning the customer's
// own code costs one physical action and zero screen interactions.

describe('routeScan — order is load-bearing', () => {
  // ── STEP 1: a catalogued product always wins ────────────────────────────────────────────────
  it('a catalogued product wins outright, even when it is ten digits', () => {
    // THE COLLISION CASE. A café with a custom 10-digit SKU must still ring it up as a product.
    // If this ever returns 'customer', scanning stock starts hunting for people.
    expect(routeScan('1234567890', true)).toBe('product')
    expect(routeScan('9312345678907', true)).toBe('product')
  })

  // ── STEP 2: a ten-digit miss is a loyalty code ──────────────────────────────────────────────
  it('a ten-digit code that is not in the catalogue routes to the customer resolver', () => {
    expect(routeScan('1234567890', false)).toBe('customer')
    expect(routeScan('0000000001', false)).toBe('customer')
  })

  // ── STEP 3: everything else is a product lookup ─────────────────────────────────────────────
  it('real retail symbologies never route to the customer resolver', () => {
    // EAN-13, UPC-A, EAN-8, ITF-14 — none is ten digits, which is the reason this scheme is safe.
    for (const barcode of ['9312345678907', '036000291452', '96385074', '10312345678903']) {
      expect(routeScan(barcode, false)).toBe('global_product')
    }
  })

  it('non-numeric and wrong-length codes fall through to products', () => {
    for (const code of ['ABC1234567', '123456789', '12345678901', '', '12345678a0', '123-456-789']) {
      expect(routeScan(code, false)).toBe('global_product')
    }
  })
})

describe('isCustomerCode', () => {
  it('is exactly ten digits — not nine, not eleven, not letters', () => {
    expect(isCustomerCode('1234567890')).toBe(true)
    expect(isCustomerCode('123456789')).toBe(false)
    expect(isCustomerCode('12345678901')).toBe(false)
    expect(isCustomerCode('12345678a0')).toBe(false)
    expect(isCustomerCode(' 1234567890')).toBe(false)   // the wedge buffer is trimmed before this
  })

  it('is anchored at both ends — a ten-digit run inside a longer code is not a match', () => {
    // Without anchors, every EAN-13 would contain a "customer code" and step 2 would eat products.
    expect(CUSTOMER_CODE_RE.source.startsWith('^')).toBe(true)
    expect(CUSTOMER_CODE_RE.source.endsWith('$')).toBe(true)
    expect(isCustomerCode('9312345678907')).toBe(false)
  })
})
