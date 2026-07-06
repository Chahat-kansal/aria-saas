export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { resolveBusinessId } from '@/lib/aria/resolve-business'
import { SearchClient } from './SearchClient'

type Product = {
  id: string
  name: string
  description: string | null
  price: number
  image_url: string | null
  category: string | null
  is_available: boolean | null
}

export default async function SearchPage({ params }: { params: { slug: string } }) {
  const slug = decodeURIComponent(params.slug ?? '').toLowerCase()
  if (!slug) notFound()

  const bid = await resolveBusinessId(supabaseAdmin, slug)
  if (!bid) notFound()

  const { data: products } = await supabaseAdmin
    .from('pos_products')
    .select('id, name, description, price, image_url, category, is_available')
    .eq('business_id', bid)
    .order('category', { ascending: true })
    .order('name', { ascending: true })
    .limit(500)

  return (
    <SearchClient
      slug={slug}
      products={(products ?? []) as Product[]}
    />
  )
}