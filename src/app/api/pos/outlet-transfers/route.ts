export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { verifyBusinessAccess } from '@/lib/auth/verify-business-access'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string) {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const bid = searchParams.get('business_id') ?? await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ transfers: [] })
  const denied = await verifyBusinessAccess(user.id, bid)
  if (denied) return denied

  const { data: transfers } = await supabaseAdmin
    .from('pos_inter_outlet_transfers')
    .select('*, from_outlet:pos_outlets!from_outlet_id(name), to_outlet:pos_outlets!to_outlet_id(name), product:pos_products(name, sku)')
    .eq('business_id', bid)
    .order('created_at', { ascending: false })
    .limit(100)

  return NextResponse.json({ transfers: transfers ?? [] })
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    business_id: string
    from_outlet_id?: string
    to_outlet_id: string
    product_id: string
    qty: number
    notes?: string
  }
  const { business_id, from_outlet_id, to_outlet_id, product_id, qty, notes } = body

  if (!business_id || !to_outlet_id || !product_id || !qty) {
    return NextResponse.json({ error: 'business_id, to_outlet_id, product_id, qty required' }, { status: 400 })
  }

  // Verify business ownership
  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).single()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Check source stock
  if (from_outlet_id) {
    const { data: srcInv } = await supabaseAdmin
      .from('pos_outlet_inventory')
      .select('items_on_hand')
      .eq('business_id', business_id)
      .eq('outlet_id', from_outlet_id)
      .eq('product_id', product_id)
      .maybeSingle()

    const availableQty = Number(srcInv?.items_on_hand ?? 0)
    if (availableQty < qty) {
      return NextResponse.json({ error: 'Insufficient stock at source outlet (' + availableQty + ' available)' }, { status: 400 })
    }

    // Deduct from source outlet
    try {
      await supabaseAdmin.rpc('decrement_outlet_inventory', {
        p_business_id: business_id,
        p_outlet_id: from_outlet_id,
        p_product_id: product_id,
        p_qty: qty,
      })
    } catch {
      // Fallback: upsert approach
      const newQty = Math.max(0, availableQty - qty)
      await supabaseAdmin.from('pos_outlet_inventory').upsert({
        business_id, outlet_id: from_outlet_id, product_id, items_on_hand: newQty,
      }, { onConflict: 'business_id,outlet_id,product_id' })
    }
  }

  // Add to destination outlet
  const { data: dstInv } = await supabaseAdmin
    .from('pos_outlet_inventory')
    .select('items_on_hand')
    .eq('business_id', business_id)
    .eq('outlet_id', to_outlet_id)
    .eq('product_id', product_id)
    .maybeSingle()

  await supabaseAdmin.from('pos_outlet_inventory').upsert({
    business_id, outlet_id: to_outlet_id, product_id,
    items_on_hand: Number(dstInv?.items_on_hand ?? 0) + qty,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'business_id,outlet_id,product_id' })

  // Record transfer
  const { data: transfer, error } = await supabaseAdmin
    .from('pos_inter_outlet_transfers')
    .insert({
      business_id,
      from_outlet_id: from_outlet_id ?? null,
      to_outlet_id,
      product_id,
      qty,
      notes: notes ?? null,
      status: 'completed',
      transferred_at: new Date().toISOString(),
      created_by: user.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, transfer }, { status: 201 })
}

export const GET = withErrorCapture('pos/outlet-transfers', _GET)
export const POST = withErrorCapture('pos/outlet-transfers', _POST)
