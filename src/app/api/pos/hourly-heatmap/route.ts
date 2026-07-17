export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { supabaseAdmin } from '@/lib/supabase-admin'
import { NextResponse } from 'next/server'
import { withErrorCapture, withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture'

async function _GET(_req: Request, _context: unknown, { businessId: bid }: BusinessContext) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString()

  const { data, error } = await supabaseAdmin
    .from('pos_sales')
    .select('created_at, total_amount')
    .eq('business_id', bid)
    .neq('status', 'voided')
    .gte('created_at', thirtyDaysAgo)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rev: number[] = Array(24).fill(0)
  const cnt: number[] = Array(24).fill(0)
  for (const s of (data ?? [])) {
    // Convert UTC to AEST (UTC+10)
    const h = (new Date(s.created_at as string).getUTCHours() + 10) % 24
    rev[h] += Number(s.total_amount ?? 0)
    cnt[h]++
  }
  const hourly = rev.map((r, i) => ({
    hour: i,
    avg: cnt[i] > 0 ? Math.round(r / cnt[i]) : 0,
    count: cnt[i],
  }))

  return NextResponse.json({ hourly })
}

export const GET = withBusinessContext('pos/hourly-heatmap', _GET)
