export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture, withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture'
import { fireKdsTickets } from '@/lib/pos/kds-fire'

async function _POST(req: Request, _context: unknown, { supabase, businessId: bid }: BusinessContext) {
  const body = await req.json().catch(() => ({}))
  const { sale_id, outlet_id, table_label } = body

  if (!sale_id) {
    return NextResponse.json({ error: 'sale_id required' }, { status: 400 })
  }

  // Verify sale belongs to this business
  const { data: sale } = await supabase.from('pos_sales').select('id').eq('id', sale_id).eq('business_id', bid).maybeSingle()
  if (!sale) return NextResponse.json({ error: 'Sale not found' }, { status: 404 })

  // KDS-FIX-1 — item identity is no longer accepted from the client at all; fireKdsTickets
  // re-queries the real sale_items server-side. See src/lib/pos/kds-fire.ts for why.
  const result = await fireKdsTickets(supabase, {
    business_id: bid,
    outlet_id: outlet_id ?? null,
    sale_id,
    table_label: table_label ?? null,
  })

  // KDS-FIX-1 — this route used to return HTTP 200 even when result.errors was non-empty, and
  // its only caller (the terminal) fires it via fetch(...).catch(() => {}), which never inspects
  // the response body — a real failure was completely invisible. Surface it now.
  if (result.errors.length > 0) {
    void supabaseAdmin.from('activity_log').insert({
      business_id: bid,
      action_type: 'kds_auto_fire_error',
      description: '[pos/kds/auto-fire] fireKdsTickets failed: ' + result.errors.join('; '),
      metadata: { sale_id, errors: result.errors },
      created_at: new Date().toISOString(),
    })
  }

  return NextResponse.json(result)
}

export const POST = withBusinessContext('pos/kds/auto-fire', _POST)
