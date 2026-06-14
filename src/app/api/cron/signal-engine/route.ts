export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { NextResponse } from 'next/server'
import { verifyCronAuth } from '@/lib/auth/cron'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { runSignalsForBusiness } from '@/lib/aria/signal-runner'

export async function GET(req: Request) {
  const denied = verifyCronAuth(req)
  if (denied) return denied

  const cronLogId = crypto.randomUUID()
  const cronStart = Date.now()
  const DEADLINE_MS = 270_000  // 270s — 30s before Vercel's 300s limit
  await supabaseAdmin.from('cron_logs').insert({ id: cronLogId, job_name: 'signal-engine', status: 'running', started_at: new Date().toISOString() })

  try {
    const { data: businesses } = await supabaseAdmin
      .from('businesses')
      .select('id,name')
      .eq('is_active', true)
      .in('subscription_status', ['active', 'trialing'])

    if (!businesses?.length) {
      await supabaseAdmin.from('cron_logs').update({ status: 'completed', finished_at: new Date().toISOString(), businesses_processed: 0 }).eq('id', cronLogId)
      return NextResponse.json({ ok: true, count: 0 })
    }

    let processed = 0, totalSignals = 0, totalAlerts = 0
    const errors: Array<{ business_id: string; error: string }> = []

    const BATCH = 5
    for (let i = 0; i < businesses.length; i += BATCH) {
      // Stop gracefully if approaching deadline
      if (Date.now() - cronStart > DEADLINE_MS) {
        console.log('[signal-engine] deadline reached, stopping early at batch', i)
        break
      }
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
      status: errors.length > 0 ? 'failed' : 'completed',
      finished_at: new Date().toISOString(),
      businesses_processed: processed,
      errors: errors.length > 0 ? errors.map(e => `${e.business_id}: ${e.error}`) : [],
    }).eq('id', cronLogId)

    return NextResponse.json({ ok: true, processed, total_signals: totalSignals, total_alerts: totalAlerts, errors: errors.length })
  } catch (e) {
    const msg = (e as Error).message
    await supabaseAdmin.from('cron_logs').update({ status: 'failed', finished_at: new Date().toISOString(), errors: { message: msg } }).eq('id', cronLogId)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
