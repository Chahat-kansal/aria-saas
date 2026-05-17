export const runtime = 'nodejs'
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

async function _GET() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ policies: [] })
  const { data } = await supabase.from('pos_return_policies').select('*').eq('business_id', bid)
  return NextResponse.json({ policies: data ?? [] })
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })
  const body = await req.json()
  const { data, error } = await supabase.from('pos_return_policies').upsert({
    business_id: bid,
    category_id: body.category_id ?? null,
    return_window_days: Number(body.return_window_days) || 30,
    requires_photo: !!body.requires_photo,
    allowed_conditions: body.allowed_conditions ?? ['new', 'good'],
    allowed_refund_methods: body.allowed_refund_methods ?? ['original_payment', 'store_credit', 'cash', 'card', 'exchange'],
  }, { onConflict: 'business_id,category_id' }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ policy: data })
}

export const GET = withErrorCapture('pos/return-policies', _GET)
export const POST = withErrorCapture('pos/return-policies', _POST)
