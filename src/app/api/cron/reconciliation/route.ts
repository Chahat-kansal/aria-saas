export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { NextResponse } from 'next/server'
import { verifyCronAuth } from '@/lib/auth/cron'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { ReconciliationAgent } from '@/lib/agents/reconciliation-agent'
import { getPaymentDrift, describeDrift, type DriftRow } from '@/lib/pos/payment-drift'

export async function GET(req: Request) {
  const denied = verifyCronAuth(req)
  if (denied) return denied

  const { data: businesses } = await supabaseAdmin
    .from('businesses')
    .select('id')
    .eq('is_active', true)

  const agent = new ReconciliationAgent()
  const yesterday = new Date(Date.now() - 86400000)
  let processed = 0
  let errors = 0

  // POS-INTEGRITY-1 §3 — the payment-drift check rides the existing daily reconciliation cron
  // rather than adding a function. Any incident is a completed sale whose recorded tender does not
  // add up to its total.
  const driftSummaries: Array<{ business_id: string; summary: string; incidents: DriftRow[] }> = []
  let driftIncidents = 0

  for (const biz of businesses ?? []) {
    try {
      const result = await agent.run(biz.id, yesterday)
      if (result.errors.length > 0) errors++
      processed++
    } catch { errors++ }

    // Separate try: a drift check must not be lost because the agent above threw, and a failed
    // drift check must not mark the agent's run as failed. They answer different questions.
    try {
      const since = new Date(Date.now() - 86400000).toISOString()
      const report = await getPaymentDrift(biz.id, since)
      if (report.incidents.length > 0) {
        driftIncidents += report.incidents.length
        console.error('[reconciliation] PAYMENT DRIFT', biz.id, describeDrift(report), JSON.stringify(report.incidents.slice(0, 20)))
      }
      driftSummaries.push({ business_id: biz.id, summary: describeDrift(report), incidents: report.incidents })
    } catch (e) {
      // Reported as unknown, never as "no drift" — a check that could not run has found nothing.
      driftSummaries.push({ business_id: biz.id, summary: 'Payment drift could not be checked: ' + (e as Error).message, incidents: [] })
    }
  }

  return NextResponse.json({
    ok: true, processed, errors,
    businesses: businesses?.length ?? 0,
    date: yesterday.toISOString().slice(0, 10),
    payment_drift: { incidents: driftIncidents, businesses: driftSummaries },
  })
}
