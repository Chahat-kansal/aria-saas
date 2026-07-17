export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture, withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture'

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
  if (!bid) return NextResponse.json({ sessions: [], active_session: null })

  const { searchParams } = new URL(req.url)
  const outletId = searchParams.get('outlet_id')
  const registerId = searchParams.get('register_id')

  let q = supabase.from('pos_cash_sessions').select('*').eq('business_id', bid).order('opened_at', { ascending: false }).limit(50)
  if (outletId) q = q.eq('outlet_id', outletId)
  if (registerId) q = q.eq('register_id', registerId)

  const { data, error } = await q
  if (error?.code === '42P01') return NextResponse.json({ sessions: [], active_session: null })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const sessions = data ?? []
  const active_session = sessions.find(s => s.status === 'open') ?? null
  return NextResponse.json({ sessions, active_session })
}

async function _POST(req: Request, _context: unknown, { supabase, userId, businessId: bid }: BusinessContext) {
  const body = await req.json()
  const { opening_float, register_id, outlet_id, notes } = body

  if (register_id) {
    const { data: existing } = await supabase.from('pos_cash_sessions')
      .select('id').eq('business_id', bid).eq('register_id', register_id).eq('status', 'open').maybeSingle()
    if (existing) return NextResponse.json({ error: 'A session is already open for this register. Close it first.' }, { status: 409 })
  }

  const { data, error } = await supabase.from('pos_cash_sessions').insert({
    business_id: bid,
    register_id: register_id ?? null,
    outlet_id: outlet_id ?? null,
    opened_by: userId,
    opened_by_user_id: userId,
    opened_at: new Date().toISOString(),
    opening_float: Number(opening_float) || 0,
    status: 'open',
    notes: notes ?? null,
  }).select().single()

  if (error?.code === '42P01') return NextResponse.json({ error: 'Cash sessions table not yet created' }, { status: 503 })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ session: data }, { status: 201 })
}

export const GET = withErrorCapture('pos/cash-sessions', _GET)
export const POST = withBusinessContext('pos/cash-sessions', _POST)
