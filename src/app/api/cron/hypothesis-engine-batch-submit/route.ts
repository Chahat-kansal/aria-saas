export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { NextResponse } from 'next/server'
import { verifyCronAuth } from '@/lib/auth/cron'
import { withCronRetry } from '@/lib/api/retry'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { submitBatch } from '@/lib/aria-batch'
import { buildHypothesisPrompt, HYPOTHESIS_SYSTEM } from '@/lib/aria/hypothesis/generate'

// AI-COST-2 — moves hypothesis_engine from a realtime per-business Haiku call (cron h15) to the
// Batch API pattern daily-briefing-submit already uses (AI-COST-AUDIT-1 §5.3: "small $ now,
// structural at 200 venues"). Same 50% batch discount, same submit-now/poll-later shape. Polled
// by hypothesis-engine-batch-poll, dispatched from h03 alongside daily-briefing-poll.
async function _GET() {
  const cronLogId = crypto.randomUUID()
  await supabaseAdmin.from('cron_logs').insert({ id: cronLogId, job_name: 'hypothesis-engine-batch-submit', status: 'running', started_at: new Date().toISOString() })

  try {
    const { data: businesses } = await supabaseAdmin
      .from('businesses')
      .select('id')
      .eq('is_active', true)
      .in('subscription_status', ['active', 'trialing'])

    if (!businesses?.length) {
      await supabaseAdmin.from('cron_logs').update({ status: 'completed', finished_at: new Date().toISOString(), businesses_processed: 0 }).eq('id', cronLogId)
      return NextResponse.json({ ok: true, count: 0 })
    }

    // AI-COST-2 — idempotency guard, same pattern/reasoning as daily-briefing-submit (AI-COST-AUDIT-1
    // §1 live risk). aria_batch_jobs' (job_type, submit_date) unique index is the hard backstop.
    const today = new Date().toISOString().slice(0, 10)
    const { data: alreadySubmitted } = await supabaseAdmin
      .from('aria_batch_jobs')
      .select('id, batch_id')
      .eq('job_type', 'hypothesis_engine')
      .eq('submit_date', today)
      .in('status', ['submitted', 'processing', 'completed'])
      .maybeSingle()
    if (alreadySubmitted) {
      console.warn('[hypothesis-engine-batch-submit] already submitted today — skipping duplicate submission', alreadySubmitted)
      await supabaseAdmin.from('cron_logs').update({
        status: 'completed', finished_at: new Date().toISOString(), businesses_processed: 0,
        errors: { message: 'idempotency guard: already submitted today', existing_batch_id: alreadySubmitted.batch_id },
      }).eq('id', cronLogId)
      return NextResponse.json({ ok: true, skipped: true, reason: 'already_submitted_today', batch_id: alreadySubmitted.batch_id })
    }

    const requests = await Promise.all(businesses.map(async biz => {
      const { prompt } = await buildHypothesisPrompt(biz.id)
      return {
        custom_id: biz.id,
        params: {
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 2048,
          system: HYPOTHESIS_SYSTEM,
          messages: [{ role: 'user' as const, content: prompt }],
        },
      }
    }))

    const batchId = await submitBatch(requests)

    const { error: insertErr } = await supabaseAdmin.from('aria_batch_jobs').insert({
      batch_id: batchId, job_type: 'hypothesis_engine',
      business_count: businesses.length, status: 'submitted',
    })
    if (insertErr && insertErr.code !== '23505') console.error('[hypothesis-engine-batch-submit] aria_batch_jobs insert failed:', insertErr.message)

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

async function _GETAuthed(req: Request) {
  const denied = verifyCronAuth(req)
  if (denied) return denied
  return _GET()
}

export const GET = withCronRetry('hypothesis-engine-batch-submit', _GETAuthed)
