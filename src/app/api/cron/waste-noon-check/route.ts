export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { NextResponse } from 'next/server'
import { verifyCronAuth } from '@/lib/auth/cron'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { WasteEliminationAgent } from '@/lib/agents/waste-elimination-agent'

export async function GET(req: Request) {
  const denied = verifyCronAuth(req)
  if (denied) return denied

  const { data: businesses } = await supabaseAdmin
    .from('businesses')
    .select('id')
    .eq('is_active', true)

  const agent = new WasteEliminationAgent()
  let processed = 0

  for (const biz of businesses ?? []) {
    try {
      await agent.runNoonCheck(biz.id)
      processed++
    } catch { /* per-biz errors non-fatal */ }
  }

  return NextResponse.json({ ok: true, processed })
}
