export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// WIRE-6 — PUBLIC storefront data by store_slug (canonical pos_online_settings). No auth: public
// read of the store's settings + its active menu (pos_products). Service role, but only returns
// non-sensitive store + menu fields, scoped to the one business the slug resolves to.
function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
}

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> | { slug: string } }) {
  const { slug } = 'then' in params ? await params : params
  const sb = adminClient()

  const { data: settings } = await sb.from('pos_online_settings')
    .select('business_id, enabled, store_name, store_slug, accept_orders, delivery_enabled, pickup_enabled, min_order_amount, delivery_fee, delivery_radius_km, prep_time_minutes, settings')
    .eq('store_slug', slug).maybeSingle()
  if (!settings || !settings.enabled) return NextResponse.json({ error: 'Store not found' }, { status: 404 })

  const [{ data: biz }, { data: products }] = await Promise.all([
    sb.from('businesses').select('name').eq('id', settings.business_id).maybeSingle(),
    sb.from('pos_products').select('id, name, price, category, image_url').eq('business_id', settings.business_id).eq('is_active', true).order('category').order('name').limit(200),
  ])

  return NextResponse.json({
    store: {
      business_id: settings.business_id,
      store_name: settings.store_name ?? biz?.name ?? 'Store',
      slug: settings.store_slug,
      accept_orders: settings.accept_orders,
      delivery_enabled: settings.delivery_enabled,
      pickup_enabled: settings.pickup_enabled,
      min_order_amount: Number(settings.min_order_amount ?? 0),
      delivery_fee: Number(settings.delivery_fee ?? 0),
      prep_time_minutes: settings.prep_time_minutes ?? null,
      theme: (settings.settings as { theme_color?: string } | null)?.theme_color ?? null,
    },
    products: products ?? [],
  })
}
