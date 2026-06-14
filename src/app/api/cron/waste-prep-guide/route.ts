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
  const results: Array<{ business_id: string; errors: number }> = []

  for (const biz of businesses ?? []) {
    try {
      const result = await agent.run(biz.id)
      results.push({ business_id: biz.id, errors: result.errors.length })
    } catch { /* per-biz errors non-fatal */ }
  }

  return NextResponse.json({ ok: true, processed: results.length, results })
}
