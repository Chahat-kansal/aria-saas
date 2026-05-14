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

  const [{ data: groups, error }, { data: productDefaults }] = await Promise.all([
    supabase
      .from('pos_product_modifier_groups')
      .select('*, pos_modifier_groups(*, pos_modifiers(*))')
      .eq('product_id', id)
      .order('display_order'),
    supabase
      .from('pos_product_default_modifiers')
      .select('modifier_id, quantity')
      .eq('product_id', id),
  ])

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, data: groups ?? [], product_defaults: productDefaults ?? [] })
}

async function _POST(req: Request, { params }: Params) {
  const { id } = await params
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const product = await requireCafeProduct(supabase, user.id, id)
  if (!product) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (product === 'not_cafe') return NextResponse.json({ error: 'Modifier system is cafe-only at this stage' }, { status: 403 })

  const body = await req.json()

  // type='default': add/update a per-product default modifier
  if (body.type === 'default') {
    const { modifier_id, quantity = 1 } = body
    const { data, error } = await supabase
      .from('pos_product_default_modifiers')
      .upsert({ product_id: id, modifier_id, business_id: (product as any).business_id, quantity }, { onConflict: 'product_id,modifier_id' })
      .select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, data })
  }

  // default: assign a modifier group to this product
  const { group_id, override_required, override_min, override_max, display_order = 0 } = body
  const { data, error } = await supabase
    .from('pos_product_modifier_groups')
    .insert({ product_id: id, group_id, business_id: (product as any).business_id, override_required, override_min, override_max, display_order })
    .select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, data })
}

async function _DELETE(req: Request, { params }: Params) {
  const { id } = await params
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const product = await requireCafeProduct(supabase, user.id, id)
  if (!product) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (product === 'not_cafe') return NextResponse.json({ error: 'Modifier system is cafe-only at this stage' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type')

  if (type === 'default') {
    const modifier_id = searchParams.get('modifier_id')
    if (!modifier_id) return NextResponse.json({ error: 'modifier_id required' }, { status: 400 })
    await supabase.from('pos_product_default_modifiers').delete().eq('product_id', id).eq('modifier_id', modifier_id)
    return NextResponse.json({ ok: true })
  }

  const pmg_id = searchParams.get('pmg_id')
  if (!pmg_id) return NextResponse.json({ error: 'pmg_id required' }, { status: 400 })
  await supabase.from('pos_product_modifier_groups').delete().eq('id', pmg_id).eq('product_id', id)
  return NextResponse.json({ ok: true })
}

export const GET    = withErrorCapture('pos/products/[id]/modifiers', _GET)
export const POST   = withErrorCapture('pos/products/[id]/modifiers', _POST)
export const DELETE = withErrorCapture('pos/products/[id]/modifiers', _DELETE)