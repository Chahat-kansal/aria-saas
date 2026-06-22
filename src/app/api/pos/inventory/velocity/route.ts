export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { computeVelocity, persistVelocity, readPersistedVelocity } from '@/lib/inventory/velocity'

// INV-VELOCITY-1 — owner/agent surface for product velocity + ABC. GET reads the latest persisted snapshot
// (bootstraps it on first use); POST recomputes + persists (idempotent on the day-bucketed scored_at).

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _GET() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  let result = await readPersistedVelocity(supabaseAdmin, bid)
  if (!result) {
    // Bootstrap: compute + persist once so the surface is never empty after first deploy.
    const fresh = await computeVelocity(supabaseAdmin, bid)
    await persistVelocity(supabaseAdmin, bid, fresh)
    result = fresh
  }
  return NextResponse.json(result)
}

async function _POST() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const result = await computeVelocity(supabaseAdmin, bid)
  await persistVelocity(supabaseAdmin, bid, result)
  return NextResponse.json({ ok: true, ...result })
}

export const GET = withErrorCapture('pos/inventory/velocity:get', _GET)
export const POST = withErrorCapture('pos/inventory/velocity:post', _POST)
