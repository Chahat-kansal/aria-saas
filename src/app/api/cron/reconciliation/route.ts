export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { ReconciliationAgent } from '@/lib/agents/reconciliation-agent'

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== 'Bearer ' + process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: businesses } = await supabaseAdmin
    .from('businesses')
    .select('id')
    .eq('is_active', true)

  const agent = new ReconciliationAgent()
  const yesterday = new Date(Date.now() - 86400000)
  let processed = 0
  let errors = 0

  for (const biz of businesses ?? []) {
    try {
      const result = await agent.run(biz.id, yesterday)
      if (result.errors.length > 0) errors++
      processed++
    } catch { errors++ }
  }

  return NextResponse.json({ ok: true, processed, errors, businesses: businesses?.length ?? 0, date: yesterday.toISOString().slice(0, 10) })
}
