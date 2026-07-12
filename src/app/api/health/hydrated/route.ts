export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

// MONITOR-1 — ground-truth "a real browser actually rendered us" signal.
// BLANK-SCREEN-FIX-1/2 fixed a stale-SW blank page that ran undetected for
// DAYS because server metrics (SSR, builds) stayed green — the failure only
// existed in real browsers. HydrationBeacon (mounted on the landing page and
// the /dashboard shell) calls navigator.sendBeacon() here ONLY after a
// successful client-side hydration/mount — if hydration dies, this endpoint
// is simply never hit, which IS the detection signal the synthetic check
// (silent-blank-check) looks for.
//
// Deliberately minimal: no auth (sendBeacon can't attach one; this is a
// low-value, high-volume ping, not a sensitive write), no per-visitor
// identity captured, fire-and-forget from the client's perspective.

interface BeaconBody { path?: string; buildId?: string }

export async function POST(req: Request) {
  let body: BeaconBody = {}
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  const path = typeof body.path === 'string' ? body.path.slice(0, 200) : '/'
  const buildId = typeof body.buildId === 'string' ? body.buildId.slice(0, 100) : ''
  if (!buildId) return NextResponse.json({ ok: false }, { status: 400 })

  try {
    await supabaseAdmin.from('client_hydration_beacons').insert({ path, build_id: buildId })
  } catch (e) {
    // Never let a beacon-write hiccup surface as an error to the browser —
    // sendBeacon doesn't wait for/read the response anyway.
    console.warn('[health/hydrated] insert failed:', (e as Error).message)
  }

  // Cheap opportunistic retention (no new cron for this) — ~1 in 200 beacons
  // also prunes rows older than 14 days, so this table doesn't grow forever.
  if (Math.random() < 0.005) {
    try {
      const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
      await supabaseAdmin.from('client_hydration_beacons').delete().lt('created_at', cutoff)
    } catch { /* best-effort */ }
  }

  return NextResponse.json({ ok: true })
}
