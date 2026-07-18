export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture'

// GET /api/pos/loyalty/checkins?outlet_id=xxx
// Returns active (unexpired + unconsumed) check-ins for this outlet.
// Staff auth required.
async function _GET(req: Request, _context: unknown, { businessId: bid }: BusinessContext) {
  const url = new URL(req.url)
  const outletId = url.searchParams.get('outlet_id')

  const now = new Date().toISOString()

  let query = supabaseAdmin
    .from('loyalty_checkins')
    .select('id, loyalty_identity_id, customer_id, outlet_id, created_at, expires_at')
    .eq('business_id', bid)
    .is('consumed_at', null)
    .gt('expires_at', now)
    .order('created_at', { ascending: false })
    .limit(20)

  if (outletId) {
    query = query.eq('outlet_id', outletId)
  }

  const { data: rows, error } = await query

  if (error) {
    console.error('[pos/loyalty/checkins] query error:', error.message)
    return NextResponse.json({ checkins: [] })
  }

  if (!rows || rows.length === 0) return NextResponse.json({ checkins: [] })

  // Resolve customer names for display
  const customerIds = rows
    .map(r => (r as { customer_id?: string | null }).customer_id)
    .filter(Boolean) as string[]

  const { data: customers } = customerIds.length > 0
    ? await supabaseAdmin
        .from('pos_customers')
        .select('id, name, points_balance, stamps_count, loyalty_tier')
        .in('id', customerIds)
    : { data: [] }

  type CustRow = { id: string; name: string | null; points_balance: number | null; stamps_count: number | null; loyalty_tier: string | null }
  const custMap = new Map<string, CustRow>()
  for (const c of (customers ?? []) as CustRow[]) custMap.set(c.id, c)

  type CheckinRow = { id: string; loyalty_identity_id: string; customer_id: string | null; outlet_id: string | null; created_at: string; expires_at: string }

  const checkins = (rows as CheckinRow[]).map(r => {
    const cust = r.customer_id ? custMap.get(r.customer_id) : null
    const secondsLeft = Math.max(0, Math.round((new Date(r.expires_at).getTime() - Date.now()) / 1000))
    return {
      id: r.id,
      customer_id: r.customer_id,
      // LOYALTY-FINISH — was fetched above but dropped before the response,
      // so the POS attach path had no way to call the canonical resolver
      // (which resolves by loyalty_identity_id, not pos_customers.id).
      loyalty_identity_id: r.loyalty_identity_id,
      name: cust?.name ?? 'Member',
      points_balance: Number(cust?.points_balance ?? 0),
      stamps_count: Number(cust?.stamps_count ?? 0),
      loyalty_tier: cust?.loyalty_tier ?? null,
      outlet_id: r.outlet_id,
      created_at: r.created_at,
      expires_in_seconds: secondsLeft,
    }
  })

  return NextResponse.json({ checkins })
}

// POST /api/pos/loyalty/checkins — mark a check-in consumed (POS attaches the customer)
async function _POST(req: Request, _context: unknown, { businessId: bid }: BusinessContext) {
  const { checkin_id, sale_id } = await req.json().catch(() => ({})) as { checkin_id?: string; sale_id?: string }
  if (!checkin_id) return NextResponse.json({ error: 'checkin_id required' }, { status: 400 })

  const { error } = await supabaseAdmin
    .from('loyalty_checkins')
    .update({
      consumed_at: new Date().toISOString(),
      consumed_sale_id: sale_id ?? null,
    })
    .eq('id', checkin_id)
    .eq('business_id', bid)
    .is('consumed_at', null)

  if (error) {
    console.error('[pos/loyalty/checkins POST] update error:', error.message)
    return NextResponse.json({ error: 'Failed to consume check-in' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

export const GET = withBusinessContext('pos/loyalty/checkins', _GET)
export const POST = withBusinessContext('pos/loyalty/checkins', _POST)