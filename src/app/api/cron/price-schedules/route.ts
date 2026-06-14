export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { supabaseAdmin } from '@/lib/supabase-admin'
import { NextResponse } from 'next/server'
import { verifyCronAuth } from '@/lib/auth/cron'

export async function GET(req: Request) {
  const denied = verifyCronAuth(req)
  if (denied) return denied

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

  if (activated > 0) {
    const bizIds = new Set((toActivate ?? []).map(r => String(r.business_id)))
    for (const bizId of bizIds) {
      const fired = (toActivate ?? []).filter(r => String(r.business_id) === bizId)
      const names = fired.map(r => `product ${String(r.product_id).slice(0, 8)}`).join(', ')
      try {
        await supabaseAdmin.from('aria_actions').insert({
          business_id: bizId,
          category: 'pricing',
          title: fired.length + ' scheduled price change' + (fired.length > 1 ? 's' : '') + ' applied today',
          recommendation: 'Price updates applied: ' + names + '. Review your current prices.',
          expected_impact: '0.00',
          confidence: 'high',
          status: 'completed',
          source: 'cron:price-schedules',
          priority: 'medium',
          payload: { activated: fired.length, date: new Date().toISOString().slice(0, 10) },
        })
      } catch (e) { console.error('[non-fatal]', e) }
    }
  }

  console.log(`[price-schedules] activated=${activated} reverted=${reverted}`)
  return NextResponse.json({ activated, reverted, timestamp: now })
}
