export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { CustomerAcquisitionAgent } from '@/lib/agents/customer-acquisition-agent'

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== 'Bearer ' + process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: businesses } = await supabaseAdmin
    .from('businesses')
    .select('id')
    .eq('is_active', true)

  const agent = new CustomerAcquisitionAgent()
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
