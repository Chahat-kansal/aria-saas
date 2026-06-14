export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

import { NextResponse } from 'next/server'
import { verifyCronAuth } from '@/lib/auth/cron'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { rotateAll } from '@/lib/kiosk/tokens'


// Daily at 04:00 AEST (18:00 UTC) — mint a fresh 5-day token per kiosk, retire expired ones.
async function _GET(req: Request) {
  const denied = verifyCronAuth(req)
  if (denied) return denied
  const result = await rotateAll(supabaseAdmin)
  return NextResponse.json({ ok: true, ...result })
}

export const GET = withErrorCapture('cron/kiosk-token-rotate', _GET)
