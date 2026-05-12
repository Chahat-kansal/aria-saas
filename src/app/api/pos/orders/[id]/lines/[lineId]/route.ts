export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { updateOrderLine, removeOrderLine } from '@/lib/orders/queries'
import { withErrorCapture } from '@/lib/api/with-error-capture'

type Params = { params: Promise<{ id: string; lineId: string }> }

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string) {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _PATCH(req: NextRequest, { params }: Params) {
  const { lineId } = await params
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'no_business' }, { status: 404 })

  const body = await req.json()
  const line = await updateOrderLine(supabase, lineId, bid, body)
  if (!line) return NextResponse.json({ error: 'update_failed' }, { status: 500 })
  return NextResponse.json({ line })
}

async function _DELETE(_req: NextRequest, { params }: Params) {
  const { lineId } = await params
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'no_business' }, { status: 404 })

  const ok = await removeOrderLine(supabase, lineId, bid)
  if (!ok) return NextResponse.json({ error: 'delete_failed' }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export const PATCH = withErrorCapture('pos/orders/[id]/lines/[lineId]', _PATCH)
export const DELETE = withErrorCapture('pos/orders/[id]/lines/[lineId]', _DELETE)
