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
    .select('id,name,sku,barcode,description,price,cost_price,tax_rate,stock_quantity,low_stock_threshold,track_stock,is_active,image_url,category_id,supplier_id,case_quantity,is_age_restricted,container_type,brand_id,family_id,loyalty_earn_rate,show_online')
    .eq('id', id).eq('business_id', bid).maybeSingle()

  if (!product) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return NextResponse.json({ product })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'no_business' }, { status: 404 })

  const { error } = await supabase.from('pos_products').delete().eq('id', id).eq('business_id', bid)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'no_business' }, { status: 404 })

  const action = new URL(req.url).searchParams.get('action')
  const body = await req.json() as Record<string, unknown>

  // ── update_general ──────────────────────────────────────────────
  if (action === 'update_general') {
    const allowed = ['name', 'sku', 'description', 'is_active', 'show_online', 'is_age_restricted']
    const payload: Record<string, unknown> = { updated_at: new Date().toISOString() }
    for (const k of allowed) if (k in body) payload[k] = body[k]
    const { data, error } = await supabase.from('pos_products').update(payload).eq('id', id).eq('business_id', bid).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ product: data })
  }

  // ── update_classifications ──────────────────────────────────────
  if (action === 'update_classifications') {
    const allowed = ['category_id', 'brand_id', 'family_id', 'container_type']
    const payload: Record<string, unknown> = { updated_at: new Date().toISOString() }
    for (const k of allowed) if (k in body) payload[k] = body[k]
    const { error } = await supabase.from('pos_products').update(payload).eq('id', id).eq('business_id', bid)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // ── update_pricing ──────────────────────────────────────────────
  if (action === 'update_pricing') {
    // body.prices = ProductPrice[] — upsert all, track deleted by id
    const prices = (body.prices as any[]) ?? []
    const deleted = (body.deleted_ids as string[]) ?? []

    if (deleted.length) {
      await supabase.from('pos_product_prices').delete().in('id', deleted).eq('business_id', bid)
    }
    if (prices.length) {
      const rows = prices.map((p: any) => ({
        ...p, product_id: id, business_id: bid,
        updated_at: new Date().toISOString(),
      }))
      const { error } = await supabase.from('pos_product_prices').upsert(rows, { onConflict: 'id' })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
    // Also update pos_products.price for the default price set qty=1
    if (body.default_price != null) {
      await supabase.from('pos_products').update({ price: body.default_price, updated_at: new Date().toISOString() }).eq('id', id).eq('business_id', bid)
    }
    return NextResponse.json({ ok: true })
  }

  // ── update_costs ────────────────────────────────────────────────
  if (action === 'update_costs') {
    const rows = (body.costs as any[]) ?? []
    for (const r of rows) {
      await supabase.from('pos_outlet_inventory').update({
        case_cost: r.case_cost ?? null,
        item_cost: r.item_cost ?? null,
        updated_at: new Date().toISOString(),
      }).eq('id', r.id).eq('business_id', bid)
    }
    return NextResponse.json({ ok: true })
  }

  // ── update_inventory ────────────────────────────────────────────
  if (action === 'update_inventory') {
    const rows = (body.inventory as any[]) ?? []
    const ALLOWED = ['items_on_hand','items_reorder_level','items_reorder_amount','items_reorder_limit','items_max_on_hand',
      'cases_on_hand','cases_reorder_level','cases_reorder_amount','cases_reorder_limit','cases_max_on_hand',
      'items_per_case','reorder_rounding']
    for (const r of rows) {
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
      for (const k of ALLOWED) if (k in r) patch[k] = r[k]
      await supabase.from('pos_outlet_inventory').update(patch).eq('id', r.id).eq('business_id', bid)
    }
    return NextResponse.json({ ok: true })
  }

  // ── update_barcodes ─────────────────────────────────────────────
  if (action === 'update_barcodes') {
    const barcodes = (body.barcodes as any[]) ?? []
    const deleted = (body.deleted_ids as string[]) ?? []
    if (deleted.length) {
      await supabase.from('pos_product_barcodes').delete().in('id', deleted).eq('business_id', bid)
    }
    if (barcodes.length) {
      const rows = barcodes.map((b: any) => ({ ...b, product_id: id, business_id: bid }))
      const { error } = await supabase.from('pos_product_barcodes').upsert(rows, { onConflict: 'id' })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  }

  // ── update_suppliers ────────────────────────────────────────────
  if (action === 'update_suppliers') {
    const suppliers = (body.suppliers as any[]) ?? []
    const deleted = (body.deleted_ids as string[]) ?? []
    try {
      if (deleted.length) await supabase.from('pos_product_suppliers').delete().in('id', deleted).eq('business_id', bid)
      if (suppliers.length) {
        const rows = suppliers.map((s: any) => ({ ...s, product_id: id, business_id: bid }))
        await supabase.from('pos_product_suppliers').upsert(rows, { onConflict: 'id' })
      }
    } catch { /* table may not exist yet */ }
    return NextResponse.json({ ok: true })
  }

  // ── update_loyalty ──────────────────────────────────────────────
  if (action === 'update_loyalty') {
    const row = {
      ...(body as any),
      product_id: id,
      business_id: bid,
      updated_at: new Date().toISOString(),
    }
    const { error } = await supabase.from('pos_product_loyalty').upsert(row, { onConflict: 'product_id,business_id' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // ── update_images ───────────────────────────────────────────────
  if (action === 'update_images') {
    const images = (body.images as any[]) ?? []
    const deleted = (body.deleted_ids as string[]) ?? []
    if (deleted.length) await supabase.from('pos_product_images').delete().in('id', deleted).eq('business_id', bid)
    if (images.length) {
      const rows = images.map((img: any) => ({ ...img, product_id: id, business_id: bid }))
      const { error } = await supabase.from('pos_product_images').upsert(rows, { onConflict: 'id' })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
    // Keep pos_products.image_url in sync with primary image
    const primary = images.find((i: any) => i.is_primary)
    if (primary) await supabase.from('pos_products').update({ image_url: primary.image_url, updated_at: new Date().toISOString() }).eq('id', id).eq('business_id', bid)
    return NextResponse.json({ ok: true })
  }

  // ── Legacy fallback (no action) ─────────────────────────────────
  const allowed = ['name', 'sku', 'barcode', 'description', 'price', 'cost_price', 'tax_rate',
    'stock_quantity', 'low_stock_threshold', 'track_stock', 'is_active', 'case_quantity',
    'is_age_restricted', 'image_url', 'image_source', 'container_type', 'category_id', 'supplier_id',
    'brand_id', 'family_id', 'loyalty_earn_rate', 'show_online']
  const updatePayload: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of allowed) if (key in body) updatePayload[key] = body[key]
  if ('active' in body) updatePayload.is_active = !!body.active
  if ('track_inventory' in body) updatePayload.track_stock = !!body.track_inventory

  const { data: product, error } = await supabase.from('pos_products').update(updatePayload).eq('id', id).eq('business_id', bid).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ product })
}
