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
 * ARIA-PHONE-NORMALISE-1 — normalisePhone NOW DELEGATES TO toE164AU. One algorithm, one behaviour.
 *
 * WHAT CHANGED AND WHY: this used to blanket-prefix '+61' onto anything that was not '+' or '0'-led,
 * INCLUDING strings that are not phone numbers. `234567u8io` became `+61234567u8io`; `1234567878`
 * became `+611234567878`. Values that look canonical, are not, and were then matched against as
 * though they were — which is how the same person becomes two identities, and how an SMS is
 * "delivered" to a number that cannot exist.
 *
 * It now returns NULL for anything unresolvable. An absent number is honest; a fabricated one is a
 * wrong match waiting to happen and it silently breaks SMS.
 *
 * ⚠ THE RETURN TYPE CHANGED from `string` to `string | null`. That is deliberate and load-bearing:
 * it makes the compiler enumerate every caller rather than leaving the null case to be discovered
 * in production. The name is kept so no import breaks.
 *
 * SMS IMPACT, measured rather than assumed: no stored value in pos_customers, loyalty_identity,
 * cx_otp_codes, sms_suppression, pos_online_orders, pos_sales or bookings has the fabricated
 * '+61'+garbage shape — every junk value on record is the RAW string as typed. So nothing that was
 * ever deliverable becomes undeliverable here. What changes is that a send to a junk number is now
 * refused locally instead of being handed to ClickSend to reject.
 */
export function normalisePhone(to: string | null | undefined): string | null {
  return toE164AU(to)
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
