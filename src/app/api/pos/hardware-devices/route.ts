export const maxDuration = 30
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

const DEVICE_TYPES = ['receipt_printer', 'kitchen_printer', 'label_printer', 'cash_drawer', 'barcode_scanner', 'card_reader', 'customer_display', 'scale'] as const
const CONNECTION_TYPES = ['usb', 'bluetooth', 'network_tcp', 'network_udp', 'serial', 'hid', 'cloud'] as const

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 404 })
  const { searchParams } = new URL(req.url)
  const outletId = searchParams.get('outlet_id')
  let query = supabase.from('pos_hardware_devices').select('*').eq('business_id', bid).order('created_at', { ascending: false })
  if (outletId) query = query.eq('outlet_id', outletId)
  const { data, error } = await query
  if (error?.code === '42P01') return NextResponse.json({ devices: [] })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ devices: data || [] })
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 404 })
  const body = await req.json()
  if (!DEVICE_TYPES.includes(body.device_type)) return NextResponse.json({ error: 'Invalid device_type' }, { status: 400 })
  if (!CONNECTION_TYPES.includes(body.connection_type)) return NextResponse.json({ error: 'Invalid connection_type' }, { status: 400 })
  const payload: Record<string, unknown> = {
    business_id: bid,
    device_type: body.device_type,
    connection_type: body.connection_type,
    is_active: body.is_active ?? true,
  }
  if (body.outlet_id)       payload.outlet_id       = body.outlet_id
  if (body.register_id)     payload.register_id     = body.register_id
  if (body.network_address) payload.network_address = String(body.network_address)
  if (body.port)            payload.port            = Math.min(65535, Math.max(1, Number(body.port)))
  if (body.config)          payload.config          = body.config
  const { data, error } = await supabase.from('pos_hardware_devices').insert(payload).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ device: data }, { status: 201 })
}

export const GET = withErrorCapture('pos/hardware-devices', _GET)
export const POST = withErrorCapture('pos/hardware-devices', _POST)
