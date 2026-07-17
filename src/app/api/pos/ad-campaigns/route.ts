export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture'

const VALID_STATUSES = new Set(['pending', 'active', 'paused', 'ended'])

async function _GET(_req: Request, _context: unknown, { businessId: bid }: BusinessContext) {
  const { data } = await supabaseAdmin.from('ad_campaigns')
    .select('*').eq('business_id', bid).order('created_at', { ascending: false })

  // impressions in last 30d per campaign
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString()
  const { data: imps } = await supabaseAdmin.from('ad_impressions')
    .select('campaign_id, shown_at')
    .eq('business_id', bid).gte('shown_at', thirtyDaysAgo).limit(20000)
  const impCounts: Record<string, number> = {}
  for (const i of (imps ?? []) as Array<{ campaign_id: string | null }>) {
    if (!i.campaign_id) continue
    impCounts[i.campaign_id] = (impCounts[i.campaign_id] ?? 0) + 1
  }

  const campaigns = (data ?? []).map(c => ({
    ...c,
    impressions_30d: impCounts[(c as { id: string }).id] ?? 0,
  }))

  // Total revenue from active campaigns this month (weekly rate * weeks active in month)
  let monthRevenue = 0
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  for (const c of (data ?? []) as Array<{ status: string; weekly_rate: number | null; start_date: string | null; end_date: string | null }>) {
    if (c.status !== 'active' || !c.weekly_rate) continue
    const start = c.start_date ? new Date(c.start_date) : monthStart
    const end = c.end_date ? new Date(c.end_date) : now
    const overlapStart = start > monthStart ? start : monthStart
    const overlapEnd = end < now ? end : now
    const days = Math.max(0, (overlapEnd.getTime() - overlapStart.getTime()) / 86400000)
    monthRevenue += (Number(c.weekly_rate) / 7) * days
  }

  return NextResponse.json({ campaigns, month_revenue_aud: monthRevenue })
}

async function _POST(req: Request, _context: unknown, { businessId: bid }: BusinessContext) {
  const body = await req.json() as Record<string, unknown>
  if (!body.advertiser_name || !body.ad_title) {
    return NextResponse.json({ error: 'advertiser_name and ad_title required' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin.from('ad_campaigns').insert({
    business_id: bid,
    advertiser_name: String(body.advertiser_name).slice(0, 200),
    advertiser_contact: body.advertiser_contact ? String(body.advertiser_contact).slice(0, 200) : null,
    ad_title: String(body.ad_title).slice(0, 200),
    ad_body: body.ad_body ? String(body.ad_body).slice(0, 600) : null,
    ad_image_url: body.ad_image_url ? String(body.ad_image_url).slice(0, 600) : null,
    weekly_rate: body.weekly_rate ? Number(body.weekly_rate) : 0,
    start_date: body.start_date || null,
    end_date: body.end_date || null,
    status: 'pending',
  }).select('id').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id: data?.id })
}

async function _PATCH(req: Request, _context: unknown, { businessId: bid }: BusinessContext) {
  const body = await req.json() as Record<string, unknown>
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const SAFE = ['advertiser_name', 'advertiser_contact', 'ad_title', 'ad_body', 'ad_image_url', 'weekly_rate', 'start_date', 'end_date', 'status'] as const
  const patch: Record<string, unknown> = {}
  for (const k of SAFE) if (k in body) patch[k] = body[k]

  if (patch.status && !VALID_STATUSES.has(String(patch.status))) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  await supabaseAdmin.from('ad_campaigns').update(patch).eq('id', body.id).eq('business_id', bid)
  return NextResponse.json({ ok: true })
}

async function _DELETE(req: Request, _context: unknown, { businessId: bid }: BusinessContext) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  await supabaseAdmin.from('ad_campaigns').delete().eq('id', id).eq('business_id', bid)
  return NextResponse.json({ ok: true })
}

export const GET = withBusinessContext('pos/ad-campaigns', _GET)
export const POST = withBusinessContext('pos/ad-campaigns', _POST)
export const PATCH = withBusinessContext('pos/ad-campaigns', _PATCH)
export const DELETE = withBusinessContext('pos/ad-campaigns', _DELETE)
