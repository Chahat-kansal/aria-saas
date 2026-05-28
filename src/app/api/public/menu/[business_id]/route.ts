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

export async function GET(_req: Request, { params }: { params: { business_id: string } }) {
  const idOrSlug = params.business_id
  if (!idOrSlug) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  const sb = adminClient()
  const business_id = await resolveBusinessId(sb, idOrSlug)
  if (!business_id) return NextResponse.json({ error: 'Business not found or not accepting orders' }, { status: 404 })

  const [bizRes, productsRes] = await Promise.all([
    sb.from('businesses').select('id, name, industry, address, phone').eq('id', business_id).eq('is_active', true).maybeSingle(),
    sb.from('pos_products')
      .select('id, name, description, price, image_url, pos_categories(id, name, color)')
      .eq('business_id', business_id)
      .eq('is_active', true)
      .gt('price', 0)
      .order('name'),
  ])

  if (!bizRes.data) return NextResponse.json({ error: 'Business not found or not accepting orders' }, { status: 404 })

  return NextResponse.json({
    business: bizRes.data,
    products: productsRes.data ?? [],
  })
}
