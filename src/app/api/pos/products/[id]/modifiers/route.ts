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

  const { data, error } = await supabase
    .from('pos_product_modifier_groups')
    .select('*, pos_modifier_groups(*, pos_modifiers(*))')
    .eq('product_id', id)
    .order('display_order')

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

  const body = await req.json()
  const { group_id, override_required, override_min, override_max, display_order = 0 } = body

  const { data, error } = await supabase
    .from('pos_product_modifier_groups')
    .insert({ product_id: id, group_id, business_id: (product as any).business_id, override_required, override_min, override_max, display_order })
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, data })
}

export const GET  = withErrorCapture('pos/products/[id]/modifiers', _GET)
export const POST = withErrorCapture('pos/products/[id]/modifiers', _POST)