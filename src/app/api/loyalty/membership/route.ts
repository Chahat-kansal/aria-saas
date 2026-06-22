export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { resolveBusinessId } from '@/lib/aria/resolve-business'
import { getLoyaltyIdentity, getLoyaltyMembership } from '@/lib/loyalty/auth'
import { linkOrCreateMembership } from '@/lib/loyalty/membership'

// LOY-NETWORK — membership status + join for the signed-in identity at a given business.
// Customer-session auth only (identity cookie). Per-business scoping; no cross-identity access.

async function bizName(businessId: string): Promise<string> {
  const { data } = await supabaseAdmin.from('businesses').select('name').eq('id', businessId).maybeSingle()
  return (data?.name as string) ?? 'this business'
}

// GET ?business_id=… → is the signed-in identity a member of this business?
export async function GET(req: Request) {
  const identity = await getLoyaltyIdentity()
  const bidParam = new URL(req.url).searchParams.get('business_id')
  const realId = bidParam ? await resolveBusinessId(supabaseAdmin, bidParam) : null
  if (!realId) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const name = await bizName(realId)
  if (!identity) return NextResponse.json({ signed_in: false, member: false, business_name: name })
  const m = await getLoyaltyMembership(realId)
  return NextResponse.json({ signed_in: true, member: !!m, name: m?.name ?? null, business_name: name })
}

// POST { business_id, name?, ref? } → join: link/create this identity's membership at the business.
// LOY-REFERRALS: if `ref` (a referral code) is present, record a pending referral for this new member.
export async function POST(req: Request) {
  const identity = await getLoyaltyIdentity()
  if (!identity) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const body = await req.json().catch(() => ({})) as { business_id?: string; name?: string; ref?: string }
  const realId = body.business_id ? await resolveBusinessId(supabaseAdmin, String(body.business_id)) : null
  if (!realId) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const providedName = typeof body.name === 'string' ? body.name : ''
  const m = await linkOrCreateMembership(identity.id, realId, { email: identity.email, phone: identity.phone }, providedName)

  if (typeof body.ref === 'string' && body.ref.trim()) {
    try {
      const { captureReferral } = await import('@/lib/loyalty/referrals')
      await captureReferral(realId, body.ref, { customer_id: m.customer_id, identity_id: identity.id, email: identity.email, phone: identity.phone })
    } catch (e) { console.error('[membership] referral capture failed:', e) }
  }
  return NextResponse.json({ ok: true, name: m.name })
}
