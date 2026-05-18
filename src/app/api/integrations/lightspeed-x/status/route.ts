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

  const { data: conn } = await supabase.from('lightspeed_connections')
    .select('domain_prefix, sync_status, last_synced_at, sync_error, connected_at')
    .eq('business_id', bid).eq('integration_type', 'x_series').maybeSingle()

  if (!conn) return NextResponse.json({ connected: false })

  const lastSync = await getLastSync(bid, 'lightspeed_x')
  const [prodCount, custCount, saleCount] = await Promise.all([
    supabase.from('pos_products').select('id', { count: 'exact', head: true }).eq('business_id', bid).eq('source', 'lightspeed_x'),
    supabase.from('pos_customers').select('id', { count: 'exact', head: true }).eq('business_id', bid).eq('source', 'lightspeed_x'),
    supabase.from('pos_sales').select('id', { count: 'exact', head: true }).eq('business_id', bid).eq('source', 'lightspeed_x'),
  ])

  return NextResponse.json({
    connected: true,
    domain_prefix: conn.domain_prefix,
    sync_status: conn.sync_status,
    last_synced_at: conn.last_synced_at,
    sync_error: conn.sync_error,
    connected_at: conn.connected_at,
    counts: { products: prodCount.count ?? 0, customers: custCount.count ?? 0, sales: saleCount.count ?? 0 },
    last_sync: lastSync,
  })
}

export const GET = withErrorCapture('integrations/lightspeed-x/status', _GET)
