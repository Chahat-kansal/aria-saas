export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { resolveBusinessId } from '@/lib/aria/resolve-business'

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

export async function GET(_req: Request, { params }: { params: Promise<{ business_id: string }> | { business_id: string } }) {
  const { business_id: idOrSlug } = 'then' in params ? await params : params
  if (!idOrSlug) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  const sb = adminClient()
  const business_id = await resolveBusinessId(sb, idOrSlug)
  if (!business_id) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: biz } = await sb.from('businesses').select('id').eq('id', business_id).eq('is_active', true).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const [catsRes, productsRes] = await Promise.all([
    sb.from('pos_categories')
      .select('id, name, color')
      .eq('business_id', business_id)
      .order('name'),
    sb.from('pos_products')
      .select('id, name, description, price, image_url, sort_order, category_id')
      .eq('business_id', business_id)
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('name'),
  ])

  return NextResponse.json({
    categories: catsRes.data ?? [],
    products: productsRes.data ?? [],
  })
}
