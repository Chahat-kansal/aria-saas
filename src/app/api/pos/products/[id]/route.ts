export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

type Params = { params: Promise<{ id: string }> }

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string) {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data?.id ?? null
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'no_business' }, { status: 404 })

  const { data: product } = await supabase
    .from('pos_products')
    .select('id,name,sku,barcode,description,price,cost_price,tax_rate,stock_quantity,low_stock_threshold,track_stock,is_active,image_url,category_id,supplier_id,case_quantity,is_age_restricted,container_type')
    .eq('id', id)
    .eq('business_id', bid)
    .maybeSingle()

  if (!product) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return NextResponse.json({ product })
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'no_business' }, { status: 404 })

  const body = await req.json() as Record<string, unknown>

  const updatePayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }
  // Only update fields that are explicitly sent
  const allowed = ['name', 'sku', 'barcode', 'description', 'price', 'cost_price', 'tax_rate',
    'stock_quantity', 'low_stock_threshold', 'track_stock', 'is_active', 'case_quantity',
    'is_age_restricted', 'image_url', 'image_source', 'container_type', 'category_id', 'supplier_id',
    'brand_id', 'family_id', 'loyalty_earn_rate', 'show_online']
  for (const key of allowed) {
    if (key in body) updatePayload[key] = body[key]
  }
  // Map aliased fields from ProductForm
  if ('active' in body) updatePayload.is_active = !!body.active
  if ('track_inventory' in body) updatePayload.track_stock = !!body.track_inventory

  const { data: product, error } = await supabase
    .from('pos_products')
    .update(updatePayload)
    .eq('id', id)
    .eq('business_id', bid)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ product })
}
