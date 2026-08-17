// ARIA-LOYALTY-FIX-1 §1 — find-or-create a loyalty identity and link it to a POS customer.
//
// WHY THIS EXISTS: only /api/loyalty/auth (self sign-in) and the public enrol route ever created a
// loyalty_identity. /api/pos/customers created none — so a café that enrols people AT THE COUNTER,
// which is how cafés actually enrol people, built no loyalty base at all. 48 of Sip's 51 customers
// are unlinked.
//
// EXTRACTED, NOT DUPLICATED. This is the enrol route's own block (enrol:95-123) lifted verbatim in
// behaviour; that route now calls this instead of keeping its own copy. One implementation, so the
// till and the web cannot drift into minting two identities for the same person.
//
// loyalty_identity is GLOBAL, not per-business (LOY-NETWORK: one email/phone across every venue),
// which is why the lookups below carry no business filter. That is deliberate — do not add one.

/**
 * Structural, not SupabaseClient<...>: the admin client and the per-request server client carry
 * different generic parameters, and this helper only needs from().select/insert/update.
 *
 * Deliberately loose on the RETURN types. PostgREST hands back a thenable builder, not a Promise —
 * typing these as Promise makes SupabaseClient fail to satisfy the interface, and typing the full
 * generic chain trips TS2589 "type instantiation is excessively deep". Same trade-off, and the same
 * reason, as PinUpdatable in lib/pos/staff-pin.ts. The awaits below narrow the shape at the point
 * of use, which is where it actually matters.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type IdentityDb = { from: (table: string) => any }

type IdRow = { data: { id?: unknown } | null }

export type LinkOutcome =
  | { identityId: string; created: boolean; reason: 'linked' }
  // ARIA-LOYALTY-CLOSEOUT-1 §1 — the link was REJECTED by pos_customers_identity_uniq: another
  // live customer row in this business already holds this identity. heldByCustomerId is that row,
  // so the caller can use the customer who already exists rather than failing.
  | { identityId: string; created: boolean; reason: 'identity_taken'; heldByCustomerId: string | null }
  | { identityId: string | null; created: false; reason: 'no_contact' | 'failed' }

/** Postgres unique_violation. This is how pos_customers_identity_uniq reaches us through PostgREST. */
function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: unknown } | null
  return String(e?.code ?? '') === '23505'
}

/**
 * Which live customer row already holds this identity, in the same business as `customerId`?
 *
 * ORDERED IDENTICALLY TO resolve-code.ts (created_at ASC, limit 1) ON PURPOSE. The row named here
 * must be the same row a scan of this identity resolves to, or the caller would be pointed at a
 * customer the till then refuses to find. Both filter `deleted_at is null`, which is also the
 * index's own predicate — three places, one rule.
 *
 * Never throws: this runs on an error path that is already non-fatal, and a null holder is strictly
 * better than turning a handled rejection into an unhandled one.
 */
async function findIdentityHolder(
  db: IdentityDb,
  identityId: string,
  customerId: string,
): Promise<string | null> {
  try {
    // The index is scoped (business_id, loyalty_identity_id), so the colliding row is in THIS
    // customer's business. loyalty_identity itself is global; the customer rows hanging off it are
    // not, and a sibling venue's row is not a duplicate.
    const { data: self } = await db
      .from('pos_customers').select('business_id').eq('id', customerId).maybeSingle() as
      { data: { business_id?: unknown } | null }
    const businessId = self?.business_id ? String(self.business_id) : null
    if (!businessId) return null

    const { data } = await db
      .from('pos_customers')
      .select('id')
      .eq('business_id', businessId)
      .eq('loyalty_identity_id', identityId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle() as IdRow
    return data?.id ? String(data.id) : null
  } catch (e) {
    console.error('[link-identity] holder lookup failed:', (e as Error).message)
    return null
  }
}

/**
 * Find-or-create the identity for this email/phone and stamp it onto the customer row.
 *
 * NEVER THROWS. A cashier is mid-sale when this runs; a loyalty bookkeeping failure must never be
 * the reason a customer cannot be created. Every path returns an outcome and logs.
 *
 * IDEMPOTENT by construction: it looks before it inserts, and re-running for the same person finds
 * the existing identity rather than minting a second.
 *
 * NAME-ONLY CUSTOMERS: the till allows a record with neither phone nor email. There is nothing to
 * identify such a person by across venues, and loyalty_identity has no other natural key, so this
 * returns 'no_contact' and links nothing. That is correct rather than lazy — inventing a synthetic
 * key would make the row unmatchable later, when the same person finally gives a phone number.
 *
 * ARIA-LOYALTY-CLOSEOUT-1 §1 — THE UPDATE'S ERROR IS NOW READ.
 *
 * It used to be discarded entirely. Every failed link — including one rejected outright by
 * pos_customers_identity_uniq — was reported as {reason:'linked'} carrying a real identityId, which
 * is worse than a 500: the caller was told the link succeeded, nothing was logged, nothing
 * surfaced, and the customer stayed unlinked forever. Silence like that is not resilience; it is a
 * lost write with a success receipt.
 */
export async function linkLoyaltyIdentity(
  db: IdentityDb,
  input: { customerId: string; email?: string | null; phone?: string | null },
): Promise<LinkOutcome> {
  try {
    const email = typeof input.email === 'string' && input.email.trim() ? input.email.trim().toLowerCase() : ''
    const phone = typeof input.phone === 'string' && input.phone.trim() ? input.phone.trim() : ''
    if (!email && !phone) return { identityId: null, created: false, reason: 'no_contact' }

    let identityId: string | null = null

    if (email) {
      const { data } = await db.from('loyalty_identity').select('id').eq('email', email).maybeSingle() as IdRow
      if (data?.id) identityId = String(data.id)
    }
    if (!identityId && phone) {
      const { data } = await db.from('loyalty_identity').select('id').eq('phone', phone).maybeSingle() as IdRow
      if (data?.id) identityId = String(data.id)
    }

    let created = false
    if (!identityId) {
      const insert: Record<string, string> = {}
      if (email) insert.email = email
      if (phone) insert.phone = phone
      const { data } = await db.from('loyalty_identity').insert(insert).select('id').single() as IdRow
      if (data?.id) { identityId = String(data.id); created = true }
    }

    if (!identityId) return { identityId: null, created: false, reason: 'failed' }

    const { error: linkErr } = await db
      .from('pos_customers')
      .update({ loyalty_identity_id: identityId })
      .eq('id', input.customerId) as { error: unknown }

    if (linkErr) {
      if (isUniqueViolation(linkErr)) {
        // pos_customers_identity_uniq: (business_id, loyalty_identity_id) WHERE loyalty_identity_id
        // IS NOT NULL AND deleted_at IS NULL. The database is telling us this person already has a
        // live customer row in this business — a DUPLICATE CUSTOMER, not a link failure. Hand the
        // caller the row that already exists so it can use that customer instead.
        const heldByCustomerId = await findIdentityHolder(db, identityId, input.customerId)
        console.warn('[link-identity] identity already held by a live customer in this business:', {
          identityId, attemptedFor: input.customerId, heldByCustomerId,
        })
        return { identityId, created, reason: 'identity_taken', heldByCustomerId }
      }
      console.error('[link-identity] link update failed:', (linkErr as { message?: string })?.message ?? linkErr)
      return { identityId, created: false, reason: 'failed' }
    }

    return { identityId, created, reason: 'linked' }
  } catch (e) {
    console.error('[link-identity] non-fatal:', (e as Error).message)
    return { identityId: null, created: false, reason: 'failed' }
  }
}
