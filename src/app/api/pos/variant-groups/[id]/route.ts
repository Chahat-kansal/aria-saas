export const dynamic = 'force-dynamic'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string) {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _PATCH(req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })
  const body = await req.json()
  const update: Record<string, unknown> = {}
  if (body.name !== undefined) update.name = String(body.name).trim()
  if (body.values !== undefined) update.values = Array.isArray(body.values) ? body.values : []
  if (body.affects_price !== undefined) update.affects_price = Boolean(body.affects_price)
  if (body.price_map !== undefined) update.price_map = body.price_map
  const { data, error } = await supabase.from('pos_product_variant_groups').update(update).eq('id', params.id).eq('business_id', bid).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ group: data })
}

async function _DELETE(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })
  await supabase.from('pos_product_variant_groups').delete().eq('id', params.id).eq('business_id', bid)
  return NextResponse.json({ ok: true })
}

export const PATCH = withErrorCapture('variant-groups/[id]', _PATCH)
export const DELETE = withErrorCapture('variant-groups/[id]', _DELETE)
