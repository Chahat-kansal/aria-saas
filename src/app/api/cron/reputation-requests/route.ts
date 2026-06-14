export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { NextResponse } from 'next/server'
import { verifyCronAuth } from '@/lib/auth/cron'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { ReputationDefenceAgent } from '@/lib/agents/reputation-defence-agent'

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

  return NextResponse.json({ ok: true, processed, errors, businesses: businesses?.length ?? 0 })
}
