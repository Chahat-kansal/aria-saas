export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { NextRequest } from 'next/server'
import { verifyCronAuth } from '@/lib/auth/cron'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { sendAlert } from '@/lib/monitoring/alert'

// MONITOR-1 — the actual silent-blank-page detector. BLANK-SCREEN-FIX-1/2's
// incident (a stale SW serving deleted JS chunks -> dead React tree) ran
// undetected for DAYS because server metrics (SSR, builds) stayed green —
// the failure only existed in real browsers. This is the check that would
// have caught it: fetch the live site headlessly (server metrics' own blind
// spot doesn't apply — this specifically checks what a REAL rendering
// browser would have signalled), and cross-reference against the hydration
// beacon ground truth.
//
// Signature: HTTP 200 (server thinks it's fine) + the CURRENT buildId is
// visibly present in the SSR'd HTML (so it's not just an old cached edge
// response) + ZERO hydration beacons for that buildId in the last N hours
// during AU waking hours (so real visitors should have produced some) =
// exactly the silent-blank pattern. Any one of those NOT holding is not
// this specific failure mode and is intentionally not alerted here.

const BEACON_WINDOW_HOURS = 6
// Minimum beacons expected in the window before flagging silence as
// meaningful — avoids false alarms on a genuinely quiet traffic period.
const MIN_EXPECTED_BEACONS = 1

function isAuWakingHoursUtc(now: Date): boolean {
  // AEST = UTC+10 (ignoring DST — a false positive/negative near the AEDT
  // boundary twice a year is an acceptable trade for staying simple).
  // AU waking hours ~6am-11pm AEST = UTC 20:00 (previous day) - UTC 13:00.
  const h = now.getUTCHours()
  return h >= 20 || h < 13
}

async function checkSilentBlank(appUrl: string): Promise<{
  skipped?: string
  httpOk: boolean
  buildIdFound: string | null
  beaconCount: number
  silentBlank: boolean
}> {
  const res = await fetch(appUrl, { cache: 'no-store', signal: AbortSignal.timeout(15_000) })
  const httpOk = res.status === 200
  const html = httpOk ? await res.text() : ''
  const match = html.match(/<meta\s+name="aria-build"\s+content="([^"]*)"/)
  const buildIdFound = match ? match[1] : null

  if (!httpOk || !buildIdFound || buildIdFound === 'unknown') {
    return { httpOk, buildIdFound, beaconCount: 0, silentBlank: false }
  }

  const since = new Date(Date.now() - BEACON_WINDOW_HOURS * 60 * 60 * 1000).toISOString()
  const { count } = await supabaseAdmin
    .from('client_hydration_beacons')
    .select('id', { count: 'exact', head: true })
    .eq('build_id', buildIdFound)
    .gte('created_at', since)

  const beaconCount = count ?? 0
  const silentBlank = beaconCount < MIN_EXPECTED_BEACONS
  return { httpOk, buildIdFound, beaconCount, silentBlank }
}

export async function GET(req: NextRequest) {
  const denied = verifyCronAuth(req)
  if (denied) return denied

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_URL ?? 'https://www.ariaos.site'
  const now = new Date()

  let result
  try {
    result = await checkSilentBlank(appUrl)
  } catch (e) {
    console.warn('[silent-blank-check] fetch/check failed:', (e as Error).message)
    return NextResponse.json({ ok: false, error: (e as Error).message })
  }

  const auWaking = isAuWakingHoursUtc(now)
  const shouldAlert = result.httpOk && !!result.buildIdFound && result.silentBlank && auWaking

  console.log('[silent-blank-check]', JSON.stringify({ ...result, auWaking, shouldAlert, at: now.toISOString() }))

  if (shouldAlert) {
    void sendAlert({
      title: 'Site may be silently blank for real visitors',
      summary: `HTTP 200 for buildId ${result.buildIdFound}, but only ${result.beaconCount} hydration beacon(s) in the last ${BEACON_WINDOW_HOURS}h. Server looks healthy; browsers may not be.`,
      severity: 'high',
      details: {
        buildId: result.buildIdFound,
        beaconCount: result.beaconCount,
        windowHours: BEACON_WINDOW_HOURS,
        checkedAt: now.toISOString(),
      },
    })
  }

  return NextResponse.json({ ok: true, ...result, auWaking, alerted: shouldAlert })
}
