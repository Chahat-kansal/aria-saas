export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

type Ctx = { params: Promise<{ scan_id: string }> | { scan_id: string } }

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _GET(_req: Request, ctx: Ctx) {
  const { scan_id } = 'then' in ctx.params ? await ctx.params : ctx.params
  const supabase = createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)

  const { data: scan } = await supabase.from('receipt_ocr_scans').select('*').eq('id', scan_id).eq('business_id', bid ?? '').maybeSingle()
  if (!scan) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ scan })
}

async function _PATCH(req: Request, ctx: Ctx) {
  const { scan_id } = 'then' in ctx.params ? await ctx.params : ctx.params
  const supabase = createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)

  const body = await req.json()
  const { detected_items, detected_subtotal, detected_tax, detected_tip, detected_total } = body
  const update: Record<string, unknown> = {}
  if (detected_items !== undefined) update.detected_items = detected_items
  if (detected_subtotal !== undefined) update.detected_subtotal = detected_subtotal
  if (detected_tax !== undefined) update.detected_tax = detected_tax
  if (detected_tip !== undefined) update.detected_tip = detected_tip
  if (detected_total !== undefined) update.detected_total = detected_total

  const { error: e } = await supabase.from('receipt_ocr_scans').update(update).eq('id', scan_id).eq('business_id', bid ?? '')
  if (e) return NextResponse.json({ error: e.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

async function _DELETE(_req: Request, ctx: Ctx) {
  const { scan_id } = 'then' in ctx.params ? await ctx.params : ctx.params
  const supabase = createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)

  const { data: scan } = await supabase.from('receipt_ocr_scans').select('image_url').eq('id', scan_id).eq('business_id', bid ?? '').maybeSingle()
  if (!scan) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await supabase.from('receipt_ocr_scans').delete().eq('id', scan_id)
  return NextResponse.json({ ok: true })
}

export const GET = withErrorCapture('pos/splits/ocr/[scan_id]', _GET)
export const PATCH = withErrorCapture('pos/splits/ocr/[scan_id]', _PATCH)
export const DELETE = withErrorCapture('pos/splits/ocr/[scan_id]', _DELETE)