export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ orders: [] })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const limit  = parseInt(searchParams.get('limit') ?? '50')

  let q = supabase.from('pos_online_orders')
    .select('id, order_number, customer_name, customer_phone, customer_email, status, total, notes, source, pickup_time, created_at, updated_at')
    .eq('business_id', bid)
    .not('status', 'eq', 'archived')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (status) q = q.eq('status', status)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ orders: data ?? [] })
}

async function _PATCH(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 404 })
  const body = await req.json() as Record<string, unknown>
  const { id, status, rejection_reason, estimated_ready_at } = body
  if (!id || !status) return NextResponse.json({ error: 'id and status required' }, { status: 400 })
  const update: Record<string, unknown> = { status, updated_at: new Date().toISOString() }
  if (status === 'accepted') update.accepted_at = new Date().toISOString()
  if (status === 'rejected') { update.rejected_at = new Date().toISOString(); update.rejection_reason = rejection_reason || 'Unable to fulfil' }
  if (status === 'ready') update.estimated_ready_at = new Date().toISOString()
  if (estimated_ready_at) update.estimated_ready_at = estimated_ready_at
  const { data, error } = await supabaseAdmin.from('pos_online_orders').update(update).eq('id', id as string).eq('business_id', bid).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ order: data })
}

export const GET   = withErrorCapture('pos/online-orders', _GET)
export const PATCH = withErrorCapture('pos/online-orders', _PATCH)
