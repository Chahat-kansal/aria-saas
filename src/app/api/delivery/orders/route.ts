export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

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
  if (!bid) return NextResponse.json({ orders: [] })
  const url = new URL(req.url)
  const status = url.searchParams.get('status')
  const platform = url.searchParams.get('platform')
  const days = parseInt(url.searchParams.get('days') ?? '7')
  const since = new Date(Date.now() - days * 86400000).toISOString()
  let q = supabaseAdmin.from('third_party_delivery_orders').select('*').eq('business_id', bid).gte('created_at', since).order('created_at', { ascending: false }).limit(300)
  if (status && status !== 'all') q = q.eq('status', status)
  if (platform) q = q.eq('platform', platform)
  const { data } = await q
  return NextResponse.json({ orders: data ?? [] })
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 404 })
  const body = await req.json()
  const { platform, platform_order_id, platform_order_number, customer_name, total, commission, net_payout, items, notes, status } = body
  if (!platform || !platform_order_id) return NextResponse.json({ error: 'platform and platform_order_id required' }, { status: 400 })
  const { data: conn } = await supabaseAdmin.from('third_party_delivery_connections').select('id, commission_rate').eq('business_id', bid).eq('platform', platform).maybeSingle()
  const commissionRate = Number(conn?.commission_rate ?? 30) / 100
  const calcCommission = commission ?? parseFloat((Number(total) * commissionRate).toFixed(2))
  const calcNet = net_payout ?? parseFloat((Number(total) - calcCommission).toFixed(2))
  const { data, error } = await supabaseAdmin.from('third_party_delivery_orders').upsert({
    business_id: bid, connection_id: conn?.id ?? null, platform,
    platform_order_id: String(platform_order_id),
    platform_order_number: platform_order_number ?? String(platform_order_id).slice(-6),
    customer_name: customer_name ?? 'Customer',
    status: status ?? 'delivered', total: Number(total) || 0,
    commission: calcCommission, net_payout: calcNet,
    items: items ?? [], notes: notes ?? null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'business_id,platform,platform_order_id' }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ order: data })
}

async function _PATCH(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 404 })
  const { id, status, rejection_reason } = await req.json()
  if (!id || !status) return NextResponse.json({ error: 'id and status required' }, { status: 400 })
  const update: Record<string, unknown> = { status, updated_at: new Date().toISOString() }
  if (status === 'accepted') update.accepted_at = new Date().toISOString()
  if (status === 'ready') update.ready_at = new Date().toISOString()
  if (status === 'picked_up') update.picked_up_at = new Date().toISOString()
  if (status === 'rejected') { update.rejected_at = new Date().toISOString(); update.rejection_reason = rejection_reason || 'Unable to fulfil' }
  const { data, error } = await supabaseAdmin.from('third_party_delivery_orders').update(update).eq('id', id).eq('business_id', bid).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ order: data })
}

export const GET = withErrorCapture('delivery/orders', _GET)
export const POST = withErrorCapture('delivery/orders', _POST)
export const PATCH = withErrorCapture('delivery/orders', _PATCH)
