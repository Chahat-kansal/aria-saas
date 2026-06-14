export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { NextResponse } from 'next/server'
import { verifyCronAuth } from '@/lib/auth/cron'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { AeoMonitor } from '@/lib/agents/aeo-monitor'

export async function GET(req: Request) {
  const denied = verifyCronAuth(req)
  if (denied) return denied

  const { data: businesses } = await supabaseAdmin
    .from('businesses')
    .select('id')
    .eq('is_active', true)

  const monitor = new AeoMonitor()
  let processed = 0
  let errors = 0

  for (const biz of businesses ?? []) {
    try {
      await monitor.runForBusiness(biz.id)
      processed++
    } catch { errors++ }
  }

  return NextResponse.json({ ok: true, processed, errors, businesses: businesses?.length ?? 0 })
}
