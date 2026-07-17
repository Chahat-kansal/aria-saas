export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture'
import { isKountaConfigured } from '@/lib/integrations/kounta'

async function _GET(_req: Request, _context: unknown, { supabase, businessId: bid }: BusinessContext) {
  const [squareConn, shopifyConn, lsXConn, kountaConn] = await Promise.all([
    supabaseAdmin.from('pos_oauth_integrations').select('sync_status:status, last_synced_at:last_sync_at, connected_at:created_at, sync_error:last_error').eq('business_id', bid).eq('integration_key', 'square').maybeSingle(),
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
    square: squareConn.data && (squareConn.data as { sync_status?: string }).sync_status === 'connected'
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

export const GET = withBusinessContext('integrations/status', _GET)
