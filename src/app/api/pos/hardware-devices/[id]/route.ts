export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _PATCH(req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 404 })
  const body = await req.json()
  const update: Record<string, unknown> = {}
  const DEVICE_TYPES = ['receipt_printer', 'kitchen_printer', 'label_printer', 'cash_drawer', 'barcode_scanner', 'card_reader', 'customer_display', 'scale']
  const CONNECTION_TYPES = ['usb', 'bluetooth', 'network_tcp', 'network_udp', 'serial', 'hid', 'cloud']
  if (body.device_type      !== undefined && DEVICE_TYPES.includes(body.device_type))      update.device_type      = body.device_type
  if (body.connection_type  !== undefined && CONNECTION_TYPES.includes(body.connection_type)) update.connection_type = body.connection_type
  if (body.network_address  !== undefined) update.network_address = body.network_address
  if (body.port             !== undefined) update.port = Math.min(65535, Math.max(1, Number(body.port)))
  if (body.config           !== undefined) update.config = body.config
  if (body.is_active        !== undefined) update.is_active = Boolean(body.is_active)
  if (body.outlet_id        !== undefined) update.outlet_id = body.outlet_id
  if (body.register_id      !== undefined) update.register_id = body.register_id
  if (body.last_error       !== undefined) update.last_error = body.last_error
  if (Object.keys(update).length === 0) return NextResponse.json({ error: 'No valid fields' }, { status: 400 })
  const { data, error } = await supabase.from('pos_hardware_devices').update(update).eq('id', params.id).eq('business_id', bid).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ device: data })
}

async function _DELETE(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 404 })
  const { error } = await supabase.from('pos_hardware_devices').delete().eq('id', params.id).eq('business_id', bid)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

async function _POST(req: Request, { params }: { params: { id: string } }) {
  // POST /<id> — trigger a test event (test_print, test_drawer, etc.)
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 404 })
  const body = await req.json().catch(() => ({}))
  const action = body.action ?? 'test_print'
  // Log the hardware event
  const { error: evtErr } = await supabase.from('pos_hardware_events').insert({
    business_id: bid,
    device_id: params.id,
    event_type: action,
    payload: body.payload ?? {},
    success: true,
    triggered_by: user.id,
  })
  if (evtErr?.code !== '42P01' && evtErr) return NextResponse.json({ error: evtErr.message }, { status: 500 })
  // Mark last_seen_at
  await supabase.from('pos_hardware_devices').update({ last_seen_at: new Date().toISOString() }).eq('id', params.id).eq('business_id', bid)
  return NextResponse.json({ ok: true, action })
}

export const PATCH = withErrorCapture('pos/hardware-devices/[id]', _PATCH)
export const DELETE = withErrorCapture('pos/hardware-devices/[id]', _DELETE)
export const POST = withErrorCapture('pos/hardware-devices/[id]', _POST)
