export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { WalletClient } from './WalletClient'
import { resolveBusinessId } from '@/lib/aria/resolve-business'
import { getCxSessionServer } from '@/lib/cx/get-cx-session'

export default async function WalletPage({ params }: { params: { slug: string } }) {
  const slug = decodeURIComponent(params.slug ?? '').toLowerCase()
  if (!slug) notFound()

  const bid = await resolveBusinessId(supabaseAdmin, slug)
  if (!bid) notFound()

  const { data: biz } = await supabaseAdmin
    .from('businesses')
    .select('id, name, slug, logo_url, community_cover_url')
    .eq('id', bid)
    .maybeSingle()
  if (!biz) notFound()

  const session = await getCxSessionServer(bid)

  let customerId: string | null = null
  let customerName: string | null = null
  let tier: string = 'Member'
  let walletBal: number = 0
  let identityId: string | null = null
  let earnTxns: Array<{ id: string; type: string; points_delta: number; reward_redeemed: string | null; created_at: string }> = []
  let preloadTxns: Array<{ id: string; amount: number; type: string; description: string | null; created_at: string }> = []

  if (session) {
    const { data: customer } = await supabaseAdmin
      .from('pos_customers')
      .select('id, name, loyalty_tier, loyalty_identity_id')
      .eq('business_id', bid)
      .eq('loyalty_identity_id', session.identity_id)
      .is('deleted_at', null)
      .maybeSingle()

    if (customer) {
      const cust = customer as { id: string; name: string | null; loyalty_tier: string | null; loyalty_identity_id: string | null }
      customerId   = cust.id
      customerName = cust.name ?? null
      tier         = cust.loyalty_tier ?? 'Member'
      identityId   = cust.loyalty_identity_id ?? null

      const [walletRes, earnRes, preloadRes] = await Promise.all([
        supabaseAdmin
          .from('loyalty_preload_accounts')
          .select('balance, currency')
          .eq('business_id', bid)
          .eq('customer_id', customerId)
          .maybeSingle(),
        supabaseAdmin
          .from('pos_loyalty_transactions')
          .select('id, type, points_delta, reward_redeemed, created_at')
          .eq('business_id', bid)
          .eq('customer_id', customerId)
          .order('created_at', { ascending: false })
          .limit(10),
        supabaseAdmin
          .from('loyalty_preload_ledger')
          .select('id, amount, type, description, created_at')
          .eq('business_id', bid)
          .eq('customer_id', customerId)
          .order('created_at', { ascending: false })
          .limit(10),
      ])

      walletBal    = Number((walletRes.data as { balance?: number | null } | null)?.balance ?? 0)
      earnTxns     = (earnRes.data ?? []) as typeof earnTxns
      preloadTxns  = (preloadRes.data ?? []) as typeof preloadTxns
    }
  }

  // TOP-UP GATE: only pass topUpUrl when signed in
  const topUpUrl = session && customerId ? '/loyalty/' + bid + '#topup' : null

  return (
    <WalletClient
      slug={slug}
      bizName={(biz.name as string) ?? ''}
      heroImageUrl={(biz.community_cover_url as string | null) ?? null}
      isSignedIn={!!session}
      customerId={customerId}
      name={customerName}
      tier={tier}
      walletBal={walletBal}
      identityId={identityId}
      earnTxns={earnTxns}
      preloadTxns={preloadTxns}
      topUpUrl={topUpUrl}
    />
  )
}