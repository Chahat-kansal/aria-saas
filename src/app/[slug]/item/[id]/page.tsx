export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { resolveBusinessId } from '@/lib/aria/resolve-business'
import { ItemDetailClient } from './ItemDetailClient'

type Product = {
  id: string
  name: string
  description: string | null
  price: number
  image_url: string | null
  category: string | null
  is_available: boolean | null
  dietary_tags: unknown
  allergen_info: unknown
}

export default async function ItemDetailPage({ params }: { params: { slug: string; id: string } }) {
  const slug = decodeURIComponent(params.slug ?? '').toLowerCase()
  const id = params.id ?? ''
  if (!slug || !id) notFound()

  const bid = await resolveBusinessId(supabaseAdmin, slug)
  if (!bid) notFound()

  const { data: product } = await supabaseAdmin
    .from('pos_products')
    .select('id, name, description, price, image_url, category, is_available, dietary_tags, allergen_info')
    .eq('id', id)
    .eq('business_id', bid)
    .maybeSingle()

  if (!product) notFound()

  return (
    <ItemDetailClient
      slug={slug}
      product={product as Product}
    />
  )
}