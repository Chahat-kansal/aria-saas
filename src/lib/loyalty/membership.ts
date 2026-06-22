import { supabaseAdmin } from '@/lib/supabase-admin'
import { encryptCustomerPII, decryptCustomerPII } from '@/lib/aria/customer-pii'
import { normalisePhone } from '@/lib/clicksend'

// LOY-PHONE — an identity may be keyed by email and/or phone; a membership matches/creates by whichever
// identifier is present (email preferred, else phone).
export interface MembershipIdentifier { email?: string | null; phone?: string | null }

// LOY-NETWORK — membership helpers. A "membership" is a pos_customers row (per business) linked to a
// global loyalty_identity. Points/tier/stamps live on this row, scoped per business.

// LOY-MEMBER-PRICING — if this business runs member pricing (a "Members" group exists), put the member
// into that group so the existing checkout discount engine gives them the member price. Never clobbers
// an already-assigned group.
async function assignMembersGroup(customerId: string, businessId: string): Promise<void> {
  const { data: grp } = await supabaseAdmin.from('pos_customer_groups')
    .select('id').eq('business_id', businessId).eq('name', 'Members').maybeSingle()
  if (!grp?.id) return
  await supabaseAdmin.from('pos_customers')
    .update({ customer_group_id: grp.id }).eq('id', customerId).is('customer_group_id', null)
}

export async function membershipName(customerId: string, businessId: string): Promise<string | null> {
  const { data } = await supabaseAdmin.from('pos_customers').select('id, name, name_enc').eq('id', customerId).maybeSingle()
  if (!data) return null
  try { return decryptCustomerPII(data as Record<string, unknown>, businessId).name ?? ((data.name as string) ?? null) } catch { return (data.name as string) ?? null }
}

/**
 * Link this identity's membership at a business: if a pos_customers row already exists for the
 * email+business (e.g. cashier pre-created it), link it; else create one. Never duplicates.
 * Scoped by lowercased email within the business.
 */
export async function linkOrCreateMembership(
  identityId: string, businessId: string, idf: MembershipIdentifier, providedName?: string,
): Promise<{ customer_id: string; name: string | null }> {
  const email = (idf.email ?? '').trim().toLowerCase()
  const phone = idf.phone ? normalisePhone(idf.phone) : ''

  // Match an existing membership by the available identifier (email preferred, else phone). Never dup.
  let existing: { id: string; name: string | null } | null = null
  if (email) {
    const { data } = await supabaseAdmin.from('pos_customers').select('id, name').eq('business_id', businessId).ilike('email', email).maybeSingle()
    existing = (data as { id: string; name: string | null } | null) ?? null
  }
  if (!existing && phone) {
    const { data } = await supabaseAdmin.from('pos_customers').select('id, name').eq('business_id', businessId).eq('phone', phone).maybeSingle()
    existing = (data as { id: string; name: string | null } | null) ?? null
  }

  if (existing) {
    const patch: Record<string, unknown> = { loyalty_identity_id: identityId }
    if (providedName && providedName.trim() && !existing.name) {
      const nm = providedName.trim().slice(0, 80)
      Object.assign(patch, { name: nm, ...encryptCustomerPII({ name: nm }, businessId) })
    }
    await supabaseAdmin.from('pos_customers').update(patch).eq('id', existing.id)
    await assignMembersGroup(existing.id, businessId)
    return { customer_id: existing.id, name: await membershipName(existing.id, businessId) }
  }

  // Derive a name (pos_customers.name is NOT NULL): provided → another membership's name → email local → 'Member'.
  let displayName = (providedName ?? '').trim()
  if (!displayName) {
    const { data: other } = await supabaseAdmin.from('pos_customers')
      .select('id, business_id').eq('loyalty_identity_id', identityId).limit(1).maybeSingle()
    if (other) displayName = (await membershipName(other.id as string, other.business_id as string)) ?? ''
  }
  if (!displayName) displayName = (email ? email.split('@')[0] : '') || 'Member'
  displayName = displayName.slice(0, 80)

  const pii: Record<string, string | null> = { name: displayName }
  if (email) pii.email = email
  if (phone) pii.phone = phone

  const { data: created } = await supabaseAdmin.from('pos_customers').insert({
    business_id: businessId, name: displayName, loyalty_identity_id: identityId,
    email: email || null, phone: phone || null,
    ...encryptCustomerPII(pii, businessId),
    marketing_consent: true, email_consent: !!email, sms_consent: !!phone, consent_captured_at: new Date().toISOString(),
    consent_source: 'online', source: 'loyalty_network',
    points_balance: 0, stamps_count: 0, loyalty_points: 0,
  }).select('id').single()
  await assignMembersGroup(created!.id as string, businessId)
  return { customer_id: created!.id as string, name: displayName }
}
