export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { InventoryFinancingAgent } from '@/lib/agents/inventory-financing-agent'

export async function GET(req: Request) {
  const auth = req.headers.get('authorization')
  if (auth !== 'Bearer ' + process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: businesses } = await supabaseAdmin
    .from('businesses')
    .select('id')
    .eq('is_active', true)
    .limit(100)

  if (!businesses?.length) return NextResponse.json({ ok: true, ran: 0 })

  const agent = new InventoryFinancingAgent()
  let succeeded = 0
  let failed = 0

  for (const biz of businesses) {
    try {
      await agent.run(biz.id)
      succeeded++
    } catch (e) {
      console.error('[cron/inventory-financing] error for', biz.id, e)
      failed++
    }
  }

  return NextResponse.json({ ok: true, ran: succeeded, failed })
}
