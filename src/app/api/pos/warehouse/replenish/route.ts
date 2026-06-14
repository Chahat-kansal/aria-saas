export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
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
  if (!bid) return NextResponse.json({ items: [] })
  const denied = await verifyBusinessAccess(user.id, bid)
  if (denied) return denied

  const { data: products } = await supabase
    .from('pos_products')
    .select('id, name, sku, stock_quantity, shelf_capacity, qty_backroom, cost_price, price, image_url')
    .eq('business_id', bid)
    .eq('is_active', true)
    .eq('track_stock', true)
    .gt('shelf_capacity', 0)
    .gt('qty_backroom', 0)

  const items = (products ?? []).filter(p => {
    const cap = Number(p.shelf_capacity ?? 0)
    const floor = Number(p.stock_quantity ?? 0)
    return cap > 0 && floor < cap * 0.2
  }).map(p => {
    const cap = Number(p.shelf_capacity ?? 0)
    const floor = Number(p.stock_quantity ?? 0)
    const backroom = Number(p.qty_backroom ?? 0)
    const fill_pct = cap > 0 ? Math.round(floor / cap * 100) : 0
    const pull_qty = Math.min(backroom, cap - floor)
    return {
      id: p.id,
      name: p.name,
      sku: p.sku ?? null,
      floor_qty: floor,
      backroom_qty: backroom,
      shelf_capacity: cap,
      fill_pct,
      pull_qty,
      image_url: p.image_url ?? null,
    }
  }).sort((a, b) => a.fill_pct - b.fill_pct)

  return NextResponse.json({ items })
}

export const GET = withErrorCapture('pos/warehouse/replenish', _GET)
