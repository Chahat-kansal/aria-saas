export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

type Params = { params: Promise<{ id: string }> }

async function requireCafeProduct(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string, productId: string) {
  const { data } = await supabase
    .from('pos_products')
    .select('id, business_id, businesses!inner(user_id, industry)')
    .eq('id', productId)
    .single()
  if (!data || (data as any).businesses?.user_id !== userId) return null
  if ((data as any).businesses?.industry !== 'cafe') return 'not_cafe'
  return data
}

async function _GET(_req: Request, { params }: Params) {
  const { id } = await params
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const product = await requireCafeProduct(supabase, user.id, id)
  if (!product) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (product === 'not_cafe') return NextResponse.json({ error: 'Modifier system is cafe-only at this stage' }, { status: 403 })

  const { data, error } = await supabase.from('pos_item_variations').select('*').eq('product_id', id).order('display_order')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, data: data ?? [] })
}

async function _POST(req: Request, { params }: Params) {
  const { id } = await params
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const product = await requireCafeProduct(supabase, user.id, id)
  if (!product) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (product === 'not_cafe') return NextResponse.json({ error: 'Modifier system is cafe-only at this stage' }, { status: 403 })

  const { name, price, size_key, is_default = false, display_order = 0 } = await req.json()
  const { data, error } = await supabase
    .from('pos_item_variations')
    .insert({ product_id: id, business_id: (product as any).business_id, name, price, size_key, is_default, display_order })
    .select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, data })
}

async function _PATCH(req: Request, { params }: Params) {
  const { id: productId } = await params
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const product = await requireCafeProduct(supabase, user.id, productId)
  if (!product) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (product === 'not_cafe') return NextResponse.json({ error: 'Modifier system is cafe-only at this stage' }, { status: 403 })

  const body = await req.json()
  const { variation_id, ...updates } = body
  if (!variation_id) return NextResponse.json({ error: 'variation_id required' }, { status: 400 })

  const { data, error } = await supabase.from('pos_item_variations').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', variation_id).eq('product_id', productId).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, data })
}

async function _DELETE(req: Request, { params }: Params) {
  const { id: productId } = await params
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const product = await requireCafeProduct(supabase, user.id, productId)
  if (!product) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (product === 'not_cafe') return NextResponse.json({ error: 'Modifier system is cafe-only at this stage' }, { status: 403 })

  const variation_id = new URL(req.url).searchParams.get('variation_id')
  if (!variation_id) return NextResponse.json({ error: 'variation_id required' }, { status: 400 })
  await supabase.from('pos_item_variations').delete().eq('id', variation_id).eq('product_id', productId)
  return NextResponse.json({ ok: true })
}

export const GET    = withErrorCapture('pos/products/[id]/variations', _GET)
export const POST   = withErrorCapture('pos/products/[id]/variations', _POST)
export const PATCH  = withErrorCapture('pos/products/[id]/variations', _PATCH)
export const DELETE = withErrorCapture('pos/products/[id]/variations', _DELETE)