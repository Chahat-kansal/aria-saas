export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture, withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture'
import { ensureDefaultStations } from '@/lib/pos/kds-stations'

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
  if (!bid) return NextResponse.json({ stations: [] })

  const { data: biz } = await supabase.from('businesses').select('industry').eq('id', bid).maybeSingle()
  if (biz?.industry) await ensureDefaultStations(bid, String(biz.industry)).catch(() => {})

  const url = new URL(req.url)
  const includeInactive = url.searchParams.get('include_inactive') === '1'

  let q = supabase.from('pos_kds_stations').select('*').eq('business_id', bid).order('sort_order', { ascending: true })
  if (!includeInactive) q = q.eq('is_active', true)

  const { data, error } = await q
  if (error?.code === '42P01') return NextResponse.json({ stations: [] })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ stations: data ?? [] })
}

async function _POST(req: Request, _context: unknown, { supabase, businessId: bid }: BusinessContext) {
  const body = await req.json().catch(() => ({}))
  const station_key = String(body.station_key ?? '').trim().toLowerCase().replace(/\s+/g, '_').slice(0, 50)
  const display_name = String(body.display_name ?? '').trim().slice(0, 100)
  if (!station_key || !display_name) {
    return NextResponse.json({ error: 'station_key and display_name required' }, { status: 400 })
  }

  const { data, error } = await supabase.from('pos_kds_stations').insert({
    business_id: bid, station_key, display_name,
    description: body.description ?? null,
    sound_enabled: body.sound_enabled ?? true,
    auto_recall_threshold_seconds: Number(body.auto_recall_threshold_seconds) || 60,
    show_modifiers: body.show_modifiers ?? true,
    show_allergens: body.show_allergens ?? true,
    sort_order: Number(body.sort_order) || 0,
  }).select('*').single()

  if (error) {
    if ((error as { code?: string }).code === '23505') {
      return NextResponse.json({ error: 'A station with this key already exists.' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ station: data }, { status: 201 })
}

export const GET = withErrorCapture('pos/kds/stations', _GET)
export const POST = withBusinessContext('pos/kds/stations', _POST)
