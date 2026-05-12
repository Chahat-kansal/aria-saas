export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getPurchaseOrder, updatePurchaseOrder, deletePurchaseOrder } from '@/lib/orders/queries'
import { withErrorCapture } from '@/lib/api/with-error-capture'

type Params = { params: Promise<{ id: string }> }

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string) {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'no_business' }, { status: 404 })

  const order = await getPurchaseOrder(supabase, id, bid)
  if (!order) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return NextResponse.json({ order })
}

async function _PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'no_business' }, { status: 404 })

  const body = await req.json()
  const order = await updatePurchaseOrder(supabase, id, bid, body)
  if (!order) return NextResponse.json({ error: 'update_failed' }, { status: 500 })
  return NextResponse.json({ order })
}

async function _DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'no_business' }, { status: 404 })

  const ok = await deletePurchaseOrder(supabase, id, bid)
  if (!ok) return NextResponse.json({ error: 'cannot_delete' }, { status: 403 })
  return NextResponse.json({ ok: true })
}

export const GET = withErrorCapture('pos/orders/[id]', _GET)
export const PATCH = withErrorCapture('pos/orders/[id]', _PATCH)
export const DELETE = withErrorCapture('pos/orders/[id]', _DELETE)
