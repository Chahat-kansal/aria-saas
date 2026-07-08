export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { notFound, redirect } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { resolveBusinessId } from '@/lib/aria/resolve-business'
import { getCxSessionServer } from '@/lib/cx/get-cx-session'
import { resolveCxCustomer } from '@/lib/cx/resolve-cx-customer'
import { AccountClient } from './AccountClient'

export default async function AccountPage({ params }: { params: { slug: string } }) {
  const slug = decodeURIComponent(params.slug ?? '').toLowerCase()
  if (!slug) notFound()

  const bid = await resolveBusinessId(supabaseAdmin, slug)
  if (!bid) notFound()

  const { data: biz } = await supabaseAdmin
    .from('businesses')
    .select('name, logo_url')
    .eq('id', bid)
    .maybeSingle()
  if (!biz) notFound()

  const session = await getCxSessionServer(bid)
  if (!session) redirect('/' + slug + '/onboarding')

  type CustomerRow = {
    id: string; name: string | null; email: string | null; phone: string | null
    points_balance: number | null; loyalty_tier: string | null
    visit_count: number | null; stamps_count: number | null; total_spent: string | null
    last_visit_at: string | null
  }

  const [customer, identityRes] = await Promise.all([
    resolveCxCustomer<CustomerRow>(
      session.identity_id, bid,
      'id, name, email, phone, points_balance, loyalty_tier, visit_count, stamps_count, total_spent, last_visit_at',
    ),
    supabaseAdmin
      .from('loyalty_identity')
      .select('created_at')
      .eq('id', session.identity_id)
      .maybeSingle(),
  ])

  return (
    <AccountClient
      slug={slug}
      bizId={bid}
      bizName={(biz.name as string) ?? ''}
      logoUrl={(biz.logo_url as string | null) ?? null}
      customerId={customer?.id ?? null}
      name={customer?.name ?? null}
      email={customer?.email ?? null}
      phone={customer?.phone ?? session.phone ?? null}
      memberSince={(identityRes.data as { created_at?: string | null } | null)?.created_at ?? null}
      pointsBalance={Number(customer?.points_balance) || 0}
      loyaltyTier={customer?.loyalty_tier ?? null}
      visitCount={Number(customer?.visit_count) || 0}
      totalSpent={(Number(customer?.total_spent) || 0).toFixed(2)}
      lastVisitAt={customer?.last_visit_at ?? null}
    />
  )
}