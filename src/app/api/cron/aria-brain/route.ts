export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { ariaObserve } from '@/lib/aria/brain'

const CRON_SECRET = process.env.CRON_SECRET ?? ''

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

export async function GET(req: Request) {
  const auth = req.headers.get('authorization') ?? ''
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sb = adminClient()

  const { data: businesses } = await sb
    .from('businesses')
    .select('id')
    .eq('is_active', true)

  if (!businesses?.length) return NextResponse.json({ ok: true, processed: 0 })

  let observations = 0
  const today = new Date().toISOString().split('T')[0]

  for (const biz of businesses) {
    const bid = biz.id as string

    // Low-stock products: qty = 0 OR (reorder_point set AND qty <= reorder_point)
    const { data: lowStockProducts } = await sb
      .from('pos_products')
      .select('id, name, stock_quantity, reorder_point')
      .eq('business_id', bid)
      .eq('is_active', true)
      .not('stock_quantity', 'is', null)
      .or('stock_quantity.eq.0,and(reorder_point.not.is.null,stock_quantity.lte.reorder_point)')
      .limit(10)

    for (const product of lowStockProducts ?? []) {
      await ariaObserve({
        business_id: bid,
        category: 'inventory',
        event_type: 'low_stock',
        data: {
          product_id: product.id,
          product_name: product.name,
          quantity: product.stock_quantity,
          reorder_point: product.reorder_point,
        },
      })
      observations++
    }

    // Compliance items past due date
    const { data: overdueItems } = await sb
      .from('aria_compliance_items')
      .select('id, title, due_date')
      .eq('business_id', bid)
      .eq('is_completed', false)
      .not('due_date', 'is', null)
      .lt('due_date', today)
      .limit(5)

    for (const item of overdueItems ?? []) {
      await ariaObserve({
        business_id: bid,
        category: 'compliance',
        event_type: 'compliance_item_overdue',
        data: { item_id: item.id, item_name: item.title, due_date: item.due_date },
      })
      observations++
    }
  }

  return NextResponse.json({ ok: true, processed: businesses.length, observations })
}