export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { withErrorCapture, withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture'

async function _GET(req: Request, _context: unknown, { supabase, businessId: bid }: BusinessContext) {
  const url = new URL(req.url)
  const limit  = Math.min(Number(url.searchParams.get('limit'))  || 200, 500)
  const offset = Number(url.searchParams.get('offset')) || 0

  const { data: entries, error: e } = await supabase
    .from('activity_log')
    .select('id, action_type, description, metadata, created_at')
    .eq('business_id', bid)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (e) return NextResponse.json({ error: e.message }, { status: 500 })
  return NextResponse.json({ entries: entries ?? [] })
}

export const GET = withBusinessContext('pos/audit-log', _GET)