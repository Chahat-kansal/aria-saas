import { supabaseAdmin } from '@/lib/supabase-admin'

// LOYALTY-LOOP-2 — card-linked auto-earn. The payment card becomes the
// loyalty key. Zero PCI burden: only Stripe's card fingerprint
// (payment_method.card.fingerprint) is ever stored — never a PAN, never
// exposed to any client response. See supabase/migrations/
// 20260710000001_loyalty_card_links.sql (RLS admin-only, no client policies).

export interface LinkCardResult {
  linked: boolean
  isNewLink: boolean
}

/**
 * Upserts a card-fingerprint -> loyalty identity link, scoped per business.
 * Idempotent: re-linking the same card to the same identity is a no-op
 * (isNewLink:false). If the fingerprint is already linked to a DIFFERENT
 * identity, this does NOT reassign it — a card silently jumping between
 * identities would be a real privacy/correctness bug (e.g. a shared
 * business card, or someone else's card used once). The existing link
 * wins; call unlinkCard first (customer-initiated) to free it up.
 */
export async function linkCardToIdentity(params: {
  businessId: string
  identityId: string
  fingerprint: string
  brand: string | null
  last4: string | null
}): Promise<LinkCardResult> {
  const { businessId, identityId, fingerprint, brand, last4 } = params

  const { data: existing } = await supabaseAdmin
    .from('loyalty_card_links')
    .select('id, loyalty_identity_id')
    .eq('business_id', businessId)
    .eq('card_fingerprint', fingerprint)
    .maybeSingle()

  if (existing) {
    const alreadyLinkedToThisIdentity = (existing.loyalty_identity_id as string) === identityId
    return { linked: alreadyLinkedToThisIdentity, isNewLink: false }
  }

  const { error } = await supabaseAdmin.from('loyalty_card_links').insert({
    business_id: businessId,
    loyalty_identity_id: identityId,
    card_fingerprint: fingerprint,
    brand,
    last4,
  })

  if (error) {
    // Concurrent request already inserted the same (business_id, fingerprint) row.
    if (/duplicate|unique/i.test(error.message)) return { linked: true, isNewLink: false }
    throw new Error('[linkCardToIdentity] insert failed: ' + error.message)
  }

  return { linked: true, isNewLink: true }
}

/** Resolves a loyalty identity from a card fingerprint, business-scoped. Server-only. */
export async function resolveIdentityByCardFingerprint(params: {
  businessId: string
  fingerprint: string
}): Promise<{ identityId: string } | null> {
  const { data } = await supabaseAdmin
    .from('loyalty_card_links')
    .select('loyalty_identity_id')
    .eq('business_id', params.businessId)
    .eq('card_fingerprint', params.fingerprint)
    .maybeSingle()
  return data ? { identityId: data.loyalty_identity_id as string } : null
}

/** Customer-initiated unlink ONLY — ownership check baked into the query
 *  (identityId must match), so a customer can never unlink someone else's card. */
export async function unlinkCard(params: {
  businessId: string
  identityId: string
  linkId: string
}): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from('loyalty_card_links')
    .delete()
    .eq('id', params.linkId)
    .eq('business_id', params.businessId)
    .eq('loyalty_identity_id', params.identityId)
  return !error
}

export interface LinkedCard {
  id: string
  brand: string | null
  last4: string | null
  created_at: string
}

/** Never selects card_fingerprint — brand + last4 only, for display. */
export async function listLinkedCards(params: { businessId: string; identityId: string }): Promise<LinkedCard[]> {
  const { data } = await supabaseAdmin
    .from('loyalty_card_links')
    .select('id, brand, last4, created_at')
    .eq('business_id', params.businessId)
    .eq('loyalty_identity_id', params.identityId)
    .order('created_at', { ascending: false })
  return (data ?? []) as LinkedCard[]
}

/** One-time consent notice — Australian privacy: tell the customer their
 *  card is now linked, and where to manage/unlink it. Fires only on a
 *  genuinely NEW link (never re-shown on repeat payments with the same card). */
export async function sendCardLinkedNotice(params: { businessId: string; customerId: string }): Promise<void> {
  try {
    await supabaseAdmin.from('cx_notifications').insert({
      business_id: params.businessId,
      customer_id: params.customerId,
      type: 'system',
      title: 'Your card is now linked for rewards',
      body: 'Tap your card next time to earn points automatically — no need to sign in. Manage or unlink it anytime in Account.',
      action_url: null,
    })
  } catch { /* non-blocking — never let a notification failure break payment processing */ }
}

/** Queryable, high-frequency event log for the card-link attach-rate metric —
 *  NOT ariaObserve (that triggers a real LLM call per event; wrong fit for a
 *  per-transaction structural metric). action_type values:
 *  'loyalty_card_link_created' | 'loyalty_card_auto_attach'. */
export async function logCardLinkEvent(params: {
  businessId: string
  actionType: 'loyalty_card_link_created' | 'loyalty_card_auto_attach'
  description: string
  metadata: Record<string, unknown>
}): Promise<void> {
  try {
    await supabaseAdmin.from('activity_log').insert({
      business_id: params.businessId,
      action_type: params.actionType,
      description: params.description,
      metadata: params.metadata,
      created_at: new Date().toISOString(),
    })
  } catch { /* non-blocking */ }
}
