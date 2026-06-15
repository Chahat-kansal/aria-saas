export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
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

  // SEC-5 — read from the encrypted store (no tokens selected); connected only when status='connected'
  const { data: conn } = await supabaseAdmin.from('pos_oauth_integrations')
    .select('external_account_id, status, last_sync_at, last_error, created_at')
    .eq('business_id', bid).eq('integration_key', 'square').maybeSingle()

  if (!conn || conn.status !== 'connected') return NextResponse.json({ connected: false })

  const lastSync = await getLastSync(bid, 'square')
  const [prodCount, custCount, saleCount] = await Promise.all([
    supabase.from('pos_products').select('id', { count: 'exact', head: true }).eq('business_id', bid).eq('source', 'square'),
    supabase.from('pos_customers').select('id', { count: 'exact', head: true }).eq('business_id', bid).eq('source', 'square'),
    supabase.from('pos_sales').select('id', { count: 'exact', head: true }).eq('business_id', bid).eq('source', 'square'),
  ])

  return NextResponse.json({
    connected: true,
    merchant_id: conn.external_account_id,
    sync_status: conn.status,
    last_synced_at: conn.last_sync_at,
    sync_error: conn.last_error,
    connected_at: conn.created_at,
    counts: { products: prodCount.count ?? 0, customers: custCount.count ?? 0, sales: saleCount.count ?? 0 },
    last_sync: lastSync,
  })
}

export const GET = withErrorCapture('integrations/square/status', _GET)
