import { supabaseAdmin } from '@/lib/supabase-admin'
import { encryptCustomerPII, decryptCustomerPII } from '@/lib/aria/customer-pii'

// LOY-NETWORK — membership helpers. A "membership" is a pos_customers row (per business) linked to a
// global loyalty_identity. Points/tier/stamps live on this row, scoped per business.

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
  identityId: string, businessId: string, email: string, providedName?: string,
): Promise<{ customer_id: string; name: string | null }> {
  const { data: existing } = await supabaseAdmin.from('pos_customers')
    .select('id, name').eq('business_id', businessId).ilike('email', email).maybeSingle()

  if (existing) {
    const patch: Record<string, unknown> = { loyalty_identity_id: identityId }
    if (providedName && providedName.trim() && !existing.name) {
      const nm = providedName.trim().slice(0, 80)
      Object.assign(patch, { name: nm, ...encryptCustomerPII({ name: nm }, businessId) })
    }
    await supabaseAdmin.from('pos_customers').update(patch).eq('id', existing.id)
    return { customer_id: existing.id as string, name: await membershipName(existing.id as string, businessId) }
  }

  // Derive a name (pos_customers.name is NOT NULL): provided → another membership's name → email local part.
  let displayName = (providedName ?? '').trim()
  if (!displayName) {
    const { data: other } = await supabaseAdmin.from('pos_customers')
      .select('id, business_id').eq('loyalty_identity_id', identityId).limit(1).maybeSingle()
    if (other) displayName = (await membershipName(other.id as string, other.business_id as string)) ?? ''
  }
  if (!displayName) displayName = email.split('@')[0] || 'Member'
  displayName = displayName.slice(0, 80)

  const { data: created } = await supabaseAdmin.from('pos_customers').insert({
    business_id: businessId, name: displayName, email, loyalty_identity_id: identityId,
    ...encryptCustomerPII({ name: displayName, email }, businessId),
    marketing_consent: true, email_consent: true, consent_captured_at: new Date().toISOString(),
    consent_source: 'online', source: 'loyalty_network',
    points_balance: 0, stamps_count: 0, loyalty_points: 0,
  }).select('id').single()
  return { customer_id: created!.id as string, name: displayName }
}
