export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { scoreCustomersForBusiness, generateWinbackRecommendations } from '@/lib/aria/rfm-engine'

export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const cronLogId = crypto.randomUUID()
  await supabaseAdmin.from('cron_logs').insert({ id: cronLogId, job_name: 'customer-scoring', status: 'running', started_at: new Date().toISOString() })

  try {
    const { data: businesses } = await supabaseAdmin
      .from('businesses').select('id').eq('is_active', true).in('subscription_status', ['active', 'trialing'])

    if (!businesses?.length) {
      await supabaseAdmin.from('cron_logs').update({ status: 'completed', finished_at: new Date().toISOString(), businesses_processed: 0 }).eq('id', cronLogId)
      return NextResponse.json({ ok: true, count: 0 })
    }

    let processed = 0, totalScored = 0, totalRecs = 0
    for (const biz of businesses) {
      try {
        const { scored } = await scoreCustomersForBusiness(biz.id)
        const { recommendations_created } = await generateWinbackRecommendations(biz.id)
        totalScored += scored
        totalRecs += recommendations_created
        processed++
      } catch (e) {
        console.error('[customer-scoring] failed for', biz.id, e)
      }
    }

    await supabaseAdmin.from('cron_logs').update({
      status: 'completed', finished_at: new Date().toISOString(), businesses_processed: processed,
      errors: { total_customers_scored: totalScored, recommendations_created: totalRecs },
    }).eq('id', cronLogId)

    return NextResponse.json({ ok: true, businesses_processed: processed, customers_scored: totalScored, recommendations_created: totalRecs })
  } catch (e) {
    const msg = (e as Error).message
    await supabaseAdmin.from('cron_logs').update({ status: 'failed', finished_at: new Date().toISOString(), errors: { message: msg } }).eq('id', cronLogId)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
