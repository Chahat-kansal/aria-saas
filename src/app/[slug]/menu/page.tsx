export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { CxMenuClient, type CxCategory, type CxProduct } from './CxMenuClient'
import { resolveBusinessId } from '@/lib/aria/resolve-business'

export default async function CxMenuPage({ params }: { params: { slug: string } }) {
  const slug = decodeURIComponent(params.slug ?? '').toLowerCase()
  if (!slug) notFound()

  const bid = await resolveBusinessId(supabaseAdmin, slug)
  if (!bid) notFound()

  const { data: biz } = await supabaseAdmin
    .from('businesses')
    .select('id, name, slug, logo_url')
    .eq('id', bid)
    .maybeSingle()
  if (!biz) notFound()

  const [catsRes, prodsRes] = await Promise.all([
    supabaseAdmin
      .from('pos_categories')
      .select('id, name, sort_order')
      .eq('business_id', bid)
      .eq('is_active', true)
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('name')
      .limit(20),
    supabaseAdmin
      .from('pos_products')
      .select('id, name, description, price, image_url, category_id, featured, sort_order')
      .eq('business_id', bid)
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('featured', { ascending: false, nullsFirst: false })
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('name')
      .limit(50),
  ])

  const categories: CxCategory[] = (catsRes.data ?? []) as CxCategory[]
  const products: CxProduct[] = (prodsRes.data ?? []) as CxProduct[]

  return (
    <CxMenuClient
      slug={slug}
      bizName={(biz.name as string) ?? ''}
      logoUrl={(biz.logo_url as string | null) ?? null}
      categories={categories}
      products={products}
    />
  )
}