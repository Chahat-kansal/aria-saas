export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { revokeSession } from '@/lib/staff-portal/session'

// SECURITY-P2 — session hygiene review (P1 §8) found no logout route existed at all for the
// staff portal: a client "logging out" only discarded the token locally, leaving it valid
// server-side for the remainder of its 4h TTL. Mirrors the CX session logout pattern
// (src/app/api/cx/[slug]/auth/route.ts, action: 'logout').
async function _POST(req: Request) {
  const token = req.headers.get('x-portal-token')?.trim()
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  await revokeSession(token)
  return NextResponse.json({ ok: true })
}

export const POST = withErrorCapture('staff-portal/logout', _POST)
