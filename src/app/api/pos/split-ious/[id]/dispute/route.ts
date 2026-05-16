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

async function _POST(req: Request, ctx: Ctx) {
  const { id } = 'then' in ctx.params ? await ctx.params : ctx.params
  const supabase = createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)

  const { data: iou } = await supabase.from('split_ious').select('status').eq('id', id).eq('business_id', bid ?? '').maybeSingle()
  if (!iou) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (iou.status === 'settled') return NextResponse.json({ error: 'Cannot dispute a settled IOU' }, { status: 400 })

  const { reason } = await req.json()
  if (!reason?.trim()) return NextResponse.json({ error: 'reason required' }, { status: 400 })

  await supabase.from('split_ious').update({ status: 'disputed', disputed_at: new Date().toISOString(), dispute_reason: reason, disputed_by: user.id }).eq('id', id)
  return NextResponse.json({ ok: true })
}

export const POST = withErrorCapture('pos/split-ious/[id]/dispute', _POST)