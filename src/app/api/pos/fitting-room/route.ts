export const dynamic = 'force-dynamic'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { supabaseAdmin } from '@/lib/supabase-admin'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string) {
  const { data: a } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (a?.business_id) return a.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _GET(_req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ sessions: [] })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ sessions: [] })
  const { data } = await supabase.from('pos_fitting_room_sessions')
    .select('*').eq('business_id', bid).eq('status', 'active').order('opened_at', { ascending: false })
  return NextResponse.json({ sessions: data ?? [] })
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })
  const body = await req.json()
  const { data, error } = await supabaseAdmin.from('pos_fitting_room_sessions').insert({
    business_id: bid,
    room_number: String(body.room_number ?? '1'),
    customer_name: body.customer_name ?? null,
    items: body.items ?? [],
    status: 'active',
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ session: data }, { status: 201 })
}

async function _PATCH(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const update: Record<string, unknown> = {}
  if (body.items !== undefined) update.items = body.items
  if (body.status !== undefined) { update.status = body.status; if (body.status !== 'active') update.closed_at = new Date().toISOString() }
  if (body.customer_name !== undefined) update.customer_name = body.customer_name
  await supabaseAdmin.from('pos_fitting_room_sessions').update(update).eq('id', body.id)
  return NextResponse.json({ ok: true })
}

export const GET = withErrorCapture('pos/fitting-room', _GET)
export const POST = withErrorCapture('pos/fitting-room', _POST)
export const PATCH = withErrorCapture('pos/fitting-room', _PATCH)
