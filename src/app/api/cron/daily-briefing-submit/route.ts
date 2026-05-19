export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { submitBatch } from '@/lib/aria-batch'
import { ARIA_SYSTEM_PROMPT } from '@/lib/aria-system-prompt'

async function buildBriefingContext(businessId: string) {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const yStart = new Date(yesterday.setHours(0, 0, 0, 0)).toISOString()
  const yEnd   = new Date(yesterday.setHours(23, 59, 59, 999)).toISOString()
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const [{ data: ySales }, { data: wSales }, { data: stock }, { data: items }] = await Promise.all([
    supabaseAdmin.from('pos_sales').select('total_amount').eq('business_id', businessId).neq('status', 'voided').gte('created_at', yStart).lte('created_at', yEnd),
    supabaseAdmin.from('pos_sales').select('total_amount').eq('business_id', businessId).neq('status', 'voided').gte('created_at', weekAgo),
    supabaseAdmin.from('pos_products').select('name,stock_quantity,low_stock_threshold').eq('business_id', businessId).eq('is_active', true).limit(20),
    supabaseAdmin.from('pos_sale_items').select('product_name,quantity').eq('business_id', businessId).gte('created_at', yStart).lte('created_at', yEnd),
  ])

  const counts: Record<string, number> = {}
  for (const i of items ?? []) {
    counts[i.product_name] = (counts[i.product_name] ?? 0) + (i.quantity ?? 1)
  }
  const topProduct = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'no sales'

  return {
    yesterdayRevenue: (ySales ?? []).reduce((s, r) => s + Number(r.total_amount ?? 0), 0).toFixed(2),
    yesterdayTransactions: (ySales ?? []).length,
    weekRevenue: (wSales ?? []).reduce((s, r) => s + Number(r.total_amount ?? 0), 0).toFixed(2),
    topProduct,
    lowStock: (stock ?? []).filter(p => (p.stock_quantity ?? 0) < (p.low_stock_threshold ?? 5)).slice(0, 3).map(p => p.name),
  }
}

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const cronLogId = crypto.randomUUID()
  await supabaseAdmin.from('cron_logs').insert({ id: cronLogId, job_name: 'daily-briefing-submit', status: 'running', started_at: new Date().toISOString() })

  try {
    const { data: businesses } = await supabaseAdmin
      .from('businesses')
      .select('id,name,industry,city,owner_name,timezone')
      .eq('is_active', true)
      .in('subscription_status', ['active', 'trialing'])

    if (!businesses?.length) {
      await supabaseAdmin.from('cron_logs').update({ status: 'completed', finished_at: new Date().toISOString(), businesses_processed: 0 }).eq('id', cronLogId)
      return NextResponse.json({ ok: true, count: 0 })
    }

    const requests = await Promise.all(businesses.map(async biz => {
      const ctx = await buildBriefingContext(biz.id)
      return {
        custom_id: biz.id,
        params: {
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 512,
          system: ARIA_SYSTEM_PROMPT,
          messages: [{
            role: 'user' as const,
            content: `Write today's morning briefing for ${biz.name}, a ${biz.industry ?? 'business'} in ${biz.city ?? 'Australia'}. Owner: ${biz.owner_name ?? 'there'}.\n\nYesterday: A$${ctx.yesterdayRevenue} from ${ctx.yesterdayTransactions} sales. Top seller: ${ctx.topProduct}.\nWeek so far: A$${ctx.weekRevenue}.\nLow stock: ${ctx.lowStock.join(', ') || 'none'}.\n\nWrite 4 sentences: how yesterday went, one thing to watch today, one specific action they should take now. End with a single priority. No bullet points.`,
          }],
        },
      }
    }))

    const batchId = await submitBatch(requests)

    await supabaseAdmin.from('aria_batch_jobs').insert({
      batch_id: batchId, job_type: 'daily_briefing',
      business_count: businesses.length, status: 'submitted',
    })

    await supabaseAdmin.from('cron_logs').update({
      status: 'completed', finished_at: new Date().toISOString(),
      businesses_processed: businesses.length,
    }).eq('id', cronLogId)

    return NextResponse.json({ ok: true, batch_id: batchId, count: businesses.length })
  } catch (e) {
    const msg = (e as Error).message
    await supabaseAdmin.from('cron_logs').update({ status: 'failed', finished_at: new Date().toISOString(), errors: { message: msg } }).eq('id', cronLogId)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
