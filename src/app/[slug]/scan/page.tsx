export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { notFound, redirect } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { resolveBusinessId } from '@/lib/aria/resolve-business'
import { getCxSessionServer } from '@/lib/cx/get-cx-session'
import { resolveCxCustomer } from '@/lib/cx/resolve-cx-customer'
import { ScanClient } from './ScanClient'
import type { MeData } from './ScanClient'

export default async function ScanPage({ params }: { params: { slug: string } }) {
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

  const customer = await resolveCxCustomer<{
    id: string; name: string | null; loyalty_tier: string | null; points_balance: number | null
  }>(session.identity_id, bid, 'id, name, loyalty_tier, points_balance')

  const { data: identRow } = await supabaseAdmin
    .from('loyalty_identity')
    .select('short_code')
    .eq('id', session.identity_id)
    .maybeSingle()
  const shortCode = (identRow as { short_code?: string | null } | null)?.short_code ?? null

  const me: MeData = {
    found: !!customer,
    customer_id: customer?.id,
    name: customer?.name ?? undefined,
    short_code: shortCode,
    loyalty_identity_id: session.identity_id,
    points_balance: Number(customer?.points_balance ?? 0),
    loyalty_tier: customer?.loyalty_tier ?? undefined,
  }

  return (
    <ScanClient
      slug={slug}
      bizId={bid}
      bizName={(biz.name as string) ?? ''}
      logoUrl={(biz.logo_url as string | null) ?? null}
      me={me}
    />
  )
}