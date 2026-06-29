import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { resolveBusinessId } from '@/lib/aria/resolve-business'
import MenuClient from './MenuClient'

type ItemOverride = { desc?: string; photo_url?: string; badge?: string; price_override?: number; hidden?: boolean }
type MenuConfig = {
  id: string; business_id: string; menu_key: string; menu_label: string;
  is_default: boolean; active_from: string | null; active_to: string | null;
  days_of_week: number[] | null; template_id: string;
  brand_kit: Record<string, unknown> | null;
  section_order: string[] | null;
  item_overrides: Record<string, ItemOverride> | null;
  background_id: string | null;
  is_published: boolean;
  created_at: string; updated_at: string;
}

type Props = { params: Promise<{ slug: string }> | { slug: string } }

// Resolve which menu to show based on current AEST time + daypart schedules.
// Returns the daypart-active menu if one matches, otherwise the default.
function resolveActiveConfig(configs: MenuConfig[]): MenuConfig | null {
  if (configs.length === 0) return null

  const defaultMenu = configs.find(c => c.is_default) ?? configs[0]

  // Get current time in AEST (Australia/Sydney handles DST automatically)
  const nowSydney = new Date(new Date().toLocaleString('en-US', { timeZone: 'Australia/Sydney' }))
  const dow = nowSydney.getDay()       // 0=Sun … 6=Sat
  const minutes = nowSydney.getHours() * 60 + nowSydney.getMinutes()

  for (const cfg of configs) {
    if (cfg.is_default) continue
    if (!cfg.active_from || !cfg.active_to || !cfg.days_of_week || cfg.days_of_week.length === 0) continue
    if (!cfg.days_of_week.includes(dow)) continue

    const [fh, fm] = cfg.active_from.split(':').map(Number)
    const [th, tm] = cfg.active_to.split(':').map(Number)
    const from = fh * 60 + fm
    const to   = th * 60 + tm

    if (minutes >= from && minutes < to) return cfg
  }

  return defaultMenu
}

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

  const [bizRes, onlineRes, configsRes] = await Promise.all([
    supabaseAdmin.from('businesses').select('id, name, slug, logo_url, is_active').eq('id', bid).maybeSingle(),
    supabaseAdmin.from('pos_online_settings').select('enabled, accept_orders').eq('business_id', bid).maybeSingle(),
    supabaseAdmin
      .from('menu_configs')
      .select('*')
      .eq('business_id', bid)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true }),
  ])

  if (!bizRes.data || !bizRes.data.is_active) notFound()

  let configs: MenuConfig[] = (configsRes.data ?? []) as MenuConfig[]

  // Lazy-seed a default menu_configs row on first public view
  if (configs.length === 0) {
    const { data: seeded } = await supabaseAdmin.from('menu_configs').insert({
      business_id: bid,
      menu_key: 'main',
      menu_label: 'Main Menu',
      is_default: true,
      template_id: 'editorial',
      is_published: true,
    }).select().maybeSingle()
    if (seeded) configs = [seeded as MenuConfig]
  }

  const menuConfig = resolveActiveConfig(configs)

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
