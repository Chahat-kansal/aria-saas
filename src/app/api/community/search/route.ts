export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

// Public — unified search across businesses + marketplace listings.
//
// Query params:
//   q       — query string (required, >=2 chars)
//   type    — 'all' (default) | 'business' | 'listing'
//   limit   — max results per type (default 12, max 30)
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const qRaw = (searchParams.get('q') ?? '').trim()
    if (qRaw.length < 2) {
      return NextResponse.json({ businesses: [], listings: [], query: qRaw })
    }
    const type = searchParams.get('type') ?? 'all'
    const limit = Math.min(30, Math.max(4, parseInt(searchParams.get('limit') ?? '12')))

    // Sanitise for ILIKE pattern — strip wildcard chars so users can't run arbitrary patterns
    const q = qRaw.replace(/[%_]/g, '').slice(0, 100)
    const ilike = '%' + q + '%'

    type BusinessRow = { id: string; name: string | null; industry: string | null; suburb: string | null; city: string | null; logo_url: string | null; community_verified: boolean | null }
    type ListingRow = { id: string; business_id: string; title: string; description: string | null; price: number | null; media_urls: string[]; category: string | null; created_at: string; businesses: { name: string | null; logo_url: string | null; community_verified: boolean | null; suburb: string | null; city: string | null } | null }

    const businesses: BusinessRow[] = []
    const listings: ListingRow[] = []

    if (type === 'all' || type === 'business') {
      const { data } = await supabaseAdmin.from('businesses')
        .select('id, name, industry, suburb, city, logo_url, community_verified')
        // Match on name, industry, suburb, city — common search intents
        .or(`name.ilike.${ilike},industry.ilike.${ilike},suburb.ilike.${ilike},city.ilike.${ilike}`)
        .limit(limit)
      businesses.push(...((data ?? []) as BusinessRow[]))
    }

    if (type === 'all' || type === 'listing') {
      const { data } = await supabaseAdmin.from('marketplace_listings')
        .select('id, business_id, title, description, price, media_urls, category, created_at, businesses(name, logo_url, community_verified, suburb, city)')
        .eq('status', 'active')
        .or(`title.ilike.${ilike},description.ilike.${ilike},category.ilike.${ilike}`)
        .order('created_at', { ascending: false })
        .limit(limit)
      listings.push(...((data ?? []) as unknown as ListingRow[]))
    }

    return NextResponse.json({
      query: qRaw,
      businesses,
      listings,
    })
  } catch (err) {
    console.error('[community/search]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
