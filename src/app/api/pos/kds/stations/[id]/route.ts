export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
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
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const { data: existing } = await supabase.from('pos_kds_stations').select('id, business_id').eq('id', params.id).maybeSingle()
  if (!existing || existing.business_id !== bid) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof body.display_name === 'string') update.display_name = body.display_name.slice(0, 100)
  if (typeof body.description === 'string' || body.description === null) update.description = body.description
  if (typeof body.sound_enabled === 'boolean') update.sound_enabled = body.sound_enabled
  if (typeof body.show_modifiers === 'boolean') update.show_modifiers = body.show_modifiers
  if (typeof body.show_allergens === 'boolean') update.show_allergens = body.show_allergens
  if (typeof body.is_active === 'boolean') update.is_active = body.is_active
  if (body.sort_order !== undefined) update.sort_order = Number(body.sort_order) || 0
  if (body.auto_recall_threshold_seconds !== undefined) update.auto_recall_threshold_seconds = Number(body.auto_recall_threshold_seconds) || 60

  const { data, error } = await supabase.from('pos_kds_stations').update(update).eq('id', params.id).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ station: data })
}

async function _DELETE(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const { data: existing } = await supabase.from('pos_kds_stations').select('id, business_id').eq('id', params.id).maybeSingle()
  if (!existing || existing.business_id !== bid) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { error } = await supabase.from('pos_kds_stations').update({ is_active: false, updated_at: new Date().toISOString() }).eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export const PATCH = withErrorCapture('pos/kds/stations/[id]', _PATCH)
export const DELETE = withErrorCapture('pos/kds/stations/[id]', _DELETE)
