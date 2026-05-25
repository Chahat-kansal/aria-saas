export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { supabaseAdmin } from '@/lib/supabase-admin'
import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date().toISOString()
  let activated = 0
  let reverted = 0

  const { data: toActivate } = await supabaseAdmin
    .from('pos_scheduled_price_changes')
    .select('id, product_id, new_price, original_price, business_id')
    .eq('status', 'scheduled')
    .lte('effective_date', new Date().toISOString().split('T')[0])

  for (const row of (toActivate ?? [])) {
    let origPrice: number | null = (row.original_price as number | null)
    if (origPrice == null) {
      const { data: prod } = await supabaseAdmin.from('pos_products').select('price').eq('id', row.product_id).single()
      if (prod) {
        origPrice = prod.price as number
        await supabaseAdmin.from('pos_scheduled_price_changes').update({ original_price: origPrice }).eq('id', row.id)
      }
    }
    await supabaseAdmin.from('pos_products').update({ price: row.new_price, updated_at: now }).eq('id', row.product_id)
    await supabaseAdmin.from('pos_scheduled_price_changes').update({ status: 'active', applied: true, applied_at: now }).eq('id', row.id)
    activated++
  }

  const { data: toRevert } = await supabaseAdmin
    .from('pos_scheduled_price_changes')
    .select('id, product_id, original_price')
    .eq('status', 'active')
    .not('ends_at', 'is', null)
    .lte('ends_at', now)

  for (const row of (toRevert ?? [])) {
    if ((row.original_price as number | null) != null) {
      await supabaseAdmin.from('pos_products').update({ price: row.original_price, updated_at: now }).eq('id', row.product_id)
    }
    await supabaseAdmin.from('pos_scheduled_price_changes').update({ status: 'completed' }).eq('id', row.id)
    reverted++
  }

  console.log(`[price-schedules] activated=${activated} reverted=${reverted}`)
  return NextResponse.json({ activated, reverted, timestamp: now })
}
