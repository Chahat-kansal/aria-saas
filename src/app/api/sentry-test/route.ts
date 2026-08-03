import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
export const dynamic = 'force-dynamic'

// SEC-SENTRY-1 — this route was publicly reachable and threw on EVERY request, making it a free
// Sentry-quota drain and an unauthenticated noise generator. Now gated by the same secret and the
// same header as the existing /api/debug/sentry-test, so the two behave identically.
//
// The route is KEPT, not removed (RULE 0): it is still a working Sentry probe for anyone holding
// the secret. Unset secret = 403 (not configured); wrong secret = 404, so the endpoint's existence
// is not confirmed to an unauthenticated caller.
async function _GET(req: Request) {
  const secret = process.env.SENTRY_DEBUG_SECRET
  if (!secret) return NextResponse.json({ error: 'Debug endpoint not configured' }, { status: 403 })
  if (req.headers.get('x-debug-secret') !== secret) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  throw new Error('Sentry test error — safe to ignore')
}

export const GET = withErrorCapture('sentry-test', _GET)
