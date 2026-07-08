export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { resolveBusinessId } from '@/lib/aria/resolve-business'
import { getCxSessionServer } from '@/lib/cx/get-cx-session'
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
    const { data: customer } = await supabaseAdmin
      .from('pos_customers')
      .select('id')
      .eq('business_id', bid)
      .eq('loyalty_identity_id', session.identity_id)
      .is('deleted_at', null)
      .maybeSingle()
    customerId = (customer as { id?: string } | null)?.id ?? null
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