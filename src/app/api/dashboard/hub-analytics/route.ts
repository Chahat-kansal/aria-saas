export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture'

async function _GET(_req: Request, _context: unknown, { businessId: bid }: BusinessContext) {
  const since = new Date(Date.now() - 7 * 86400000).toISOString()
  const { data } = await supabaseAdmin.from('customer_hub_clicks')
    .select('target').eq('business_id', bid).gte('created_at', since).limit(5000)

  const rows = data ?? []
  const visits = rows.filter(r => r.target === 'hub_view').length
  const byCard = new Map<string, number>()
  for (const r of rows) if (r.target && r.target !== 'hub_view') byCard.set(r.target, (byCard.get(r.target) ?? 0) + 1)
  const top = [...byCard.entries()].sort((a, b) => b[1] - a[1])[0]

  return NextResponse.json({
    visits_7d: visits,
    total_clicks_7d: rows.length - visits,
    top_card: top ? { target: top[0], count: top[1] } : null,
  })
}

export const GET = withBusinessContext('dashboard/hub-analytics', _GET)
