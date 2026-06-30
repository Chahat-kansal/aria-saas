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

  const [bizRes, configsRes, catsRes, productsRes, hoursRes] = await Promise.all([
    supabaseAdmin.from('businesses').select('name, slug, logo_url, suburb, city').eq('id', bid).maybeSingle(),
    supabaseAdmin
      .from('menu_configs')
      .select('*')
      .eq('business_id', bid)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true }),
    supabaseAdmin.from('pos_categories').select('id, name, color').eq('business_id', bid).eq('is_active', true).order('sort_order', { ascending: true }),
    supabaseAdmin.from('pos_products').select('id, name, description, price, image_url, category_id, sort_order').eq('business_id', bid).eq('is_active', true).is('deleted_at', null).order('sort_order', { ascending: true }),
    supabaseAdmin.from('business_hours').select('day_of_week, open_time, close_time, is_closed').eq('business_id', bid),
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
        href="https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,400;0,700;1,400;1,700&family=Space+Grotesk:wght@400;600;700&family=Cormorant:ital,wght@0,400;1,400;1,700&family=Playfair+Display:wght@400;700&display=swap"
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
        locationSubtitle={locationSubtitle}
        isOpenNow={isOpenNow}
        closesAt={closesAt}
      />
    </>
  )
}
