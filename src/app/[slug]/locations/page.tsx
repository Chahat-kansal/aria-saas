export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { resolveBusinessId } from '@/lib/aria/resolve-business'
import { LocationsClient } from './LocationsClient'

type Outlet = {
  id: string
  name: string | null
  address: string | null
  phone: string | null
  is_default: boolean | null
  is_active: boolean | null
  opening_hours: unknown
}

export default async function LocationsPage({ params }: { params: { slug: string } }) {
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

  const { data: outlets } = await supabaseAdmin
    .from('pos_outlets')
    .select('id, name, address, phone, is_default, is_active, opening_hours')
    .eq('business_id', bid)
    .eq('is_active', true)
    .order('is_default', { ascending: false })

  return (
    <LocationsClient
      slug={slug}
      bizId={bid}
      bizName={(biz.name as string) ?? ''}
      outlets={(outlets ?? []) as Outlet[]}
    />
  )
}