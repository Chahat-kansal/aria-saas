export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { resolveBusinessId } from '@/lib/aria/resolve-business'

export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const bid = await resolveBusinessId(supabaseAdmin, params.slug)
  if (!bid) return NextResponse.json({ offers: [] }, { status: 404 })

  const now = new Date().toISOString()
  const { data, error } = await supabaseAdmin
    .from('loyalty_offers')
    .select('id, title, description, image_url, offer_type, point_cost, starts_at, ends_at')
    .eq('business_id', bid)
    .eq('active', true)
    .or('starts_at.is.null,starts_at.lte.' + now)
    .or('ends_at.is.null,ends_at.gte.' + now)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ offers: [] })
  return NextResponse.json({ offers: data ?? [] })
}