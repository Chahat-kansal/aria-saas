export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { addOrderLine } from '@/lib/orders/queries'
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
  if (!bid) return NextResponse.json({ lines: [] })

  const { data: lines, error } = await supabase
    .from('pos_purchase_order_lines')
    .select('*')
    .eq('order_id', id)
    .eq('business_id', bid)
    .order('sort_order')

  if (error?.code === '42P01') return NextResponse.json({ lines: [] })
  return NextResponse.json({ lines: lines ?? [] })
}

async function _POST(req: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'no_business' }, { status: 404 })

  const body = await req.json()
  const line = await addOrderLine(supabase, id, bid, body)
  if (!line) return NextResponse.json({ error: 'insert_failed' }, { status: 500 })
  return NextResponse.json({ line })
}

async function _DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'no_business' }, { status: 404 })

  await supabase.from('pos_purchase_order_lines').delete().eq('order_id', id).eq('business_id', bid)
  return NextResponse.json({ ok: true })
}

async function _PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'no_business' }, { status: 404 })

  const { lines } = await req.json()
  const results = await Promise.all(
    (lines ?? []).map((line: any) =>
      supabase.from('pos_purchase_order_lines')
        .update({ ...line, updated_at: new Date().toISOString() })
        .eq('id', line.id).eq('business_id', bid).eq('order_id', id)
        .select().single()
    )
  )
  return NextResponse.json({ lines: results.map(r => r.data).filter(Boolean) })
}

export const GET = withErrorCapture('pos/orders/[id]/lines', _GET)
export const POST = withErrorCapture('pos/orders/[id]/lines', _POST)
export const PATCH = withErrorCapture('pos/orders/[id]/lines', _PATCH)
export const DELETE = withErrorCapture('pos/orders/[id]/lines', _DELETE)
