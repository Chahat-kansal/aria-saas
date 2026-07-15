export const dynamic = 'force-dynamic'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

type Params = { params: Promise<{ id: string }> }

export async function POST(req: Request, { params }: Params) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: _ab } = await supabase.from('user_active_business').select('business_id').eq('user_id', user.id).maybeSingle()
  const bid = (_ab?.business_id as string) ?? null
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const { id } = await params
  const { qty = 1 } = await req.json().catch(() => ({}))

  // SECURITY-CRITICAL-1 — bid was computed above but never applied to either query (BUG-HUNT-1
  // Tier 0.4): any authenticated user could decrement any other business's batch by guessing its id.
  const { data: batch } = await supabase
    .from('pos_product_batches').select('id')
    .eq('id', id).eq('business_id', bid).maybeSingle()

  if (!batch) return NextResponse.json({ error: 'Batch not found' }, { status: 404 })

  // SECURITY-CRITICAL-2 item 2 — the prior read-then-write here (SELECT quantity_remaining,
  // compute newQty in JS, UPDATE) had a lost-update race: two concurrent decrements against the
  // same batch (two staff selling the last units of it at the same moment) could both read the
  // same starting value, and one decrement would silently overwrite the other — same bug class
  // INVENTORY-DECREMENT-FIX-1 hardened for pos_outlet_inventory, different table. Use the
  // existing atomic decrement_numeric RPC (floors at 0 inside the same UPDATE, already used by
  // orders/receive's increment_numeric sibling) so this is now a reliable single-statement
  // server-side decrement, not a compute-then-write race.
  const { error: rpcErr } = await supabase.rpc('decrement_numeric', {
    p_table: 'pos_product_batches', p_id: id, p_column: 'quantity_remaining', p_amount: qty,
  })
  if (rpcErr) {
    console.error('[product-batches/decrement] rpc failed:', rpcErr.message)
    return NextResponse.json({ error: rpcErr.message }, { status: 500 })
  }
  await supabase.from('pos_product_batches').update({ updated_at: new Date().toISOString() }).eq('id', id).eq('business_id', bid)

  const { data: updated } = await supabase
    .from('pos_product_batches').select('quantity_remaining')
    .eq('id', id).eq('business_id', bid).maybeSingle()

  return NextResponse.json({ ok: true, quantity_remaining: updated?.quantity_remaining ?? null })
}