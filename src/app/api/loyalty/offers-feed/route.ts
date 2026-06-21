export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { resolveBusinessId } from '@/lib/aria/resolve-business'
import { getLoyaltyMembership } from '@/lib/loyalty/auth'

// LOY-NETWORK (customer side) — READ-ONLY offers feed for the member's business. business_id selects
// the business; the caller must be a MEMBER there (identity-scoped), so there's no cross-business leak.
// Returns only ACTIVE, in-window offers.

export async function GET(req: Request) {
  const bidParam = new URL(req.url).searchParams.get('business_id')
  const realId = bidParam ? await resolveBusinessId(supabaseAdmin, bidParam) : null
  if (!realId) return NextResponse.json({ offers: null })
  const me = await getLoyaltyMembership(realId)
  if (!me) return NextResponse.json({ offers: null })

  const nowIso = new Date().toISOString()
  const { data } = await supabaseAdmin.from('loyalty_offers')
    .select('id, title, description, image_url, offer_type, point_cost')
    .eq('business_id', me.business_id)
    .eq('active', true)
    .or(`starts_at.is.null,starts_at.lte.${nowIso}`)
    .or(`ends_at.is.null,ends_at.gte.${nowIso}`)
    .order('created_at', { ascending: false })

  return NextResponse.json({ offers: data ?? [] })
}
