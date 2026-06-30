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

  const [bizRes, onlineRes, configRes] = await Promise.all([
    supabaseAdmin.from('businesses').select('id, name, slug, logo_url, is_active').eq('id', bid).maybeSingle(),
    supabaseAdmin.from('pos_online_settings').select('enabled, accept_orders').eq('business_id', bid).maybeSingle(),
    supabaseAdmin
      .from('menu_configs')
      .select('*')
      .eq('business_id', bid)
      .eq('menu_key', menu_key)
      .maybeSingle(),
  ])

  if (!bizRes.data || !bizRes.data.is_active) notFound()
  if (!configRes.data) notFound()

  const biz = bizRes.data
  const menuConfig = configRes.data
  const orderingEnabled = (onlineRes.data?.enabled === true) && (onlineRes.data?.accept_orders === true)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.ariaos.site'
  const menuUrl = appUrl + '/menu/' + slug + '/' + menu_key

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
    />
  )
}
