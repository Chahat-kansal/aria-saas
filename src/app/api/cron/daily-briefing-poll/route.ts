export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { NextRequest, NextResponse } from 'next/server'
import { verifyCronAuth } from '@/lib/auth/cron'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { pollBatchResults } from '@/lib/aria-batch'
import { computeBatchCostCents } from '@/lib/aria/cost'
import { safeBriefingContent } from '@/lib/aria/briefing-guard'

type BatchResult = {
  custom_id: string
  result?: { type: string; message?: { content?: Array<{ type: string; text?: string }>; usage?: { input_tokens?: number; output_tokens?: number } } }
}

// AI-COST-2 — batch results were never logged to aria_ai_calls at all (AI-COST-AUDIT-1 §4: "no
// cost column exists on aria_batch_jobs" — the whole daily-briefing batch cost was invisible to
// the ledger). Batch results carry per-request token usage, so this is a real, non-estimated log.
async function logBatchCall(businessId: string, agentKey: string, inputTokens: number, outputTokens: number) {
  try {
    const cost = computeBatchCostCents('claude-haiku-4-5-20251001', inputTokens, outputTokens)
    const { error } = await supabaseAdmin.from('aria_ai_calls').insert({
      business_id: businessId, agent_key: agentKey, provider: 'anthropic',
      model_id: 'claude-haiku-4-5-20251001', role: 'analysis',
      input_tokens: inputTokens, output_tokens: outputTokens, cost_usd_cents: cost, success: true,
    })
    if (error) console.error(`[${agentKey}] aria_ai_calls insert failed:`, error.message)
  } catch (e) { console.error(`[${agentKey}] aria_ai_calls insert threw (non-fatal):`, (e as Error).message) }
}

export async function GET(req: NextRequest) {
  const denied = verifyCronAuth(req)
  if (denied) return denied

  const cronLogId = crypto.randomUUID()
  const cronStart = Date.now()
  const DEADLINE_MS = 270_000
  await supabaseAdmin.from('cron_logs').insert({ id: cronLogId, job_name: 'daily-briefing-poll', status: 'running', started_at: new Date().toISOString() })

  try {
    const { data: pending } = await supabaseAdmin
      .from('aria_batch_jobs')
      .select('*')
      .eq('job_type', 'daily_briefing')
      .in('status', ['submitted', 'processing'])

    if (!pending?.length) {
      await supabaseAdmin.from('cron_logs').update({ status: 'completed', finished_at: new Date().toISOString(), businesses_processed: 0 }).eq('id', cronLogId)
      return NextResponse.json({ ok: true, polled: 0 })
    }

    let processed = 0

    for (const batch of pending) {
      if (Date.now() - cronStart > DEADLINE_MS) {
        console.log('[briefing-poll] deadline reached, stopping early')
        break
      }
      const results = await pollBatchResults(batch.batch_id) as BatchResult[] | null

      if (!results) {
        await supabaseAdmin.from('aria_batch_jobs').update({ status: 'processing' }).eq('id', batch.id)
        continue
      }

      for (const r of results) {
        if (r.result?.type === 'succeeded') {
          const text = r.result.message?.content?.find(b => b.type === 'text')?.text ?? ''
          if (text && r.custom_id) {
            // BRIEF-INTEGRITY-1 part 1 — this write previously had ZERO validation between "what the
            // batch API returned" and "what gets stored". A malformed/refusal response that echoed
            // prompt text would have reached the owner verbatim. Same guard as every other write path.
            await supabaseAdmin.from('aria_daily_briefings').upsert({
              business_id: r.custom_id,
              briefing_date: new Date().toISOString().split('T')[0],
              content: safeBriefingContent(text),
              generated_at: new Date().toISOString(),
              source: 'batch_api',
            }, { onConflict: 'business_id,briefing_date' })
            const usage = r.result.message?.usage
            if (usage) await logBatchCall(r.custom_id, 'daily_briefing_batch', usage.input_tokens ?? 0, usage.output_tokens ?? 0)
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
      status: 'completed', finished_at: new Date().toISOString(),
      businesses_processed: processed,
    }).eq('id', cronLogId)

    return NextResponse.json({ ok: true, processed })
  } catch (e) {
    const msg = (e as Error).message
    await supabaseAdmin.from('cron_logs').update({ status: 'failed', finished_at: new Date().toISOString(), errors: { message: msg } }).eq('id', cronLogId)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
