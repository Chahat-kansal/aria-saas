export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture, withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ groups: [] })

  const { searchParams } = new URL(req.url)
  const productId = searchParams.get('product_id')
  if (!productId) return NextResponse.json({ error: 'product_id required' }, { status: 400 })

  // Get bindings for this product
  const { data: bindings } = await supabase
    .from('pos_product_modifier_groups')
    .select('group_id, override_required, override_min, override_max, display_order')
    .eq('product_id', productId)
    .order('display_order')

  if (!bindings || bindings.length === 0) return NextResponse.json({ groups: [] })

  const groupIds = bindings.map(b => b.group_id)
  const { data: groups } = await supabase.from('pos_modifier_groups').select('*').in('id', groupIds).eq('business_id', bid)
  const { data: mods } = await supabase.from('pos_modifiers').select('*').in('group_id', groupIds).eq('business_id', bid).eq('is_active', true).order('sort_order')

  const enriched = (groups ?? []).map(g => {
    const binding = bindings.find(b => b.group_id === g.id)
    return {
      ...g,
      is_required: binding?.override_required ?? g.is_required,
      min_selections: binding?.override_min ?? g.min_selections,
      max_selections: binding?.override_max ?? g.max_selections,
      modifiers: (mods ?? []).filter(m => m.group_id === g.id),
    }
  }).sort((ga, gb) => {
    const oa = bindings.find(bnd => bnd.group_id === ga.id)?.display_order ?? 0
    const ob = bindings.find(bnd => bnd.group_id === gb.id)?.display_order ?? 0
    return oa - ob
  })

  return NextResponse.json({ groups: enriched })
}

async function _POST(req: Request, _context: unknown, { supabase, businessId: bid }: BusinessContext) {
  const body = await req.json()
  const productId: string = body.product_id
  const groupIds: string[] = Array.isArray(body.group_ids) ? body.group_ids : []

  // Verify product belongs to this business
  const { data: product } = await supabase.from('pos_products').select('id').eq('id', productId).eq('business_id', bid).maybeSingle()
  if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

  // Idempotent replace
  await supabase.from('pos_product_modifier_groups').delete().eq('product_id', productId)
  if (groupIds.length > 0) {
    await supabase.from('pos_product_modifier_groups').insert(
      groupIds.map((gid, idx) => ({
        product_id: productId,
        group_id: gid,
        display_order: idx,
      }))
    )
  }

  return NextResponse.json({ ok: true, bound: groupIds.length })
}

export const GET  = withErrorCapture('pos/product-modifier-groups', _GET)
export const POST = withBusinessContext('pos/product-modifier-groups', _POST)
