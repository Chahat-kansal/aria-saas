export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string) {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  return data?.id ?? null
}

type Params = { params: Promise<{ id: string }> }

async function _PATCH(req: Request, { params }: Params) {
  const { id } = await params
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const { data: existing } = await supabase.from('pos_tax_codes').select('id, is_system, business_id').eq('id', id).maybeSingle()
  if (!existing || existing.business_id !== bid) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const body = await req.json()
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.name !== undefined) updates.name = String(body.name).slice(0, 100)
  if (body.rate !== undefined) {
    const r = Number(body.rate) || 0
    if (r < 0 || r > 100) return NextResponse.json({ error: 'Rate must be 0-100' }, { status: 400 })
    updates.rate = r
  }
  if (body.description !== undefined) updates.description = body.description
  if (body.is_active !== undefined) updates.is_active = body.is_active
  if (body.is_inclusive !== undefined && !existing.is_system) updates.is_inclusive = body.is_inclusive

  const { data, error } = await supabase.from('pos_tax_codes').update(updates).eq('id', id).eq('business_id', bid).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ tax_code: data })
}

async function _DELETE(_req: Request, { params }: Params) {
  const { id } = await params
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })
  const { data: existing } = await supabase.from('pos_tax_codes').select('is_system, business_id').eq('id', id).maybeSingle()
  if (!existing || existing.business_id !== bid) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (existing.is_system) return NextResponse.json({ error: 'Cannot delete system tax code — deactivate instead' }, { status: 400 })
  await supabase.from('pos_tax_codes').update({ is_active: false }).eq('id', id).eq('business_id', bid)
  return NextResponse.json({ ok: true })
}

export const PATCH = withErrorCapture('pos/tax-codes/[id]', _PATCH)
export const DELETE = withErrorCapture('pos/tax-codes/[id]', _DELETE)
