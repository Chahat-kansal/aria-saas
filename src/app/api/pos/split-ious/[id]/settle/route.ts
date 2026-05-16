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
  if (iou.status === 'disputed') return NextResponse.json({ error: 'Resolve dispute before settling' }, { status: 400 })
  if (iou.status === 'settled') return NextResponse.json({ error: 'Already settled' }, { status: 400 })

  const { method, reference, notes } = await req.json()
  if (!method) return NextResponse.json({ error: 'method required' }, { status: 400 })

  const { error: e } = await supabase.from('split_ious').update({
    status: 'settled',
    settled_at: new Date().toISOString(),
    settlement_method: method,
    settlement_reference: reference ?? null,
    notes: notes ?? null,
  }).eq('id', id)
  if (e) return NextResponse.json({ error: e.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

export const POST = withErrorCapture('pos/split-ious/[id]/settle', _POST)