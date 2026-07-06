import { redirect } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import MenuBuilderClient from './MenuBuilderClient'

type ItemOverride = { desc?: string; photo_url?: string; badge?: string; price_override?: number; hidden?: boolean }
type MenuCfg = {
  id?: string
  menu_key: string
  menu_label: string
  is_default: boolean
  active_from: string | null
  active_to: string | null
  days_of_week: number[] | null
  template_id: string
  brand_kit: Record<string, unknown>
  section_order: string[]
  item_overrides: Record<string, ItemOverride>
  background_id: string
  is_published: boolean
}
type Category = { id: string; name: string; color: string | null; is_active: boolean; sort_order: number; ordering_archetype: string | null }
type Product = { id: string; name: string; description: string | null; price: number; image_url: string | null; image_thumb_url: string | null; image_source: string | null; category_id: string | null; sort_order: number; display_order?: number | null; is_active: boolean; show_online: boolean; ordering_mode: string; ordering_archetype: string | null; builder_type: string | null; kds_station: string; prep_time_seconds: number | null; allergens: string[]; is_gluten_free: boolean; is_vegan: boolean; is_vegetarian: boolean; notes: string | null; tags: string[] }
type Outlet = { id: string; name: string }

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

  const [bizRes, configsRes, catsRes, productsRes, hoursRes, outletsRes] = await Promise.all([
    supabaseAdmin.from('businesses').select('name, slug, logo_url, suburb, city').eq('id', bid).maybeSingle(),
    supabaseAdmin
      .from('menu_configs')
      .select('*')
      .eq('business_id', bid)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true }),
    supabaseAdmin.from('pos_categories').select('id, name, color, is_active, sort_order, ordering_archetype').eq('business_id', bid).order('sort_order', { ascending: true }),
    supabaseAdmin.from('pos_products').select('id, name, description, price, image_url, image_thumb_url, image_source, category_id, sort_order, display_order, is_active, show_online, ordering_mode, ordering_archetype, builder_type, kds_station, prep_time_seconds, allergens, is_gluten_free, is_vegan, is_vegetarian, notes, tags').eq('business_id', bid).is('deleted_at', null).order('sort_order', { ascending: true }),
    supabaseAdmin.from('business_hours').select('day_of_week, open_time, close_time, is_closed').eq('business_id', bid),
    supabaseAdmin.from('pos_outlets').select('id, name').eq('business_id', bid).eq('is_active', true),
  ])

  const biz = bizRes.data
  if (!biz) redirect('/pos/setup/welcome')

  const suburb = (biz.suburb as string | null | undefined) ?? null
  const city   = (biz.city   as string | null | undefined) ?? null
  const locationSubtitle = [suburb, city].filter(Boolean).join(', ') || null

  type HoursRow = { day_of_week: number; open_time: string | null; close_time: string | null; is_closed: boolean | null }
  const hoursRows: HoursRow[] = (hoursRes.data ?? []) as HoursRow[]
  const nowSyd = new Date(new Date().toLocaleString('en-US', { timeZone: 'Australia/Sydney' }))
  const dow = nowSyd.getDay()
  const nowMin = nowSyd.getHours() * 60 + nowSyd.getMinutes()
  const todayHours = hoursRows.find(h => h.day_of_week === dow && !h.is_closed && h.open_time && h.close_time)
  let isOpenNow = false
  let closesAt: string | null = null
  if (todayHours && todayHours.open_time && todayHours.close_time) {
    const [oh, om] = todayHours.open_time.split(':').map(Number)
    const [ch, cm] = todayHours.close_time.split(':').map(Number)
    if (nowMin >= oh * 60 + om && nowMin < ch * 60 + cm) {
      isOpenNow = true
      closesAt = todayHours.close_time
    }
  }

  const slug = (biz.slug as string | null) ?? bid
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.ariaos.site'
  const menuUrl = appUrl + '/menu/' + slug

  let configs: MenuCfg[] = (configsRes.data ?? []) as MenuCfg[]

  // Seed the first menu if none exist
  if (configs.length === 0) {
    const { data: seeded } = await supabaseAdmin
      .from('menu_configs')
      .insert({
        business_id: bid,
        menu_key: 'main',
        menu_label: 'Main Menu',
        is_default: true,
        template_id: 'editorial',
        is_published: false,
      })
      .select()
      .maybeSingle()
    configs = seeded ? [seeded as MenuCfg] : []
  }

  const safeConfigs: MenuCfg[] = configs.map(c => ({
    ...c,
    menu_key: (c.menu_key as string | null) ?? 'main',
    menu_label: (c.menu_label as string | null) ?? 'Main Menu',
    is_default: (c.is_default as boolean | null) ?? false,
    active_from: (c.active_from as string | null) ?? null,
    active_to: (c.active_to as string | null) ?? null,
    days_of_week: (c.days_of_week as number[] | null) ?? null,
    brand_kit: (c.brand_kit as Record<string, unknown>) ?? {},
    section_order: (c.section_order as string[]) ?? [],
    item_overrides: (c.item_overrides as Record<string, ItemOverride>) ?? {},
    background_id: (c.background_id as string | null) ?? 'none',
  }))

  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,400;0,700;1,400;1,700&family=Space+Grotesk:wght@400;600;700&family=Cormorant:ital,wght@0,400;1,400;1,700&family=Playfair+Display:wght@400;700&family=Outfit:wght@400;500;600;700&display=swap"
      />
      <MenuBuilderClient
        businessId={bid}
        slug={slug}
        businessName={(biz.name as string | null) ?? 'My Business'}
        logoUrl={(biz.logo_url as string | null) ?? null}
        menuUrl={menuUrl}
        initialConfigs={safeConfigs}
        initialCats={(catsRes.data ?? []) as Category[]}
        initialProducts={(productsRes.data ?? []) as Product[]}
        initialOutlets={(outletsRes.data ?? []) as Outlet[]}
        locationSubtitle={locationSubtitle}
        isOpenNow={isOpenNow}
        closesAt={closesAt}
      />
    </>
  )
}
