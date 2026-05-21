export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { generateHypothesesForBusiness, persistHypotheses } from '@/lib/aria/hypothesis/generate'

export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const cronLogId = crypto.randomUUID()
  await supabaseAdmin.from('cron_logs').insert({
    id: cronLogId, job_name: 'hypothesis-engine', status: 'running', started_at: new Date().toISOString(),
  })

  try {
    const { data: businesses } = await supabaseAdmin
      .from('businesses')
      .select('id')
      .eq('is_active', true)
      .in('subscription_status', ['active', 'trialing'])

    if (!businesses || businesses.length === 0) {
      await supabaseAdmin.from('cron_logs').update({ status: 'completed', finished_at: new Date().toISOString(), businesses_processed: 0, errors: { total_hypotheses: 0 } }).eq('id', cronLogId)
      return NextResponse.json({ ok: true, count: 0 })
    }

    let processed = 0, totalHypotheses = 0
    const errors: Array<{ business_id: string; error: string }> = []

    const DEADLINE_MS = 260_000  // 260s — stop before Vercel's 300s kill
    const cronStart = Date.now()
    for (const biz of businesses) {
      if (Date.now() - cronStart > DEADLINE_MS) {
        errors.push({ business_id: 'deadline', error: 'Stopped early — approaching Vercel timeout' })
        break
      }
      try {
        const { hypotheses, evidence_payload } = await generateHypothesesForBusiness(biz.id)
        const inserted = await persistHypotheses(biz.id, hypotheses, evidence_payload)
        totalHypotheses += inserted
        processed++
      } catch (e) {
        errors.push({ business_id: biz.id, error: (e as Error).message.slice(0, 200) })
      }
    }

    await supabaseAdmin.from('cron_logs').update({
      status: errors.length > 0 ? 'failed' : 'completed',
      finished_at: new Date().toISOString(),
      businesses_processed: processed,
      errors: { total_hypotheses: totalHypotheses, ...(errors.length ? { items: errors } : {}) },
    }).eq('id', cronLogId)

    return NextResponse.json({ ok: true, businesses_processed: processed, hypotheses_generated: totalHypotheses })
  } catch (e) {
    const msg = (e as Error).message
    await supabaseAdmin.from('cron_logs').update({ status: 'failed', finished_at: new Date().toISOString(), errors: { message: msg } }).eq('id', cronLogId)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
