export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { runSignalsForBusiness } from '@/lib/aria/signal-runner'

export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const cronLogId = crypto.randomUUID()
  await supabaseAdmin.from('cron_logs').insert({ id: cronLogId, job_name: 'signal-engine', status: 'running', started_at: new Date().toISOString() })

  try {
    const { data: businesses } = await supabaseAdmin
      .from('businesses')
      .select('id,name')
      .eq('is_active', true)
      .in('subscription_status', ['active', 'trialing'])

    if (!businesses?.length) {
      await supabaseAdmin.from('cron_logs').update({ status: 'success', finished_at: new Date().toISOString(), businesses_processed: 0 }).eq('id', cronLogId)
      return NextResponse.json({ ok: true, count: 0 })
    }

    let processed = 0, totalSignals = 0, totalAlerts = 0
    const errors: Array<{ business_id: string; error: string }> = []

    const BATCH = 5
    for (let i = 0; i < businesses.length; i += BATCH) {
      const slice = businesses.slice(i, i + BATCH)
      const results = await Promise.allSettled(slice.map(b => runSignalsForBusiness(b.id)))
      for (let j = 0; j < results.length; j++) {
        const r = results[j]
        if (r.status === 'fulfilled') {
          processed++
          totalSignals += r.value.signal_count
          totalAlerts += r.value.alert_count
        } else {
          errors.push({ business_id: slice[j].id, error: String(r.reason).slice(0, 200) })
        }
      }
    }

    await supabaseAdmin.from('cron_logs').update({
      status: errors.length ? 'partial' : 'success',
      finished_at: new Date().toISOString(),
      businesses_processed: processed,
      errors: { items: errors, total_signals: totalSignals, total_alerts: totalAlerts },
    }).eq('id', cronLogId)

    return NextResponse.json({ ok: true, processed, total_signals: totalSignals, total_alerts: totalAlerts, errors: errors.length })
  } catch (e) {
    const msg = (e as Error).message
    await supabaseAdmin.from('cron_logs').update({ status: 'failed', finished_at: new Date().toISOString(), errors: { message: msg } }).eq('id', cronLogId)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
