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

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ groups: [] })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ groups: [] })
  const { searchParams } = new URL(req.url)
  const product_id = searchParams.get('product_id')
  let q = supabase.from('pos_product_variant_groups').select('*').eq('business_id', bid).order('sort_order')
  if (product_id) q = q.eq('product_id', product_id)
  const { data } = await q
  return NextResponse.json({ groups: data ?? [] })
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })
  const body = await req.json()
  const { data, error } = await supabase.from('pos_product_variant_groups').insert({
    business_id: bid,
    product_id: body.product_id,
    name: String(body.name ?? '').trim(),
    values: Array.isArray(body.values) ? body.values : [],
    affects_price: Boolean(body.affects_price),
    price_map: body.price_map ?? {},
    sort_order: body.sort_order ?? 0,
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ group: data }, { status: 201 })
}

export const GET = withErrorCapture('variant-groups', _GET)
export const POST = withErrorCapture('variant-groups', _POST)
