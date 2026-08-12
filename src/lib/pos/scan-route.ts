// ARIA-ATTACH-CUSTOMER-1 — which resolver does a scanned code belong to?
//
// The till's keyboard-wedge listener buffers characters and dispatches on Enter. Before this, the
// only two outcomes were "catalogued product" and "global product lookup", so a customer's loyalty
// code scanned at the counter missed the catalogue, fired a pointless Open Food Facts lookup, and
// told the cashier "Not in your catalogue — add via Products". It could never attach a customer.
//
// Extracted from the handler because the ORDER is the whole design and it is otherwise only
// assertable by scanning things at a real counter.

export type ScanRoute = 'product' | 'customer' | 'global_product'

/** A loyalty short_code is exactly ten digits (loyalty_identity.short_code). */
export const CUSTOMER_CODE_RE = /^\d{10}$/

export function isCustomerCode(code: string): boolean {
  return CUSTOMER_CODE_RE.test(code)
}

/**
 * Decide where a scanned code goes.
 *
 * @param code              the buffered scan
 * @param inLocalCatalogue  true when barcodeMap has a hit for it AND that product is active
 *
 * THE ORDER IS LOAD-BEARING:
 *  1. A catalogued product WINS OUTRIGHT — product scanning is untouched, and a café with a custom
 *     10-digit SKU still rings it up as a product rather than hunting for a customer.
 *  2. A miss that is exactly ten digits is a loyalty code. Retail symbologies are EAN-13 (13),
 *     UPC-A (12), EAN-8 (8) and ITF-14 (14); ten digits is not one of them, so a genuine product
 *     barcode cannot be mistaken for a customer. The only overlap is a custom 10-digit SKU, and
 *     step 1 already claims it.
 *  3. Everything else falls through to the existing global product lookup, unchanged.
 */
export function routeScan(code: string, inLocalCatalogue: boolean): ScanRoute {
  if (inLocalCatalogue) return 'product'
  if (isCustomerCode(code)) return 'customer'
  return 'global_product'
}
