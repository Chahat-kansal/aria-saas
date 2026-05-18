export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { isKountaConfigured } from '@/lib/integrations/kounta'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _GET(_req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const [squareConn, shopifyConn, lsXConn, kountaConn] = await Promise.all([
    supabase.from('square_connections').select('sync_status, last_synced_at, connected_at, sync_error').eq('business_id', bid).maybeSingle(),
    supabase.from('shopify_connections').select('sync_status, last_synced_at, shop_name, store_url, sync_error').eq('business_id', bid).maybeSingle(),
    supabase.from('lightspeed_connections').select('sync_status, last_synced_at, domain_prefix, sync_error, connected_at').eq('business_id', bid).eq('integration_type', 'x_series').maybeSingle(),
    supabase.from('lightspeed_connections').select('sync_status, last_synced_at, kounta_company_id, sync_error, connected_at').eq('business_id', bid).eq('integration_type', 'kounta').maybeSingle(),
  ])

  const [squareCount, shopifyCount, lsXCount, kountaCount, csvCount] = await Promise.all([
    supabase.from('pos_products').select('id', { count: 'exact', head: true }).eq('business_id', bid).eq('source', 'square'),
    supabase.from('pos_products').select('id', { count: 'exact', head: true }).eq('business_id', bid).eq('source', 'shopify'),
    supabase.from('pos_products').select('id', { count: 'exact', head: true }).eq('business_id', bid).eq('source', 'lightspeed_x'),
    supabase.from('pos_products').select('id', { count: 'exact', head: true }).eq('business_id', bid).eq('source', 'kounta'),
    supabase.from('pos_products').select('id', { count: 'exact', head: true }).eq('business_id', bid).eq('source', 'csv_import'),
  ])

  return NextResponse.json({
    square: squareConn.data
      ? { connected: true, ...squareConn.data, product_count: squareCount.count ?? 0 }
      : { connected: false },
    shopify: shopifyConn.data
      ? { connected: true, ...shopifyConn.data, product_count: shopifyCount.count ?? 0 }
      : { connected: false },
    lightspeed_x: lsXConn.data
      ? { connected: true, ...lsXConn.data, product_count: lsXCount.count ?? 0 }
      : { connected: false },
    kounta: kountaConn.data
      ? { connected: true, ...kountaConn.data, product_count: kountaCount.count ?? 0 }
      : { connected: false, kounta_available: isKountaConfigured() },
    csv: { product_count: csvCount.count ?? 0 },
  })
}

export const GET = withErrorCapture('integrations/status', _GET)
