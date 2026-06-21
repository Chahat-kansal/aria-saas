export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store' // parameterless query — never serve a cached (stale) list

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

// LOY-NETWORK — public directory of businesses with loyalty self-enrolment enabled. Returns only
// safe public fields; no customer data. The customer picks one to view/join its loyalty programme.
export async function GET() {
  const { data: configs } = await supabaseAdmin.from('pos_loyalty_config')
    .select('business_id, enrol_page_slug')
    .eq('public_enrol_enabled', true)
  const ids = (configs ?? []).map(c => c.business_id as string)
  if (ids.length === 0) return NextResponse.json({ businesses: [] })

  const slugByBiz = new Map((configs ?? []).map(c => [c.business_id as string, (c.enrol_page_slug as string | null) ?? null]))
  const { data: bizes } = await supabaseAdmin.from('businesses')
    .select('id, name, industry, suburb, city, logo_url')
    .in('id', ids)
    .eq('is_active', true)
    .order('name', { ascending: true })

  const businesses = (bizes ?? []).map(b => ({
    id: b.id, name: b.name, industry: b.industry ?? null,
    suburb: b.suburb ?? b.city ?? null, logo_url: b.logo_url ?? null,
    slug: slugByBiz.get(b.id as string) ?? null,
  }))
  return NextResponse.json({ businesses })
}
