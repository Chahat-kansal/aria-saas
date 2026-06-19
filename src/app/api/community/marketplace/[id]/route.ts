export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { COMMUNITY_BUSINESS_CARD } from '@/lib/community/query-helpers'

type Params = { params: Promise<{ id: string }> }

// Public — single listing detail
export async function GET(_req: Request, { params }: Params) {
  try {
    const { id } = await params
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const { data } = await supabaseAdmin.from('marketplace_listings')
      .select(`id, business_id, title, description, price, media_urls, category, status, created_at, ${COMMUNITY_BUSINESS_CARD}`)
      .eq('id', id).maybeSingle()
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if ((data as { status: string }).status === 'hidden') return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ listing: data })
  } catch (err) {
    console.error('[community/marketplace/[id]]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
