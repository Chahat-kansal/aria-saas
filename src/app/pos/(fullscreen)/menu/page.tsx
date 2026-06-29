import { redirect } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import MenuBuilderClient from './MenuBuilderClient'

type ItemOverride = { desc?: string; photo_url?: string; badge?: string; price_override?: number; hidden?: boolean }
type MenuCfg = {
  id?: string
  template_id: string
  brand_kit: Record<string, unknown>
  section_order: string[]
  item_overrides: Record<string, ItemOverride>
  background_id: string
  is_published: boolean
}
type Category = { id: string; name: string; color: string | null }
type Product = { id: string; name: string; description: string | null; price: number; image_url: string | null; category_id: string | null; sort_order: number | null }

export const metadata = { title: 'Menu Builder — Aria' }

export default async function MenuBuilderPage() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: active } = await supabase
    .from('user_active_business')
    .select('business_id')
    .eq('user_id', user.id)
    .maybeSingle()
  let bid: string | null = (active?.business_id as string | null) ?? null

  if (!bid) {
    const { data: biz } = await supabase
      .from('businesses')
      .select('id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    bid = (biz?.id as string | null) ?? null
  }
  if (!bid) redirect('/pos/setup/welcome')

  const [bizRes, configRes, catsRes, productsRes] = await Promise.all([
    supabaseAdmin.from('businesses').select('name, slug, logo_url').eq('id', bid).maybeSingle(),
    supabaseAdmin.from('menu_configs').select('*').eq('business_id', bid).maybeSingle(),
    supabaseAdmin.from('pos_categories').select('id, name, color').eq('business_id', bid).eq('is_active', true).order('sort_order', { ascending: true }),
    supabaseAdmin.from('pos_products').select('id, name, description, price, image_url, category_id, sort_order').eq('business_id', bid).eq('is_active', true).is('deleted_at', null).order('sort_order', { ascending: true }),
  ])

  const biz = bizRes.data
  if (!biz) redirect('/pos/setup/welcome')

  const slug = (biz.slug as string | null) ?? bid
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.ariaos.site'
  const menuUrl = appUrl + '/menu/' + slug

  let config: MenuCfg = configRes.data as MenuCfg
  if (!config) {
    const { data: seeded } = await supabaseAdmin
      .from('menu_configs')
      .insert({ business_id: bid, template_id: 'editorial', is_published: false })
      .select()
      .maybeSingle()
    config = (seeded as MenuCfg) ?? { template_id: 'editorial', brand_kit: {}, section_order: [], item_overrides: {}, background_id: 'none', is_published: false }
  }

  const safeConfig: MenuCfg = {
    ...config,
    brand_kit: (config.brand_kit as Record<string, unknown>) ?? {},
    section_order: (config.section_order as string[]) ?? [],
    item_overrides: (config.item_overrides as Record<string, ItemOverride>) ?? {},
    background_id: (config.background_id as string | null) ?? 'none',
  }

  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,400;0,700;1,400;1,700&family=Space+Grotesk:wght@400;600;700&family=Cormorant:ital,wght@0,400;1,400;1,700&family=Playfair+Display:wght@400;700&display=swap"
      />
      <MenuBuilderClient
        businessId={bid}
        slug={slug}
        businessName={(biz.name as string | null) ?? 'My Business'}
        logoUrl={(biz.logo_url as string | null) ?? null}
        menuUrl={menuUrl}
        initialConfig={safeConfig}
        initialCats={(catsRes.data ?? []) as Category[]}
        initialProducts={(productsRes.data ?? []) as Product[]}
      />
    </>
  )
}
