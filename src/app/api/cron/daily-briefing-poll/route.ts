export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { pollBatchResults } from '@/lib/aria-batch'

type BatchResult = {
  custom_id: string
  result?: { type: string; message?: { content?: Array<{ type: string; text?: string }> } }
}

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const cronLogId = crypto.randomUUID()
  await supabaseAdmin.from('cron_logs').insert({ id: cronLogId, job_name: 'daily-briefing-poll', status: 'running', started_at: new Date().toISOString() })

  try {
    const { data: pending } = await supabaseAdmin
      .from('aria_batch_jobs')
      .select('*')
      .eq('job_type', 'daily_briefing')
      .in('status', ['submitted', 'processing'])

    if (!pending?.length) {
      await supabaseAdmin.from('cron_logs').update({ status: 'success', finished_at: new Date().toISOString(), businesses_processed: 0 }).eq('id', cronLogId)
      return NextResponse.json({ ok: true, polled: 0 })
    }

    let processed = 0

    for (const batch of pending) {
      const results = await pollBatchResults(batch.batch_id) as BatchResult[] | null

      if (!results) {
        await supabaseAdmin.from('aria_batch_jobs').update({ status: 'processing' }).eq('id', batch.id)
        continue
      }

      for (const r of results) {
        if (r.result?.type === 'succeeded') {
          const text = r.result.message?.content?.find(b => b.type === 'text')?.text ?? ''
          if (text && r.custom_id) {
            await supabaseAdmin.from('aria_daily_briefings').upsert({
              business_id: r.custom_id,
              briefing_date: new Date().toISOString().split('T')[0],
              content: text,
              generated_at: new Date().toISOString(),
              source: 'batch_api',
            }, { onConflict: 'business_id,briefing_date' })
            processed++
          }
        }
      }

      await supabaseAdmin.from('aria_batch_jobs').update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        results_processed: results.filter(r => r.result?.type === 'succeeded').length,
      }).eq('id', batch.id)
    }

    await supabaseAdmin.from('cron_logs').update({
      status: 'success', finished_at: new Date().toISOString(),
      businesses_processed: processed,
    }).eq('id', cronLogId)

    return NextResponse.json({ ok: true, processed })
  } catch (e) {
    const msg = (e as Error).message
    await supabaseAdmin.from('cron_logs').update({ status: 'failed', finished_at: new Date().toISOString(), errors: { message: msg } }).eq('id', cronLogId)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
