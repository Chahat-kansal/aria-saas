export const dynamic = 'force-dynamic'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

type Params = { params: Promise<{ id: string }> }

export async function POST(req: Request, { params }: Params) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { qty = 1 } = await req.json().catch(() => ({}))

  const { data: batch } = await supabase
    .from('pos_product_batches').select('quantity_remaining')
    .eq('id', id).maybeSingle()

  if (!batch) return NextResponse.json({ error: 'Batch not found' }, { status: 404 })

  const newQty = Math.max(0, (batch.quantity_remaining || 0) - qty)
  await supabase.from('pos_product_batches')
    .update({ quantity_remaining: newQty, updated_at: new Date().toISOString() })
    .eq('id', id)

  return NextResponse.json({ ok: true, quantity_remaining: newQty })
}