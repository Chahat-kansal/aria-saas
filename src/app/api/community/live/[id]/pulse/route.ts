export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { rateLimit, clientIp, tooManyRequests } from '@/lib/security/rate-limit'

// CX-1-P4 — live-room POS pulse. PUBLIC GET, rate-limited, no-store.
// GROUNDING-TEETH: every figure here is a real DB count for THIS stream's business. Nothing is
// invented or estimated — 0 sales returns sales_this_stream: 0 (the UI simply shows no chip).
// Signals reuse CX-0's exact definitions:
//   busy_now           = completed pos_sales in the last 2h >= 3
//   promo_live         = at least one active pos_promotions row
//   sales_this_stream  = completed pos_sales since the stream's started_at
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const streamId = params.id
  if (!streamId) return NextResponse.json({ error: 'stream_id required' }, { status: 400 })

  // 30 req/min/IP, fail-OPEN (public convenience surface, not auth-gated).
  const rl = await rateLimit('live-pulse:' + clientIp(req), 30, 60, { failClosed: false })
  if (!rl.allowed) return tooManyRequests(rl.retryAfter)

  // Resolve the streaming business from the ACTIVE stream only.
  const { data: stream } = await supabaseAdmin
    .from('community_live_streams')
    .select('id, business_id, started_at')
    .eq('id', streamId)
    .eq('status', 'active')
    .maybeSingle()
  if (!stream) return NextResponse.json({ error: 'Stream not active' }, { status: 404 })

  const sr = stream as { business_id: string; started_at: string | null }
  const businessId = sr.business_id
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
  // Fall back to the 2h window if started_at is somehow null — never a future/invented anchor.
  const streamStart = sr.started_at ?? twoHoursAgo

  const [busyRes, sinceRes, promoRes] = await Promise.all([
    supabaseAdmin.from('pos_sales').select('id', { count: 'exact', head: true })
      .eq('business_id', businessId).eq('status', 'completed').gte('created_at', twoHoursAgo),
    supabaseAdmin.from('pos_sales').select('id', { count: 'exact', head: true })
      .eq('business_id', businessId).eq('status', 'completed').gte('created_at', streamStart),
    supabaseAdmin.from('pos_promotions').select('id')
      .eq('business_id', businessId).eq('is_active', true).limit(1),
  ])

  const busy_now = (busyRes.count ?? 0) >= 3
  const sales_this_stream = sinceRes.count ?? 0
  const promo_live = ((promoRes.data ?? []) as unknown[]).length > 0

  return NextResponse.json(
    { busy_now, promo_live, sales_this_stream, business_id: businessId },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
