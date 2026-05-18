export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { getLastSync } from '@/lib/integrations/sync-logger'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _GET(_req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ connected: false })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ connected: false })

  const { data: conn } = await supabase.from('shopify_connections')
    .select('store_url, shop_name, sync_status, last_synced_at, sync_error, connected_at')
    .eq('business_id', bid).maybeSingle()

  if (!conn) return NextResponse.json({ connected: false })

  const lastSync = await getLastSync(bid, 'shopify')
  const [prodCount, custCount] = await Promise.all([
    supabase.from('pos_products').select('id', { count: 'exact', head: true }).eq('business_id', bid).eq('source', 'shopify'),
    supabase.from('pos_customers').select('id', { count: 'exact', head: true }).eq('business_id', bid).eq('source', 'shopify'),
  ])

  return NextResponse.json({
    connected: true,
    store_url: conn.store_url,
    shop_name: conn.shop_name,
    sync_status: conn.sync_status,
    last_synced_at: conn.last_synced_at,
    sync_error: conn.sync_error,
    connected_at: conn.connected_at,
    counts: { products: prodCount.count ?? 0, customers: custCount.count ?? 0 },
    last_sync: lastSync,
  })
}

export const GET = withErrorCapture('integrations/shopify/status', _GET)
