export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getLoyaltyCustomer } from '@/lib/loyalty/auth'

// LOY-OFFERS (customer side) — READ-ONLY feed of the customer's business offers for the loyalty
// dashboard. Scoped ONLY to the signed-in customer's business via getLoyaltyCustomer() (no cross-
// business leak, no customer_id from the request). Returns only ACTIVE, in-window offers.

export async function GET() {
  const me = await getLoyaltyCustomer()
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
