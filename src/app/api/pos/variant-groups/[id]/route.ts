export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture'

async function _PATCH(req: Request, { params }: { params: { id: string } }, { supabase, businessId: bid }: BusinessContext) {
  const body = await req.json()
  const update: Record<string, unknown> = {}
  if (body.name !== undefined) update.name = String(body.name).trim()
  if (body.values !== undefined) update.values = Array.isArray(body.values) ? body.values : []
  if (body.affects_price !== undefined) update.affects_price = Boolean(body.affects_price)
  if (body.price_map !== undefined) update.price_map = body.price_map
  const { data, error } = await supabase.from('pos_product_variant_groups').update(update).eq('id', params.id).eq('business_id', bid).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ group: data })
}

async function _DELETE(_req: Request, { params }: { params: { id: string } }, { supabase, businessId: bid }: BusinessContext) {
  await supabase.from('pos_product_variant_groups').delete().eq('id', params.id).eq('business_id', bid)
  return NextResponse.json({ ok: true })
}

export const PATCH = withBusinessContext('variant-groups/[id]', _PATCH)
export const DELETE = withBusinessContext('variant-groups/[id]', _DELETE)
