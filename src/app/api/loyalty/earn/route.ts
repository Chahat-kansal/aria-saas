export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { customer_id, sale_total, points_earned } = body as {
    customer_id?: string; sale_total?: number; points_earned?: number
  }
  if (!customer_id) return NextResponse.json({ error: 'customer_id required' }, { status: 400 })

  const pts = points_earned ?? Math.floor((sale_total ?? 0))

  const { data: newPoints, error: rpcErr } = await supabaseAdmin
    .rpc('increment_numeric', { p_table: 'pos_customers', p_id: customer_id, p_column: 'loyalty_points', p_amount: pts })
  if (rpcErr) return NextResponse.json({ error: rpcErr.message }, { status: 500 })
  if (newPoints === null || newPoints === undefined) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })

  return NextResponse.json({ ok: true, points_earned: pts, total_points: newPoints })
}

export const POST = withErrorCapture('loyalty/earn', _POST)
