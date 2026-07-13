export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { NextRequest, NextResponse } from 'next/server'
import { verifyCronAuth } from '@/lib/auth/cron'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { pollBatchResults } from '@/lib/aria-batch'
import { buildHypothesisPrompt, parseHypothesesFromText, persistHypotheses } from '@/lib/aria/hypothesis/generate'
import { computeBatchCostCents } from '@/lib/aria/cost'

type BatchResult = {
  custom_id: string
  result?: { type: string; message?: { content?: Array<{ type: string; text?: string }>; usage?: { input_tokens?: number; output_tokens?: number } } }
}

// AI-COST-2 — same reasoning as daily-briefing-poll's logBatchCall: batch results were never
// logged to aria_ai_calls at all (AI-COST-AUDIT-1 §4). Real per-request token usage, not estimated.
async function logBatchCall(businessId: string, inputTokens: number, outputTokens: number) {
  try {
    const cost = computeBatchCostCents('claude-haiku-4-5-20251001', inputTokens, outputTokens)
    const { error } = await supabaseAdmin.from('aria_ai_calls').insert({
      business_id: businessId, agent_key: 'hypothesis_engine_batch', provider: 'anthropic',
      model_id: 'claude-haiku-4-5-20251001', role: 'analysis',
      input_tokens: inputTokens, output_tokens: outputTokens, cost_usd_cents: cost, success: true,
    })
    if (error) console.error('[hypothesis_engine_batch] aria_ai_calls insert failed:', error.message)
  } catch (e) { console.error('[hypothesis_engine_batch] aria_ai_calls insert threw (non-fatal):', (e as Error).message) }
}

// AI-COST-2 — poll side of hypothesis-engine's Batch API conversion (see hypothesis-engine-batch-submit).
// Dispatched from h03 alongside daily-briefing-poll, same safe ~11h submit-to-poll margin.
export async function GET(req: NextRequest) {
  const denied = verifyCronAuth(req)
  if (denied) return denied

  const cronLogId = crypto.randomUUID()
  const cronStart = Date.now()
  const DEADLINE_MS = 270_000
  await supabaseAdmin.from('cron_logs').insert({ id: cronLogId, job_name: 'hypothesis-engine-batch-poll', status: 'running', started_at: new Date().toISOString() })

  try {
    const { data: pending } = await supabaseAdmin
      .from('aria_batch_jobs')
      .select('*')
      .eq('job_type', 'hypothesis_engine')
      .in('status', ['submitted', 'processing'])

    if (!pending?.length) {
      await supabaseAdmin.from('cron_logs').update({ status: 'completed', finished_at: new Date().toISOString(), businesses_processed: 0 }).eq('id', cronLogId)
      return NextResponse.json({ ok: true, polled: 0 })
    }

    let processed = 0
    let totalHypotheses = 0

    for (const batch of pending) {
      if (Date.now() - cronStart > DEADLINE_MS) {
        console.log('[hypothesis-engine-batch-poll] deadline reached, stopping early')
        break
      }
      const results = await pollBatchResults(batch.batch_id) as BatchResult[] | null

      if (!results) {
        await supabaseAdmin.from('aria_batch_jobs').update({ status: 'processing' }).eq('id', batch.id)
        continue
      }

      for (const r of results) {
        if (r.result?.type !== 'succeeded' || !r.custom_id) continue
        const text = r.result.message?.content?.find(b => b.type === 'text')?.text ?? ''
        if (!text) continue
        try {
          const hypotheses = parseHypothesesFromText(r.custom_id, text)
          if (hypotheses.length === 0) continue
          // Re-derive evidence_payload at poll time (cheap, DB-only) rather than stashing it at
          // submit time — batch turnaround is typically well under the ~11h submit-to-poll window,
          // so this stays a close-enough snapshot, and it avoids a second storage mechanism.
          const { evidence_payload } = await buildHypothesisPrompt(r.custom_id)
          const inserted = await persistHypotheses(r.custom_id, hypotheses, evidence_payload)
          totalHypotheses += inserted
          const usage = r.result.message?.usage
          if (usage) await logBatchCall(r.custom_id, usage.input_tokens ?? 0, usage.output_tokens ?? 0)
          processed++
        } catch (e) {
          console.error('[hypothesis-engine-batch-poll] failed for', r.custom_id, (e as Error).message)
        }
      }

      await supabaseAdmin.from('aria_batch_jobs').update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        results_processed: results.filter(r => r.result?.type === 'succeeded').length,
      }).eq('id', batch.id)
    }

    await supabaseAdmin.from('cron_logs').update({
      status: 'completed', finished_at: new Date().toISOString(),
      businesses_processed: processed,
      errors: { total_hypotheses: totalHypotheses },
    }).eq('id', cronLogId)

    return NextResponse.json({ ok: true, processed, hypotheses_generated: totalHypotheses })
  } catch (e) {
    const msg = (e as Error).message
    await supabaseAdmin.from('cron_logs').update({ status: 'failed', finished_at: new Date().toISOString(), errors: { message: msg } }).eq('id', cronLogId)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
