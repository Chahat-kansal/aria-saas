import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { resolveBusinessId } from '@/lib/aria/resolve-business'
import MenuClient from '../MenuClient'

type ItemOverride = { desc?: string; photo_url?: string; badge?: string; price_override?: number; hidden?: boolean }

type Props = { params: Promise<{ slug: string; menu_key: string }> | { slug: string; menu_key: string } }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, menu_key } = 'then' in params ? await params : params
  try {
    const bid = await resolveBusinessId(supabaseAdmin, slug)
    if (!bid) return { title: 'Menu' }
    const [bizRes, cfgRes] = await Promise.all([
      supabaseAdmin.from('businesses').select('name').eq('id', bid).maybeSingle(),
      supabaseAdmin.from('menu_configs').select('menu_label').eq('business_id', bid).eq('menu_key', menu_key).maybeSingle(),
    ])
    const bizName = (bizRes.data?.name as string | null) ?? 'Menu'
    const menuLabel = (cfgRes.data?.menu_label as string | null) ?? menu_key
    return {
      title: bizName + ' — ' + menuLabel,
      description: menuLabel + ' menu from ' + bizName + '.',
      openGraph: { title: bizName + ' — ' + menuLabel, type: 'website' },
    }
  } catch { return { title: 'Menu' } }
}

export default async function SpecificMenuPage({ params }: Props) {
  const { slug, menu_key } = 'then' in params ? await params : params

  const bid = await resolveBusinessId(supabaseAdmin, slug)
  if (!bid) notFound()

  const [bizRes, onlineRes, configRes, catsRes, productsRes, hoursRes] = await Promise.all([
    supabaseAdmin.from('businesses').select('id, name, slug, logo_url, is_active, suburb, city').eq('id', bid).maybeSingle(),
    supabaseAdmin.from('pos_online_settings').select('enabled, accept_orders').eq('business_id', bid).maybeSingle(),
    supabaseAdmin
      .from('menu_configs')
      .select('*')
      .eq('business_id', bid)
      .eq('menu_key', menu_key)
      .maybeSingle(),
    supabaseAdmin
      .from('pos_categories')
      .select('id, name, color')
      .eq('business_id', bid)
      .eq('is_active', true)
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('name'),
    supabaseAdmin
      .from('pos_products')
      .select('id, name, description, price, image_url, sort_order, category_id')
      .eq('business_id', bid)
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('name'),
    supabaseAdmin
      .from('business_hours')
      .select('day_of_week, open_time, close_time, is_closed')
      .eq('business_id', bid),
  ])

  if (!bizRes.data || !bizRes.data.is_active) notFound()
  if (!configRes.data) notFound()

  const biz = bizRes.data
  const menuConfig = configRes.data
  const orderingEnabled = (onlineRes.data?.enabled === true) && (onlineRes.data?.accept_orders === true)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.ariaos.site'
  const menuUrl = appUrl + '/menu/' + slug + '/' + menu_key

  // Location subtitle: suburb + city (hidden if both empty)
  const suburb = (biz.suburb as string | null | undefined) ?? null
  const city   = (biz.city   as string | null | undefined) ?? null
  const locationSubtitle = [suburb, city].filter(Boolean).join(', ') || null

  // Open-now pill: compute in AEST. Show only when currently open; hide when closed or no hours row.
  type HoursRow = { day_of_week: number; open_time: string | null; close_time: string | null; is_closed: boolean | null }
  const hoursRows: HoursRow[] = (hoursRes.data ?? []) as HoursRow[]
  const nowSyd = new Date(new Date().toLocaleString('en-US', { timeZone: 'Australia/Sydney' }))
  const dow = nowSyd.getDay()
  const nowMin = nowSyd.getHours() * 60 + nowSyd.getMinutes()
  const todayRow = hoursRows.find(h => h.day_of_week === dow && !h.is_closed && h.open_time && h.close_time)
  let isOpenNow = false
  let closesAt: string | null = null
  if (todayRow && todayRow.open_time && todayRow.close_time) {
    const [oh, om] = todayRow.open_time.split(':').map(Number)
    const [ch, cm] = todayRow.close_time.split(':').map(Number)
    if (nowMin >= oh * 60 + om && nowMin < ch * 60 + cm) {
      isOpenNow = true
      closesAt = todayRow.close_time
    }
  }

  type CatRow = { id: string; name: string; color: string | null }
  type ProdRow = { id: string; name: string; description: string | null; price: number; image_url: string | null; sort_order: number | null; category_id: string | null }
  const rawCats: CatRow[] = (catsRes.data ?? []) as CatRow[]
  const so = (menuConfig.section_order as string[] | null) ?? null
  const orderedCats: CatRow[] = so && so.length > 0
    ? [...rawCats].sort((a, b) => {
        const pos: Record<string, number> = {}
        so.forEach((id, i) => { pos[id] = i })
        return (pos[a.id] ?? 9999) - (pos[b.id] ?? 9999) || a.name.localeCompare(b.name)
      })
    : rawCats

  return (
    <MenuClient
      businessId={bid}
      slug={slug}
      businessName={(biz.name as string) ?? ''}
      logoUrl={(biz.logo_url as string | null) ?? null}
      orderingEnabled={orderingEnabled}
      menuUrl={menuUrl}
      sectionOrder={(menuConfig.section_order as string[] | null) ?? null}
      itemOverrides={(menuConfig.item_overrides as Record<string, ItemOverride> | null) ?? null}
      templateId={(menuConfig.template_id as string | null) ?? 'editorial'}
      brandKit={(menuConfig.brand_kit as Record<string, unknown> | null) ?? null}
      backgroundId={(menuConfig.background_id as string | null) ?? 'none'}
      initialCategories={orderedCats}
      initialProducts={(productsRes.data ?? []) as ProdRow[]}
      locationSubtitle={locationSubtitle}
      isOpenNow={isOpenNow}
      closesAt={closesAt}
    />
  )
}
