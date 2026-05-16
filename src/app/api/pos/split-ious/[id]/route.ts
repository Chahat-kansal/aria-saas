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

  const { data: iou } = await supabase.from('split_ious').select('*').eq('id', id).eq('business_id', bid ?? '').maybeSingle()
  if (!iou) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ iou })
}

async function _PATCH(req: Request, ctx: Ctx) {
  const { id } = 'then' in ctx.params ? await ctx.params : ctx.params
  const supabase = createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)

  const { data: iou } = await supabase.from('split_ious').select('status').eq('id', id).eq('business_id', bid ?? '').maybeSingle()
  if (!iou) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (iou.status === 'settled') return NextResponse.json({ error: 'Cannot edit a settled IOU' }, { status: 400 })

  const body = await req.json()
  const update: Record<string, unknown> = {}
  if (body.notes !== undefined) update.notes = body.notes
  if (body.amount && iou.status === 'pending') update.amount = body.amount

  const { error: e } = await supabase.from('split_ious').update(update).eq('id', id)
  if (e) return NextResponse.json({ error: e.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

async function _DELETE(_req: Request, ctx: Ctx) {
  const { id } = 'then' in ctx.params ? await ctx.params : ctx.params
  const supabase = createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)

  const { data: iou } = await supabase.from('split_ious').select('status').eq('id', id).eq('business_id', bid ?? '').maybeSingle()
  if (!iou) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (iou.status === 'settled') return NextResponse.json({ error: 'Cannot cancel a settled IOU' }, { status: 400 })

  await supabase.from('split_ious').update({ status: 'cancelled' }).eq('id', id)
  return NextResponse.json({ ok: true })
}

export const GET = withErrorCapture('pos/split-ious/[id]', _GET)
export const PATCH = withErrorCapture('pos/split-ious/[id]', _PATCH)
export const DELETE = withErrorCapture('pos/split-ious/[id]', _DELETE)