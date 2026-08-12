import { supabaseAdmin } from '@/lib/supabase-admin'

const SHORT_CODE_RE = /^\d{10}$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type ResolvedLoyaltyCustomer = {
  customerId: string
  identityId: string
  name: string | null
  pointsBalance: number
  stampsCount: number
  loyaltyTier: string | null
  visitCount: number
  totalSpent: number
}

export type ResolveCodeResult =
  | { found: true; customer: ResolvedLoyaltyCustomer }
  | { found: false; identityFound: boolean; reason: string }

// Single canonical resolver: accepts 10-digit short_code OR identity UUID.
// Resolves loyalty_identity → canonical pos_customers row for this business.
// Every POS/kiosk/CX surface must call this instead of building its own query.
export async function resolveCustomerCode(
  code: string,
  businessId: string,
): Promise<ResolveCodeResult> {
  const c = code.trim()
  const isShortCode = SHORT_CODE_RE.test(c)
  const isUUID = UUID_RE.test(c)

  if (!isShortCode && !isUUID) {
    return { found: false, identityFound: false, reason: 'invalid_code' }
  }

  const { data: identRow } = isShortCode
    ? await supabaseAdmin.from('loyalty_identity').select('id').eq('short_code', c).maybeSingle()
    : await supabaseAdmin.from('loyalty_identity').select('id').eq('id', c).maybeSingle()

  if (!identRow) return { found: false, identityFound: false, reason: 'identity_not_found' }

  const identityId = (identRow as { id: string }).id

  const { data: cust } = await supabaseAdmin
    .from('pos_customers')
    .select('id, name, points_balance, stamps_count, loyalty_tier, visit_count, total_spent')
    .eq('loyalty_identity_id', identityId)
    .eq('business_id', businessId)
    .is('deleted_at', null)
    // ARIA-ATTACH-CUSTOMER-1 — DETERMINISTIC ORDERING. A LATENT-BUG GUARD, NOT A FIX.
    //
    // TO BE CLEAR FOR ANYONE READING THIS LATER: there was no live defect here. Exactly one live
    // customer row exists per identity across the whole database, so this query has only ever had
    // one candidate. An earlier report claimed a scan could resolve non-deterministically across
    // three rows; that was wrong — it queried without the `deleted_at is null` filter applied two
    // lines above, and two of those three were soft-deleted by a merge on 8 July 2026.
    //
    // It is here because .limit(1) over a set with no total order is fragile REGARDLESS of whether
    // duplicates exist today. If one ever appears live, Postgres guarantees nothing about which row
    // comes back, and points would land on whichever it happened to return.
    //
    // WHY created_at ASC ALONE, and why points_balance was REMOVED from the sort: after
    // ARIA-LOYALTY-FIX-1 reconciled balances to the ledger, almost every balance is 0, so ordering
    // by it ties routinely and created_at was silently doing all the deciding anyway. A sort key
    // that is almost always tied is not a sort key — it is noise that hides which column actually
    // decides. Removing it makes the real rule visible.
    //
    // NOT visit_count or total_spent either: both move as a customer shops, so the canonical row
    // would change under you. Stability is the whole point. created_at never changes.
    .order('created_at', { ascending: true })
    // .limit(1) is REQUIRED, not decorative: PostgREST's maybeSingle() ERRORS on more than one
    // row rather than returning the first, so dropping it would turn a duplicate into a hard
    // failure at the till instead of a deterministic pick. (SEC-MGR-1 hit exactly this.)
    .limit(1)
    .maybeSingle()

  if (!cust) return { found: false, identityFound: true, reason: 'not_a_customer_here' }

  const r = cust as {
    id: string; name: string | null; points_balance: number | null
    stamps_count: number | null; loyalty_tier: string | null
    visit_count: number | null; total_spent: string | null
  }

  return {
    found: true,
    customer: {
      customerId: r.id,
      identityId,
      name: r.name,
      pointsBalance: Number(r.points_balance ?? 0),
      stampsCount: Number(r.stamps_count ?? 0),
      loyaltyTier: r.loyalty_tier,
      visitCount: Number(r.visit_count ?? 0),
      totalSpent: Number(r.total_spent ?? 0),
    },
  }
}