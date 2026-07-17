export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture, withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture'
import { computeVelocity, persistVelocity, readPersistedVelocity } from '@/lib/inventory/velocity'

// INV-VELOCITY-1 — owner/agent surface for product velocity + ABC. GET reads the latest persisted snapshot
// (bootstraps it on first use); POST recomputes + persists (idempotent on the day-bucketed scored_at).

async function _GET(_req: Request, _context: unknown, { businessId: bid }: BusinessContext) {
  let result = await readPersistedVelocity(supabaseAdmin, bid)
  if (!result) {
    // Bootstrap: compute + persist once so the surface is never empty after first deploy.
    const fresh = await computeVelocity(supabaseAdmin, bid)
    await persistVelocity(supabaseAdmin, bid, fresh)
    result = fresh
  }
  return NextResponse.json(result)
}

async function _POST(_req: Request, _context: unknown, { businessId: bid }: BusinessContext) {
  const result = await computeVelocity(supabaseAdmin, bid)
  await persistVelocity(supabaseAdmin, bid, result)
  return NextResponse.json({ ok: true, ...result })
}

export const GET = withBusinessContext('pos/inventory/velocity:get', _GET)
export const POST = withBusinessContext('pos/inventory/velocity:post', _POST)
