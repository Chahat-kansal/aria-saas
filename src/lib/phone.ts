// S-PHONE-E164 / CUSTOMER-PHONE-1 — one place for phone normalisation.
//
// `normalisePhone` was defined in clicksend.ts and used by SMS send + suppression specifically so
// those two match each other. pos_customers never got the same treatment, so a regular who types
// 0470446388 at the till and +61470446388 online becomes two customers with two point balances and
// never reaches a reward. Live proof: Sip had exactly that pair — one row with 100 points and 7
// visits, a second created four days later with nothing (since merged).
//
// normalisePhone is MOVED here, not copied — clicksend.ts re-exports it, so there is still exactly
// one implementation and every existing importer of '@/lib/clicksend' is unaffected.

/**
 * Normalise an AU number to +61 E.164-ish form (shared by SMS send + suppression so they match).
 *
 * ⚠ Blanket-prefixes anything that is not already '+' or '0'-led, including strings that are not
 * phone numbers at all. Kept EXACTLY as it was — the SMS paths have always behaved this way and
 * changing them is not this sprint's job. For anything touching pos_customers, use toE164AU.
 */
export function normalisePhone(to: string): string {
  let phone = (to ?? '').trim()
  if (phone.startsWith('0')) phone = '+61' + phone.slice(1)
  if (!phone.startsWith('+')) phone = '+61' + phone
  return phone
}

/**
 * Canonical AU E.164. Returns null when the input cannot be resolved.
 *
 * THE SINGLE ALGORITHM. Callers store the RAW string when this returns null: never drop the
 * number, never coerce a foreign or malformed one into +61. normaliseCustomerPhone below is the
 * "?? raw" wrapper over it, so there is one implementation rather than two that can drift.
 *
 * WHY NOT JUST REUSE normalisePhone: its blanket '+61' prefix manufactures E.164 numbers that
 * cannot exist. Live pos_customers.phone holds `1234567878`, `45678906789`, `11855885` and even
 * `234567u8io`; the blanket version turns those into `+611234567878`, `+61234567u8io` and so on —
 * values that look canonical, are not, and would then be matched against as though they were.
 * Inventing a plausible-looking identifier is worse than leaving an obviously-bad one alone.
 *
 * DIVERGENCE FROM normalisePhone, stated precisely rather than generously: identical output for
 * 0-led and +-led inputs, which is every number a customer actually types. They differ on:
 *   '61419579975' -> here '+61419579975'  blanket '+6161419579975'  (blanket double-prefixes)
 *   '1234567878'  -> here null (store raw) blanket '+611234567878'  (blanket invents)
 * A row written by a still-blanket path matches a lookup through here for every realistic input.
 */
export function toE164AU(raw: string | null | undefined): string | null {
  if (!raw) return null
  const d = String(raw).replace(/[^\d+]/g, '').replace(/^\+/, '')
  if (!d) return null
  if (d.startsWith('61') && d.length === 11) return '+' + d           // 61 4xx xxx xxx | 61 x xxxx xxxx
  if (d.startsWith('0') && d.length === 10) return '+61' + d.slice(1) // 04xx xxx xxx
  if (d.length === 9 && /^[1-9]/.test(d)) return '+61' + d           // bare, leading 0 dropped
  return null                                                        // international or malformed
}

/**
 * Write/lookup convenience: canonical form when resolvable, otherwise the trimmed input unchanged.
 * Never null, so a caller can always still write or match on exactly what the user typed.
 */
export function normaliseCustomerPhone(raw: string | null | undefined): string {
  const trimmed = String(raw ?? '').trim()
  if (!trimmed) return ''
  return toE164AU(trimmed) ?? trimmed
}

/** True when the value is in canonical +61 E.164 form. For reporting, not for gating writes. */
export function isNormalisedAuPhone(value: string | null | undefined): boolean {
  return /^\+61[2-9]\d{8}$/.test(String(value ?? ''))
}
