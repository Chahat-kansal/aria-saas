export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { COMMUNITY_BUSINESS_CARD } from '@/lib/community/query-helpers'

// Public — browse the marketplace. Supports search + category filter + pagination.
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const limit = Math.min(60, Math.max(8, parseInt(searchParams.get('limit') ?? '24')))
    const before = searchParams.get('before')
    const category = searchParams.get('category')
    const search = searchParams.get('q')

    let q = supabaseAdmin.from('marketplace_listings')
      .select(`id, business_id, title, description, price, media_urls, category, created_at, ${COMMUNITY_BUSINESS_CARD}`)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(limit + 1)

    if (before) q = q.lt('created_at', before)
    if (category) q = q.eq('category', category)
    if (search && search.trim().length >= 2) {
      // Simple ILIKE on title + description (Phase 5 will upgrade to full-text)
      const s = search.trim().replace(/[%_]/g, '')
      q = q.or(`title.ilike.%${s}%,description.ilike.%${s}%`)
    }

    const { data: rows, error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    type Row = {
      id: string; business_id: string; title: string; description: string | null
      price: number | null; media_urls: string[]; category: string | null
      created_at: string
      businesses: { name: string | null; logo_url: string | null; community_verified: boolean | null; suburb: string | null; city: string | null } | null
    }
    const list = (rows ?? []) as unknown as Row[]
    const hasMore = list.length > limit
    const slice = hasMore ? list.slice(0, limit) : list

    return NextResponse.json({
      listings: slice.map(r => ({
        id: r.id,
        business_id: r.business_id,
        business: r.businesses,
        title: r.title,
        description: r.description,
        price: r.price,
        media_urls: r.media_urls ?? [],
        category: r.category,
        created_at: r.created_at,
      })),
      next_cursor: hasMore ? slice[slice.length - 1].created_at : null,
    })
  } catch (err) {
    console.error('[community/marketplace]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
