export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _GET(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: campaign } = await supabaseAdmin.from('campaigns').select('*').eq('id', params.id).maybeSingle()
  if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: biz } = await supabaseAdmin.from('businesses').select('user_id').eq('id', (campaign as Record<string,unknown>).business_id as string).maybeSingle()
  if (!biz || (biz as Record<string,unknown>).user_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: recipients } = await supabaseAdmin
    .from('campaign_recipients')
    .select('status,sent_at,delivered_at,opened_at,clicked_at,revenue_cents,visited_after')
    .eq('campaign_id', params.id)

  const rows = (recipients ?? []) as Array<Record<string, unknown>>
  const totalRevenue = rows.reduce((s, r) => s + (Number(r.revenue_cents) || 0), 0)
  const sentDelivered = rows.filter(r => ['sent','delivered'].includes(r.status as string))

  return NextResponse.json({
    campaign,
    stats: {
      total: rows.length,
      sent: sentDelivered.length,
      delivered: rows.filter(r => r.status === 'delivered').length,
      failed: rows.filter(r => r.status === 'failed').length,
      opened: rows.filter(r => r.opened_at).length,
      clicked: rows.filter(r => r.clicked_at).length,
      visited: rows.filter(r => r.visited_after).length,
      revenue_cents: totalRevenue,
      delivery_rate: rows.length > 0 ? Math.round((rows.filter(r => r.status === 'delivered').length / rows.length) * 100) : 0,
      open_rate: sentDelivered.length > 0 ? Math.round((rows.filter(r => r.opened_at).length / sentDelivered.length) * 100) : 0,
    },
    recipients: rows,
  })
}

export const GET = withErrorCapture('marketing/campaigns/analytics', _GET)
