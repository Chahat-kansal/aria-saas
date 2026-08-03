// SEC-EXT-TEXT-1 — text arriving from a third party (carrier webhooks, connector syncs, scraped
// pages) is stored and later read by the Aria brain. Length-capped and stripped of control chars
// and instruction-shaped markup so a forged payload can't smuggle directives into a prompt or
// break a downstream renderer. Deliberately conservative: it neuters, it does not reject.
//
// This is a defence-in-depth layer, NOT the primary control. The primary control is that the
// identifier a record is matched on is validated to an exact shape before any write (see
// SEC-PARCEL-1). Sanitising free text is what remains once the row is correctly scoped.
export function sanitizeExternalText(input: unknown, maxLen = 200): string {
  return String(input ?? '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')        // control chars incl. the NUL family
    .replace(/[<>]/g, '')                          // no markup into HTML renderers
    .replace(/\b(ignore|disregard)\s+(all\s+)?(previous|prior|above)\b/gi, '[filtered]')
    .replace(/\b(system|assistant)\s*:/gi, '[filtered]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen)
}

/**
 * SEC-PARCEL-1 — shape gate for a carrier tracking number.
 *
 * Tracking numbers are exact identifiers, so they can be constrained to an alphabet that contains
 * no LIKE metacharacters (`%`, `_`) and no PostgREST wildcard (`*`). Returning null rather than a
 * sanitised value is deliberate: a tracking number that does not match this shape is not a
 * tracking number, and silently rewriting it would match the wrong parcel rather than no parcel.
 */
export function validTrackingNumber(input: unknown): string | null {
  const n = String(input ?? '').toUpperCase().trim()
  return /^[A-Z0-9.-]{4,40}$/.test(n) ? n : null
}
