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
  if (!bid) return NextResponse.json({ connections: [] })
  const { data } = await supabaseAdmin.from('third_party_delivery_connections').select('*').eq('business_id', bid).order('platform')
  return NextResponse.json({ connections: data ?? [] })
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 404 })
  const body = await req.json()
  const { platform, store_id, store_name, commission_rate, auto_accept } = body
  if (!platform) return NextResponse.json({ error: 'platform required' }, { status: 400 })
  const { data, error } = await supabaseAdmin.from('third_party_delivery_connections').upsert({
    business_id: bid, platform, store_id: store_id || null, store_name: store_name || null,
    commission_rate: commission_rate ?? 30, auto_accept: auto_accept ?? false,
    status: store_id ? 'connected' : 'pending', updated_at: new Date().toISOString(),
    connected_at: store_id ? new Date().toISOString() : null,
  }, { onConflict: 'business_id,platform' }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ connection: data })
}

async function _PATCH(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 404 })
  const { id, ...updates } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  updates.updated_at = new Date().toISOString()
  const { data, error } = await supabaseAdmin.from('third_party_delivery_connections').update(updates).eq('id', id).eq('business_id', bid).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ connection: data })
}

export const GET = withErrorCapture('delivery/connections', _GET)
export const POST = withErrorCapture('delivery/connections', _POST)
export const PATCH = withErrorCapture('delivery/connections', _PATCH)
