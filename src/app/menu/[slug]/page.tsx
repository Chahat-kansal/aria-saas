import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { resolveBusinessId } from '@/lib/aria/resolve-business'
import MenuClient from './MenuClient'

type ItemOverride = { desc?: string; photo_url?: string; badge?: string; price_override?: number; hidden?: boolean }
type MenuConfig = {
  id: string; business_id: string; template_id: string;
  brand_kit: Record<string, unknown> | null;
  section_order: string[] | null;
  item_overrides: Record<string, ItemOverride> | null;
  background_id: string | null;
  is_published: boolean;
  created_at: string; updated_at: string;
} | null

type Props = { params: Promise<{ slug: string }> | { slug: string } }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = 'then' in params ? await params : params
  try {
    const bid = await resolveBusinessId(supabaseAdmin, slug)
    if (!bid) return { title: 'Menu' }
    const { data: biz } = await supabaseAdmin.from('businesses').select('name').eq('id', bid).maybeSingle()
    const name = (biz?.name as string | null) ?? 'Menu'
    return {
      title: name + ' — Menu',
      description: 'View the menu from ' + name + '.',
      openGraph: { title: name + ' — Menu', type: 'website' },
    }
  } catch { return { title: 'Menu' } }
}

export default async function MenuPage({ params }: Props) {
  const { slug } = 'then' in params ? await params : params

  const bid = await resolveBusinessId(supabaseAdmin, slug)
  if (!bid) notFound()

  const [bizRes, onlineRes, configRes] = await Promise.all([
    supabaseAdmin.from('businesses').select('id, name, slug, logo_url, is_active').eq('id', bid).maybeSingle(),
    supabaseAdmin.from('pos_online_settings').select('enabled, accept_orders').eq('business_id', bid).maybeSingle(),
    supabaseAdmin.from('menu_configs').select('*').eq('business_id', bid).maybeSingle(),
  ])

  if (!bizRes.data || !bizRes.data.is_active) notFound()

  // Lazy-seed a default menu_configs row on first public view
  let menuConfig: MenuConfig = configRes.data as MenuConfig
  if (!menuConfig) {
    const { data: seeded } = await supabaseAdmin.from('menu_configs').insert({
      business_id: bid,
      template_id: 'editorial',
      is_published: true,
    }).select().maybeSingle()
    menuConfig = seeded as MenuConfig
  }

  const biz = bizRes.data
  const orderingEnabled = (onlineRes.data?.enabled === true) && (onlineRes.data?.accept_orders === true)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.ariaos.site'
  const menuUrl = appUrl + '/menu/' + slug

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FoodEstablishment',
    name: biz.name,
    hasMenu: menuUrl,
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <MenuClient
        businessId={bid}
        slug={slug}
        businessName={(biz.name as string) ?? ''}
        logoUrl={(biz.logo_url as string | null) ?? null}
        orderingEnabled={orderingEnabled}
        menuUrl={menuUrl}
        sectionOrder={(menuConfig?.section_order as string[] | null) ?? null}
        itemOverrides={(menuConfig?.item_overrides as Record<string, ItemOverride> | null) ?? null}
      />
    </>
  )
}
