export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { NextResponse } from 'next/server'
import { verifyCronAuth } from '@/lib/auth/cron'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { LabourOptimisationAgent } from '@/lib/agents/labour-optimisation-agent'

export async function GET(req: Request) {
  const denied = verifyCronAuth(req)
  if (denied) return denied

  const { data: businesses } = await supabaseAdmin
    .from('businesses')
    .select('id')
    .in('subscription_status', ['active', 'trialing'])
    .eq('is_active', true)

  const agent = new LabourOptimisationAgent()
  const results: Array<{ business_id: string; ok: boolean; decisions: number; error?: string }> = []

  for (const biz of businesses ?? []) {
    try {
      const result = await Promise.race([
        agent.run(biz.id),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 55000)),
      ])
      results.push({ business_id: biz.id, ok: true, decisions: result.decisions.length })
    } catch (e) {
      results.push({ business_id: biz.id, ok: false, decisions: 0, error: String(e) })
    }
  }

  return NextResponse.json({
    ok: true,
    ran: results.length,
    succeeded: results.filter(r => r.ok).length,
    failed: results.filter(r => !r.ok).length,
  })
}
