export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { waitUntil } from '@vercel/functions'
import { withErrorCapture } from '@/lib/api/with-error-capture'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string) {
  const { data: a } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (a?.business_id) return a.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 404 })
  const days = parseInt(new URL(req.url).searchParams.get('days') ?? '30')
  const since = new Date(Date.now() - days * 86400000).toISOString()
  const { data: orders } = await supabaseAdmin.from('third_party_delivery_orders')
    .select('platform, total, commission, net_payout, status, created_at').eq('business_id', bid).gte('created_at', since)
  const rows = (orders ?? []).filter(o => !['cancelled', 'rejected'].includes(o.status))
  const byPlatform: Record<string, { orders: number; revenue: number; commission: number; net: number }> = {}
  for (const o of rows) {
    if (!byPlatform[o.platform]) byPlatform[o.platform] = { orders: 0, revenue: 0, commission: 0, net: 0 }
    byPlatform[o.platform].orders++
    byPlatform[o.platform].revenue += Number(o.total) || 0
    byPlatform[o.platform].commission += Number(o.commission) || 0
    byPlatform[o.platform].net += Number(o.net_payout) || 0
  }
  const totalRevenue = rows.reduce((s, o) => s + (Number(o.total) || 0), 0)
  const totalCommission = rows.reduce((s, o) => s + (Number(o.commission) || 0), 0)
  const totalNet = rows.reduce((s, o) => s + (Number(o.net_payout) || 0), 0)
  const avgRate = totalRevenue > 0 ? (totalCommission / totalRevenue * 100).toFixed(1) : '0'

  let ariaInsight: string | null = null
  if (rows.length > 0) {
    const { data: biz } = await supabaseAdmin.from('businesses').select('name').eq('id', bid).maybeSingle()
    const summary = Object.entries(byPlatform).map(([p, d]) =>
      `${p}: ${d.orders} orders, $${d.revenue.toFixed(2)} revenue, $${d.commission.toFixed(2)} commission (${d.revenue > 0 ? (d.commission / d.revenue * 100).toFixed(1) : 0}%), net $${d.net.toFixed(2)}`
    ).join('\n')
    const resp = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001', max_tokens: 200,
      messages: [{ role: 'user', content: `You are Aria, advisor for ${biz?.name} (Australian business). Delivery platform data last ${days} days:\n${summary}\nTotal commission paid: $${totalCommission.toFixed(2)} (${avgRate}% avg). Give 2 specific actionable insights — best margin platform and one way to reduce commission costs. Direct, Australian tone, under 80 words.` }],
    })
    ariaInsight = (resp.content[0] as { type: string; text: string }).text
    waitUntil((async () => { try { await supabaseAdmin.from('aria_ai_calls').insert({ business_id: bid, model: 'claude-haiku-4-5-20251001', prompt_summary: 'delivery_analytics', response_summary: ariaInsight!.slice(0, 200), tokens_used: resp.usage.input_tokens + resp.usage.output_tokens }) } catch {} })())
  }

  return NextResponse.json({
    summary: { total_orders: rows.length, total_revenue: totalRevenue.toFixed(2), total_commission: totalCommission.toFixed(2), total_net: totalNet.toFixed(2), avg_commission_rate: avgRate },
    by_platform: byPlatform, aria_insight: ariaInsight, days,
  })
}

export const GET = withErrorCapture('delivery/analytics', _GET)
