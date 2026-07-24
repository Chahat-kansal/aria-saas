export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getCommunityMember } from '@/lib/community/session'
import { resolveBusinessId } from '@/lib/aria/resolve-business'

type Params = { params: Promise<{ id: string }> }
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SLUG_RE = /^[a-z0-9-]+$/

// CX-CLARITY-1 — persists the loop-explainer banner dismissal for LINKED members only (reuses the
// existing community_member_loyalty_links row rather than a new table). Anonymous/unlinked visitors
// use localStorage client-side instead — no server state exists for them, by design (see the task's
// own instruction). A no-op (200, ok:false) when unlinked is correct, not an error — the caller falls
// back to localStorage regardless.
export async function POST(_req: Request, { params }: Params) {
  const { id: idOrSlug } = await params
  if (!idOrSlug || (!UUID_RE.test(idOrSlug) && !SLUG_RE.test(idOrSlug))) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const businessId = await resolveBusinessId(supabaseAdmin, idOrSlug)
  if (!businessId) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const member = await getCommunityMember()
  if (!member) return NextResponse.json({ ok: false })

  const { error } = await supabaseAdmin.from('community_member_loyalty_links')
    .update({ banner_dismissed_at: new Date().toISOString() })
    .eq('member_id', member.id).eq('business_id', businessId)
  if (error) return NextResponse.json({ ok: false })
  return NextResponse.json({ ok: true })
}
