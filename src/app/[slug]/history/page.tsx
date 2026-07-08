export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { resolveBusinessId } from '@/lib/aria/resolve-business'
import { getCxSessionServer } from '@/lib/cx/get-cx-session'
import { resolveCxCustomer } from '@/lib/cx/resolve-cx-customer'
import { HistoryClient } from './HistoryClient'

export default async function HistoryPage({ params }: { params: { slug: string } }) {
  const slug = decodeURIComponent(params.slug ?? '').toLowerCase()
  if (!slug) notFound()

  const bid = await resolveBusinessId(supabaseAdmin, slug)
  if (!bid) notFound()

  const { data: biz } = await supabaseAdmin
    .from('businesses')
    .select('name')
    .eq('id', bid)
    .maybeSingle()
  if (!biz) notFound()

  const session = await getCxSessionServer(bid)

  let customerId: string | null = null
  let phone: string | null = null

  if (session) {
    phone = session.phone
    const customer = await resolveCxCustomer<{ id: string }>(session.identity_id, bid, 'id')
    customerId = customer?.id ?? null
  }

  return (
    <HistoryClient
      slug={slug}
      bizId={bid}
      bizName={(biz.name as string) ?? ''}
      initialCustomerId={customerId}
      initialPhone={phone}
    />
  )
}