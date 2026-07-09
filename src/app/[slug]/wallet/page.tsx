export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { WalletClient } from './WalletClient'
import { resolveBusinessId } from '@/lib/aria/resolve-business'
import { getCxSessionServer } from '@/lib/cx/get-cx-session'
import { resolveCxCustomer } from '@/lib/cx/resolve-cx-customer'

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
  let earnTxns: Array<{ id: string; type: string; points_delta: number; reward_redeemed: string | null; item_name?: string | null; created_at: string }> = []
  let preloadTxns: Array<{ id: string; amount: number; type: string; description: string | null; created_at: string }> = []

  if (session) {
    const customer = await resolveCxCustomer<{
      id: string; name: string | null; loyalty_tier: string | null; loyalty_identity_id: string | null
    }>(session.identity_id, bid, 'id, name, loyalty_tier, loyalty_identity_id')

    if (customer) {
      customerId   = customer.id
      customerName = customer.name ?? null
      tier         = customer.loyalty_tier ?? 'Member'

      // Fetch short_code from loyalty_identity for barcode — falls back to UUID if not yet set
      const { data: identRow } = await supabaseAdmin
        .from('loyalty_identity')
        .select('short_code')
        .eq('id', session.identity_id)
        .maybeSingle()
      const shortCode = (identRow as { short_code?: string | null } | null)?.short_code ?? null
      identityId = shortCode ?? customer.loyalty_identity_id ?? null

      const [walletRes, earnRes, preloadRes] = await Promise.all([
        supabaseAdmin
          .from('loyalty_preload_accounts')
          .select('balance, currency')
          .eq('business_id', bid)
          .eq('customer_id', customerId)
          .maybeSingle(),
        supabaseAdmin
          .from('pos_loyalty_transactions')
          .select('id, type, points_delta, reward_redeemed, sale_id, created_at')
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

      walletBal   = Number((walletRes.data as { balance?: number | null } | null)?.balance ?? 0)
      preloadTxns = (preloadRes.data ?? []) as typeof preloadTxns

      // Enrich earn transactions with the top item from the linked sale
      const rawEarn = (earnRes.data ?? []) as Array<{ id: string; type: string; points_delta: number; reward_redeemed: string | null; sale_id?: string | null; created_at: string }>
      const saleIds = rawEarn.map(t => t.sale_id).filter((s): s is string => !!s)
      const saleItemMap: Record<string, string> = {}
      if (saleIds.length > 0) {
        const { data: items } = await supabaseAdmin
          .from('pos_sale_items')
          .select('sale_id, product_name')
          .in('sale_id', saleIds)
          .order('line_total', { ascending: false })
        for (const item of (items ?? []) as Array<{ sale_id: string | null; product_name: string | null }>) {
          if (item.sale_id && item.product_name && !saleItemMap[item.sale_id]) {
            saleItemMap[item.sale_id] = item.product_name
          }
        }
      }
      earnTxns = rawEarn.map(t => ({
        ...t,
        item_name: t.sale_id ? (saleItemMap[t.sale_id] ?? null) : null,
      }))
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