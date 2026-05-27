export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

type Params = { params: Promise<{ id: string }> }

// Public — returns only safe public business fields. No owner data, no PII.
export async function GET(_req: Request, { params }: Params) {
  try {
    const { id } = await params
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const { data } = await supabaseAdmin
      .from('businesses')
      .select('id, name, industry, city, suburb, logo_url, website')
      .eq('id', id)
      .maybeSingle()
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ business: data })
  } catch (err) {
    console.error('[community/businesses GET]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
