export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { NextResponse } from 'next/server'
import { verifyCronAuth } from '@/lib/auth/cron'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { ReputationDefenceAgent } from '@/lib/agents/reputation-defence-agent'
import { runTrainingReminders } from '@/lib/training/reminders'

export async function GET(req: Request) {
  const denied = verifyCronAuth(req)
  if (denied) return denied

  const { data: businesses } = await supabaseAdmin
    .from('businesses')
    .select('id')
    .eq('is_active', true)

  const agent = new ReputationDefenceAgent()
  let processed = 0
  let errors = 0

  for (const biz of businesses ?? []) {
    try {
      const result = await agent.run(biz.id)
      if (result.errors.length > 0) errors++
      processed++
    } catch { errors++ }
  }

  // TP-7 — piggyback the daily training reminders on this existing daily cron (no new vercel cron
  // entry). Isolated in try/catch so it can never break the reputation job.
  let trainingNotified = 0
  try { const r = await runTrainingReminders(); trainingNotified = r.businesses_notified } catch (e) { console.error('[training reminders] failed', (e as Error).message) }

  return NextResponse.json({ ok: true, processed, errors, businesses: businesses?.length ?? 0, training_notified: trainingNotified })
}
