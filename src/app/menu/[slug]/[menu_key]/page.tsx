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
      .select('id, name, color, ordering_archetype')
      .eq('business_id', bid)
      .order('name'),
    supabaseAdmin
      .from('pos_products')
      .select('id, name, description, price, image_url, sort_order, category_id, ordering_mode, ordering_archetype')
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

  // ── Modifier groups (ordering only) ──
  type ModifierOption = { id: string; name: string; priceCents: number; isDefault: boolean; allowQuantity: boolean; maxQuantity: number; displayOrder: number | null }
  type ModifierGroup  = { id: string; name: string; isRequired: boolean; minSelections: number; maxSelections: number; allowQuantity: boolean; selectionType: string; archetypeSlot: string | null; options: ModifierOption[] }
  type RawPmg = { product_id: string; display_order: number | null; override_required: boolean | null; override_min: number | null; override_max: number | null; group_id: string }
  type RawGrp = { id: string; name: string; min_selections: number | null; max_selections: number | null; is_required: boolean | null; display_order: number | null; archetype_slot: string | null; allow_quantity: boolean | null; selection_type: string | null }
  type RawMod = { id: string; name: string; price_cents: number | null; display_order: number | null; group_id: string; is_default: boolean | null; allow_quantity: boolean | null; max_quantity: number | null }
  const productModifiers: Record<string, ModifierGroup[]> = {}

  if (orderingEnabled) {
    const pids = (productsRes.data ?? []).map(p => (p as { id: string }).id)
    if (pids.length > 0) {
      const { data: pmgData } = await supabaseAdmin
        .from('pos_product_modifier_groups')
        .select('product_id, display_order, override_required, override_min, override_max, group_id')
        .in('product_id', pids)
      const pmgRows = (pmgData ?? []) as RawPmg[]
      if (pmgRows.length > 0) {
        const groupIds = [...new Set(pmgRows.map(r => r.group_id))]
        const [grpRes, modRes] = await Promise.all([
          supabaseAdmin.from('pos_modifier_groups').select('id, name, min_selections, max_selections, is_required, display_order, archetype_slot, allow_quantity, selection_type').in('id', groupIds),
          supabaseAdmin.from('pos_modifiers').select('id, name, price_cents, display_order, group_id, is_default, allow_quantity, max_quantity').in('group_id', groupIds).eq('is_active', true).order('display_order', { ascending: true, nullsFirst: false }),
        ])
        const grpMap: Record<string, RawGrp> = {}
        ;(grpRes.data ?? []).forEach(g => { grpMap[(g as RawGrp).id] = g as RawGrp })
        const modsByGrp: Record<string, ModifierOption[]> = {}
        ;(modRes.data ?? []).forEach(m => {
          const rm = m as RawMod
          if (!modsByGrp[rm.group_id]) modsByGrp[rm.group_id] = []
          modsByGrp[rm.group_id].push({ id: rm.id, name: rm.name, priceCents: rm.price_cents ?? 0, isDefault: rm.is_default ?? false, allowQuantity: rm.allow_quantity ?? false, maxQuantity: rm.max_quantity ?? 1, displayOrder: rm.display_order ?? null })
        })
        const byProd: Record<string, RawPmg[]> = {}
        pmgRows.forEach(r => { if (!byProd[r.product_id]) byProd[r.product_id] = []; byProd[r.product_id].push(r) })
        Object.entries(byProd).forEach(([pid, rows]) => {
          rows.sort((a, b) => {
            const aO = a.display_order ?? grpMap[a.group_id]?.display_order ?? 9999
            const bO = b.display_order ?? grpMap[b.group_id]?.display_order ?? 9999
            return aO - bO
          })
          productModifiers[pid] = rows
            .map(r => {
              const g = grpMap[r.group_id]; if (!g) return null
              const opts = modsByGrp[r.group_id] ?? []; if (opts.length === 0) return null
              return {
                id: g.id, name: g.name,
                isRequired: r.override_required !== null ? r.override_required : (g.is_required ?? false),
                minSelections: r.override_min !== null ? r.override_min : (g.min_selections ?? 0),
                maxSelections: r.override_max !== null ? r.override_max : (g.max_selections ?? 1),
                allowQuantity: g.allow_quantity ?? false,
                selectionType: g.selection_type ?? 'multi_select',
                archetypeSlot: g.archetype_slot ?? null,
                options: opts,
              } as ModifierGroup
            })
            .filter((g): g is ModifierGroup => g !== null)
        })
      }
    }
  }

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

  type CatRow = { id: string; name: string; color: string | null; ordering_archetype: string | null }
  type ProdRow = { id: string; name: string; description: string | null; price: number; image_url: string | null; sort_order: number | null; category_id: string | null; ordering_mode: string | null; ordering_archetype: string | null }
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
      productModifiers={productModifiers}
    />
  )
}
