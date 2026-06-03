export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { WasteEliminationAgent } from '@/lib/agents/waste-elimination-agent'

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== 'Bearer ' + process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: businesses } = await supabaseAdmin
    .from('businesses')
    .select('id')
    .eq('is_active', true)

  const agent = new WasteEliminationAgent()
  let processed = 0

  for (const biz of businesses ?? []) {
    try {
      await agent.runEndOfDay(biz.id)
      processed++
    } catch { /* per-biz errors non-fatal */ }
  }

  return NextResponse.json({ ok: true, processed })
}
