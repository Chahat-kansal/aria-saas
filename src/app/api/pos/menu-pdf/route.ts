export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { generateReportPdf } from '@/lib/inventory/report-pdf'
import { renderMenuHtml } from '@/lib/menu/menu-pdf'
import { withErrorCapture } from '@/lib/api/with-error-capture'

type ItemOverride = { desc?: string; photo_url?: string; badge?: string; price_override?: number; hidden?: boolean }

async function _GET(_req: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Resolve active business
  const { data: active } = await supabase
    .from('user_active_business')
    .select('business_id')
    .eq('user_id', user.id)
    .maybeSingle()
  let bid: string | null = (active?.business_id as string | null) ?? null
  if (!bid) {
    const { data } = await supabase
      .from('businesses')
      .select('id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    bid = (data?.id as string | null) ?? null
  }
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 404 })

  // Load all data in parallel (admin client bypasses RLS)
  const [bizRes, configRes, catsRes, productsRes] = await Promise.all([
    supabaseAdmin.from('businesses').select('name').eq('id', bid).maybeSingle(),
    supabaseAdmin.from('menu_configs').select('*').eq('business_id', bid).maybeSingle(),
    supabaseAdmin.from('pos_categories')
      .select('id, name, color')
      .eq('business_id', bid)
      .eq('is_active', true)
      .order('sort_order', { ascending: true }),
    supabaseAdmin.from('pos_products')
      .select('id, name, description, price, image_url, category_id, sort_order')
      .eq('business_id', bid)
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('sort_order', { ascending: true }),
  ])

  if (!bizRes.data) return NextResponse.json({ error: 'Business not found' }, { status: 404 })

  const rawConfig = configRes.data
  const config = {
    template_id:     (rawConfig?.template_id    as string  | null) ?? 'editorial',
    brand_kit:       (rawConfig?.brand_kit       as Record<string, unknown> | null) ?? {},
    section_order:   (rawConfig?.section_order   as string[]       | null) ?? [],
    item_overrides:  (rawConfig?.item_overrides  as Record<string, ItemOverride> | null) ?? {},
    background_id:   (rawConfig?.background_id   as string  | null) ?? 'none',
    is_published:    (rawConfig?.is_published    as boolean | null) ?? false,
  }

  const html = renderMenuHtml({
    businessName: (bizRes.data.name as string | null) ?? 'Menu',
    config,
    categories:   (catsRes.data ?? []) as Array<{ id: string; name: string; color: string | null }>,
    products:     (productsRes.data ?? []) as Array<{ id: string; name: string; description: string | null; price: number; image_url: string | null; category_id: string | null; sort_order: number | null }>,
  })

  const pdf = await generateReportPdf(html)

  const safeName = ((bizRes.data.name as string | null) ?? 'menu')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="' + safeName + '-menu.pdf"',
      'Cache-Control': 'no-store',
    },
  })
}

export const GET = withErrorCapture('pos/menu-pdf', _GET)
