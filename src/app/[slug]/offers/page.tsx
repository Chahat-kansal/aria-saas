export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { resolveBusinessId } from '@/lib/aria/resolve-business'
import { OffersClient } from './OffersClient'

type Offer = {
  id: string
  title: string
  description: string | null
  image_url: string | null
  offer_type: string | null
  point_cost: number | null
  starts_at: string | null
  ends_at: string | null
}

export default async function OffersPage({ params }: { params: { slug: string } }) {
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

  const now = new Date().toISOString()
  const { data: offers } = await supabaseAdmin
    .from('loyalty_offers')
    .select('id, title, description, image_url, offer_type, point_cost, starts_at, ends_at')
    .eq('business_id', bid)
    .eq('active', true)
    .or('starts_at.is.null,starts_at.lte.' + now)
    .or('ends_at.is.null,ends_at.gte.' + now)
    .order('created_at', { ascending: false })
    .limit(50)

  return (
    <OffersClient
      slug={slug}
      bizName={(biz.name as string) ?? ''}
      offers={(offers ?? []) as Offer[]}
    />
  )
}