export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { rotateAll } from '@/lib/kiosk/tokens'

const CRON_SECRET = process.env.CRON_SECRET ?? ''

// Daily at 04:00 AEST (18:00 UTC) — mint a fresh 5-day token per kiosk, retire expired ones.
async function _GET(req: Request) {
  const auth = req.headers.get('authorization') ?? ''
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const result = await rotateAll(supabaseAdmin)
  return NextResponse.json({ ok: true, ...result })
}

export const GET = withErrorCapture('cron/kiosk-token-rotate', _GET)
