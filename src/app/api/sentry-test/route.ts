import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
export const dynamic = 'force-dynamic'
async function _GET() {
  throw new Error('Sentry test error — safe to ignore')
  return NextResponse.json({ ok: true }) // unreachable
}

export const GET = withErrorCapture('sentry-test', _GET)
