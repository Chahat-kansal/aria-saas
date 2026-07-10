export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { resolveBusinessId } from '@/lib/aria/resolve-business'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getCxSession } from '@/lib/cx/get-cx-session'
import { listLinkedCards, unlinkCard } from '@/lib/loyalty/card-link'
import { withErrorCapture } from '@/lib/api/with-error-capture'

// LOYALTY-LOOP-2 — customer-facing linked-card management. GET lists brand +
// last4 only (never the fingerprint — see card-link.ts's listLinkedCards).
// DELETE unlinks; ownership is enforced by scoping the delete to this
// session's own identity_id, so a customer can never unlink someone else's
// card. Unlink is customer-initiated ONLY — no staff/admin path exists.

async function _GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const bid = await resolveBusinessId(supabaseAdmin, params.slug)
  if (!bid) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const session = await getCxSession(req, bid)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const cards = await listLinkedCards({ businessId: bid, identityId: session.identity_id })
  return NextResponse.json({ cards })
}

async function _DELETE(req: NextRequest, { params }: { params: { slug: string } }) {
  const bid = await resolveBusinessId(supabaseAdmin, params.slug)
  if (!bid) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const session = await getCxSession(req, bid)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { link_id } = await req.json().catch(() => ({})) as { link_id?: string }
  if (!link_id) return NextResponse.json({ error: 'link_id required' }, { status: 400 })

  const ok = await unlinkCard({ businessId: bid, identityId: session.identity_id, linkId: link_id })
  if (!ok) return NextResponse.json({ error: 'Unlink failed' }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export const GET = withErrorCapture('public/cx/linked-cards', _GET)
export const DELETE = withErrorCapture('public/cx/linked-cards', _DELETE)
