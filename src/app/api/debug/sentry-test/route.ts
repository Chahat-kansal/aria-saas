export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import * as Sentry from '@sentry/nextjs'

// Guard: require SENTRY_DEBUG_SECRET env var + matching x-debug-secret header.
// This route is permanent (for future Sentry verification) but not publicly exploitable.
export async function GET(req: Request) {
  const secret = process.env.SENTRY_DEBUG_SECRET
  if (!secret) {
    return Response.json({ error: 'Debug endpoint not configured' }, { status: 403 })
  }
  const header = req.headers.get('x-debug-secret')
  if (header !== secret) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    throw new Error('PRR-3 Sentry test — server')
  } catch (e) {
    Sentry.captureException(e, {
      tags: { route: 'debug/sentry-test', operation: 'prr3_verification' },
    })
    await Sentry.flush(2000)
  }

  return Response.json({ sent: true, timestamp: new Date().toISOString() })
}
