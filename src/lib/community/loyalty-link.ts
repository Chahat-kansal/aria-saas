import { supabaseAdmin } from '@/lib/supabase-admin'
import { getCxSessionServer } from '@/lib/cx/get-cx-session'
import { resolveCxCustomer } from '@/lib/cx/resolve-cx-customer'

// CX-GAME-LEAN — opportunistic bridge between a community_members identity (session-cookie,
// cross-business) and a business's pos_customers loyalty record. See the migration header for why
// this is needed: the two identity systems have no schema link today. Whenever a community request
// for business X is made by a visitor who ALSO carries a valid cx_session (loyalty) for X, the link
// is recorded here — once linked, it persists (no re-linking needed on future visits). No new UI: a
// visitor who never authenticates a CX session for this business simply never gets linked, which is
// indistinguishable from — and handled identically to — "not a loyalty member of this business."

export interface MemberCustomerLink {
  customerId: string
  loyaltyIdentityId: string
}

/** Resolve (and opportunistically create) the loyalty link for a community member + business.
 * Must be called from a Server Component or Route Handler (reads cookies via next/headers). */
export async function resolveMemberCustomerLink(memberId: string, businessId: string): Promise<MemberCustomerLink | null> {
  const { data: existing } = await supabaseAdmin
    .from('community_member_loyalty_links')
    .select('customer_id, loyalty_identity_id')
    .eq('member_id', memberId).eq('business_id', businessId).maybeSingle()
  if (existing) return { customerId: existing.customer_id as string, loyaltyIdentityId: existing.loyalty_identity_id as string }

  const session = await getCxSessionServer(businessId)
  if (!session) return null

  const customer = await resolveCxCustomer<{ id: string }>(session.identity_id, businessId, 'id')
  if (!customer) return null

  await supabaseAdmin.from('community_member_loyalty_links').insert({
    member_id: memberId, business_id: businessId,
    loyalty_identity_id: session.identity_id, customer_id: customer.id,
  }).then(() => {}, () => {}) // best-effort; a concurrent link attempt just hits the UNIQUE constraint

  return { customerId: customer.id, loyaltyIdentityId: session.identity_id }
}

/** Batch-resolve links for many members at once (comments list) — no per-comment cx_session lookup;
 * only reads already-established links. Opportunistic linking only happens on single-member resolution
 * (resolveMemberCustomerLink) where the viewer IS the member in question. */
export async function batchResolveMemberCustomerLinks(memberIds: string[], businessId: string): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  if (!memberIds.length) return map
  const { data } = await supabaseAdmin
    .from('community_member_loyalty_links')
    .select('member_id, customer_id')
    .eq('business_id', businessId).in('member_id', [...new Set(memberIds)])
  for (const r of data ?? []) map.set(r.member_id as string, r.customer_id as string)
  return map
}
