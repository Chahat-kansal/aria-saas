export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

type Ctx = { params: Promise<{ id: string }> | { id: string } }

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _GET(_req: Request, ctx: Ctx) {
  const { id } = 'then' in ctx.params ? await ctx.params : ctx.params
  const supabase = createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)

  const { data: split } = await supabase.from('pos_sale_splits').select('*, pos_split_items(*), pos_split_payments(*)').eq('id', id).eq('business_id', bid ?? '').maybeSingle()
  if (!split) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ split })
}

async function _PATCH(req: Request, ctx: Ctx) {
  const { id } = 'then' in ctx.params ? await ctx.params : ctx.params
  const supabase = createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)

  const body = await req.json()
  const allowed = ['person_label', 'receipt_email', 'receipt_phone', 'tip_amount', 'tip_type', 'tip_value', 'total_amount', 'notes']
  const update: Record<string, unknown> = {}
  for (const k of allowed) if (body[k] !== undefined) update[k] = body[k]

  const { error: e } = await supabase.from('pos_sale_splits').update(update).eq('id', id).eq('business_id', bid ?? '')
  if (e) return NextResponse.json({ error: e.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

async function _DELETE(_req: Request, ctx: Ctx) {
  const { id } = 'then' in ctx.params ? await ctx.params : ctx.params
  const supabase = createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)

  const { data: split } = await supabase.from('pos_sale_splits').select('status, sale_id').eq('id', id).eq('business_id', bid ?? '').maybeSingle()
  if (!split) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (split.status === 'paid') return NextResponse.json({ error: 'Cannot delete a paid split' }, { status: 400 })

  await supabase.from('pos_split_items').delete().eq('split_id', id)
  await supabase.from('pos_split_payments').delete().eq('split_id', id)
  await supabase.from('pos_sale_splits').delete().eq('id', id)

  // Re-check if any splits remain
  const { count } = await supabase.from('pos_sale_splits').select('id', { count: 'exact', head: true }).eq('sale_id', split.sale_id).neq('status', 'voided')
  if ((count ?? 0) === 0) {
    await supabase.from('pos_sales').update({ status: 'completed' }).eq('id', split.sale_id)
  }
  return NextResponse.json({ ok: true })
}

export const GET = withErrorCapture('pos/splits/[id]', _GET)
export const PATCH = withErrorCapture('pos/splits/[id]', _PATCH)
export const DELETE = withErrorCapture('pos/splits/[id]', _DELETE)